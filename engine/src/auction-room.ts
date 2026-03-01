import type { Env } from './index'
import type {
  RoomSnapshot,
  RoomConfigEnvelope,
  ValidatedAction,
  AuctionEvent,
  ActionRequest,
} from './types/engine'
import { ActionType } from './types/engine'
import { computeEventHash, computePayloadHash, ZERO_HASH } from './lib/crypto'
import { toHex, toBytes, keccak256, encodePacked } from 'viem'
import { validateAction, commitValidationMutation, type ValidationContext } from './handlers/actions'
import type { AuctionSettlementPacket } from './types/contracts'
import { ensureAuctionOnChain, recordResultOnChain, signSettlementPacket } from './lib/settlement'
import { signInclusionReceipt } from './lib/inclusion-receipt'
import { enforceJoinBondObservation } from './lib/bond-watcher'
import { serializeReplayBundle, computeContentHash } from './lib/replay-bundle'

/** Zero hash as 0x-prefixed hex string (32 zero bytes) */
const ZERO_HASH_HEX = '0x' + '00'.repeat(32)
const ZERO_WALLET = ('0x' + '00'.repeat(20)) as `0x${string}`
const CANCEL_TIMEOUT_SEC = 72 * 60 * 60
const DEFAULT_SNIPE_WINDOW_SEC = 60
const DEFAULT_EXTENSION_SEC = 30
const DEFAULT_MAX_EXTENSIONS = 5

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeRoomConfig(raw: unknown): RoomConfigEnvelope {
  if (!isRecord(raw)) {
    return { engine: {}, future: {} }
  }

  const hasNamespaced = 'engine' in raw || 'future' in raw
  if (hasNamespaced) {
    const engine = isRecord(raw.engine) ? { ...raw.engine } : {}
    const future = isRecord(raw.future) ? { ...raw.future } : {}
    for (const [key, value] of Object.entries(raw)) {
      if (key === 'engine' || key === 'future') continue
      future[key] = value
    }
    return { engine, future }
  }

  const engine: Record<string, unknown> = {}
  const future: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'snipeWindowSec' || key === 'extensionSec' || key === 'maxExtensions') {
      engine[key] = value
    } else {
      future[key] = value
    }
  }
  return { engine, future }
}


/** Map ActionType enum to numeric value matching Solidity enum order */
function actionTypeToNumber(type: ActionType): number {
  switch (type) {
    case ActionType.JOIN: return 0
    case ActionType.BID: return 1
    case ActionType.DELIVER: return 2
    case ActionType.WITHDRAW: return 3
    default: throw new Error(`Unknown action type: ${type}`)
  }
}
/**
 * AuctionRoom — Durable Object that manages a single auction's lifecycle.
 *
 * Responsibilities:
 * - Route HTTP requests (actions, events, snapshots, WebSocket streams)
 * - Sequence actions into an append-only hash-chained event log
 * - Persist sequencer state (seqCounter, chainHead) in DO storage
 * - Persist events to D1 for queryable history
 * - Accept Hibernatable WebSocket connections for real-time event streaming
 * - Fire alarms for auction deadline enforcement
 */
export class AuctionRoom implements DurableObject {
  private state: DurableObjectState
  private env: Env

  /** Monotonic sequence counter for the append-only event log */
  private seqCounter: number = 0
  /** Current head hash of the event chain (0x-prefixed hex) */
  private chainHead: string = ZERO_HASH_HEX
  /** Auction ID for this room (set on first request or from DO name) */
  private auctionId: string = ''

  /** Derived room state */
  private participantCount: number = 0
  private highestBid: string = '0'
  private highestBidder: string = '0'
  private startedAt: number = 0
  private deadline: number = 0
  private snipeWindowSec: number = DEFAULT_SNIPE_WINDOW_SEC
  private extensionSec: number = DEFAULT_EXTENSION_SEC
  private maxExtensions: number = DEFAULT_MAX_EXTENSIONS
  private extensionCount: number = 0
  private roomConfig: RoomConfigEnvelope = {
    engine: {
      snipeWindowSec: DEFAULT_SNIPE_WINDOW_SEC,
      extensionSec: DEFAULT_EXTENSION_SEC,
      maxExtensions: DEFAULT_MAX_EXTENSIONS,
    },
    future: {},
  }

  /** Mirrors D1 auctions.status (1=open, 2=closed, 3=settled, 4=cancelled) */
  private auctionStatus: number = 1
  /** Whether on-chain recordResult() has succeeded (separate from auctionStatus for retry) */
  private onChainSettled: boolean = false
  /** Number of failed on-chain settlement attempts (caps retries) */
  private settlementRetries: number = 0
  private terminalType: 'NONE' | 'CLOSE' | 'CANCEL' = 'NONE'
  private winnerAgentId: string = '0'
  private winnerWallet: string = ZERO_WALLET
  private winningBidAmount: string = '0'

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env

    // Load persisted state before handling any requests
    this.state.blockConcurrencyWhile(async () => {
      const [
        seq,
        head,
        id,
        participants,
        highestBid,
        highestBidder,
        startedAt,
        deadline,
        snipeWindowSec,
        extensionSec,
        maxExtensions,
        extensionCount,
        roomConfig,
        status,
        onChainSettled,
        settlementRetries,
        terminalType,
        winnerAgentId,
        winnerWallet,
        winningBidAmount,
      ] = await Promise.all([
        this.state.storage.get<number>('seqCounter'),
        this.state.storage.get<string>('chainHead'),
        this.state.storage.get<string>('auctionId'),
        this.state.storage.get<number>('participantCount'),
        this.state.storage.get<string>('highestBid'),
        this.state.storage.get<string>('highestBidder'),
        this.state.storage.get<number>('startedAt'),
        this.state.storage.get<number>('deadline'),
        this.state.storage.get<number>('snipeWindowSec'),
        this.state.storage.get<number>('extensionSec'),
        this.state.storage.get<number>('maxExtensions'),
        this.state.storage.get<number>('extensionCount'),
        this.state.storage.get<Record<string, unknown>>('roomConfig'),
        this.state.storage.get<number>('auctionStatus'),
        this.state.storage.get<boolean>('onChainSettled'),
        this.state.storage.get<number>('settlementRetries'),
        this.state.storage.get<'NONE' | 'CLOSE' | 'CANCEL'>('terminalType'),
        this.state.storage.get<string>('winnerAgentId'),
        this.state.storage.get<string>('winnerWallet'),
        this.state.storage.get<string>('winningBidAmount'),
      ])
      this.seqCounter = seq ?? 0
      this.chainHead = head ?? ZERO_HASH_HEX
      this.auctionId = id ?? ''
      this.participantCount = participants ?? 0
      this.highestBid = highestBid ?? '0'
      this.highestBidder = highestBidder ?? '0'
      this.startedAt = startedAt ?? 0
      this.deadline = deadline ?? 0
      const normalizedRoomConfig = normalizeRoomConfig(roomConfig)
      const configSnipe = typeof normalizedRoomConfig.engine.snipeWindowSec === 'number'
        ? normalizedRoomConfig.engine.snipeWindowSec
        : undefined
      const configExtension = typeof normalizedRoomConfig.engine.extensionSec === 'number'
        ? normalizedRoomConfig.engine.extensionSec
        : undefined
      const configMaxExtensions = typeof normalizedRoomConfig.engine.maxExtensions === 'number'
        ? normalizedRoomConfig.engine.maxExtensions
        : undefined

      this.snipeWindowSec = snipeWindowSec ?? configSnipe ?? DEFAULT_SNIPE_WINDOW_SEC
      this.extensionSec = extensionSec ?? configExtension ?? DEFAULT_EXTENSION_SEC
      this.maxExtensions = maxExtensions ?? configMaxExtensions ?? DEFAULT_MAX_EXTENSIONS
      this.extensionCount = extensionCount ?? 0
      this.roomConfig = {
        engine: {
          ...normalizedRoomConfig.engine,
          snipeWindowSec: this.snipeWindowSec,
          extensionSec: this.extensionSec,
          maxExtensions: this.maxExtensions,
        },
        future: {
          ...normalizedRoomConfig.future,
        },
      }
      this.auctionStatus = status ?? 1
      this.onChainSettled = onChainSettled ?? false
      this.settlementRetries = settlementRetries ?? 0
      this.terminalType = terminalType ?? 'NONE'
      this.winnerAgentId = winnerAgentId ?? '0'
      this.winnerWallet = (winnerWallet ?? ZERO_WALLET) as `0x${string}`
      this.winningBidAmount = winningBidAmount ?? '0'
    })
  }

  // ─── HTTP Routing ───────────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // Extract auctionId from query param or DO name on first request
    if (!this.auctionId) {
      const idParam = url.searchParams.get('auctionId')
      if (idParam) {
        this.auctionId = idParam
        await this.state.storage.put('auctionId', this.auctionId)
      }
    }

    switch (path) {
      case '/init':
        return this.handleInit(request)
      case '/action':
        return this.handleAction(request)
      case '/events':
        return this.handleEvents(request)
      case '/stream':
        return this.handleStream(request)
      case '/snapshot':
        return this.handleSnapshot()
      case '/close':
        return this.handleClose(request)
      case '/cancel':
        return this.handleCancel(request)
      case '/delete':
        return this.handleDelete()
      case '/retry-settlement': {
        const result = await this.handleRetrySettlement()
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        })
      }
      default:
        return new Response(JSON.stringify({ error: 'not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
    }
  }

  // ─── Route Handlers ─────────────────────────────────────────────────

  /** POST /init — initialize auction metadata in DO storage */
  private async handleInit(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    try {
      const body = (await request.json()) as {
        startedAt?: number
        deadline?: number
        snipeWindowSec?: number
        extensionSec?: number
        maxExtensions?: number
        roomConfig?: unknown
      }

      if (typeof body.startedAt === 'number') {
        this.startedAt = body.startedAt
        await this.state.storage.put('startedAt', this.startedAt)
      }
      if (typeof body.deadline === 'number') {
        this.deadline = body.deadline
        await this.state.storage.put('deadline', this.deadline)

        // Schedule alarm to fire at the auction deadline.
        if (this.deadline > 0) {
          await this.state.storage.setAlarm(this.deadline * 1000)
        }
      }
      if (body.roomConfig !== undefined) {
        this.roomConfig = normalizeRoomConfig(body.roomConfig)
      } else {
        this.roomConfig = normalizeRoomConfig(this.roomConfig)
      }

      const configSnipe = typeof this.roomConfig.engine.snipeWindowSec === 'number'
        ? this.roomConfig.engine.snipeWindowSec
        : undefined
      const configExtension = typeof this.roomConfig.engine.extensionSec === 'number'
        ? this.roomConfig.engine.extensionSec
        : undefined
      const configMaxExtensions = typeof this.roomConfig.engine.maxExtensions === 'number'
        ? this.roomConfig.engine.maxExtensions
        : undefined

      if (configSnipe !== undefined) {
        this.snipeWindowSec = configSnipe
      }
      if (configExtension !== undefined) {
        this.extensionSec = configExtension
      }
      if (configMaxExtensions !== undefined) {
        this.maxExtensions = configMaxExtensions
      }

      if (typeof body.snipeWindowSec === 'number' && Number.isInteger(body.snipeWindowSec) && body.snipeWindowSec >= 0) {
        this.snipeWindowSec = body.snipeWindowSec
      }
      if (typeof body.extensionSec === 'number' && Number.isInteger(body.extensionSec) && body.extensionSec >= 0) {
        this.extensionSec = body.extensionSec
      }
      if (typeof body.maxExtensions === 'number' && Number.isInteger(body.maxExtensions) && body.maxExtensions >= 0) {
        this.maxExtensions = body.maxExtensions
      }

      await this.state.storage.put('snipeWindowSec', this.snipeWindowSec)
      await this.state.storage.put('extensionSec', this.extensionSec)
      await this.state.storage.put('maxExtensions', this.maxExtensions)

      this.roomConfig.engine = {
        ...this.roomConfig.engine,
        snipeWindowSec: this.snipeWindowSec,
        extensionSec: this.extensionSec,
        maxExtensions: this.maxExtensions,
      }
      await this.state.storage.put('roomConfig', this.roomConfig)

      // Ensure status is OPEN after init.
      if (this.auctionStatus !== 1) {
        this.auctionStatus = 1
        await this.state.storage.put('auctionStatus', this.auctionStatus)
      }

      return Response.json({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error'
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  /** POST /action — parse ValidatedAction and ingest into sequencer */
  private async handleAction(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    try {
      if (!this.auctionId) {
        throw new Error('auctionId not set')
      }

      const action = (await request.json()) as ActionRequest

      if (this.auctionStatus >= 2 && action.type === ActionType.BID) {
        throw new Error('auction is closed')
      }
      if (
        action.type === ActionType.BID
        && this.deadline > 0
        && Math.floor(Date.now() / 1000) > this.deadline
      ) {
        throw new Error('auction deadline has passed')
      }

      if (action.type === ActionType.JOIN) {
        const row = await this.env.AUCTION_DB
          .prepare('SELECT deposit_amount FROM auctions WHERE auction_id = ?')
          .bind(this.auctionId)
          .first<{ deposit_amount: string }>()

        const requiredBond = row?.deposit_amount ?? '0'
        if (BigInt(requiredBond) > 0n) {
          // Bond must be confirmed via POST /auctions/:id/bonds before JOIN.
          await enforceJoinBondObservation(this.env.AUCTION_DB, {
            auctionId: this.auctionId,
            agentId: action.agentId,
            wallet: action.wallet,
            amount: requiredBond,
          })
        }
      }

      let maxBid = '0'
      if (action.type === ActionType.BID) {
        const row = await this.env.AUCTION_DB
          .prepare('SELECT max_bid FROM auctions WHERE auction_id = ?')
          .bind(this.auctionId)
          .first<{ max_bid: string | null }>()
        maxBid = row?.max_bid ?? '0'
      }

      const validationCtx: ValidationContext = {
        requireProofs: this.env.ENGINE_REQUIRE_PROOFS === 'true',
      }
      const validation = await validateAction(
        action,
        this.state.storage,
        this.auctionId,
        this.highestBid,
        maxBid,
        validationCtx,
      )
      const result = await this.ingestAction(validation.action, validation.mutation.zkNullifier)
      await commitValidationMutation(validation.mutation, this.state.storage)
      return Response.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error'
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  /** GET /events — query D1 for auction events ordered by seq */
  private async handleEvents(_request: Request): Promise<Response> {
    if (!this.auctionId) {
      return Response.json([])
    }
    const result = await this.env.AUCTION_DB
      .prepare('SELECT * FROM events WHERE auction_id = ? ORDER BY seq')
      .bind(this.auctionId)
      .all()
    return Response.json(result.results ?? [])
  }

  /** GET /stream — WebSocket upgrade using Hibernatable API */
  private handleStream(request: Request): Response {
    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    // Accept via Hibernatable API — enables DO hibernation between messages
    this.state.acceptWebSocket(server)

    return new Response(null, { status: 101, webSocket: client })
  }

  /** GET /snapshot — return current room state */
  private handleSnapshot(): Response {
    const serverNow = Math.floor(Date.now() / 1000)
    const snapshot: RoomSnapshot = {
      auctionId: this.auctionId,
      currentSeq: this.seqCounter,
      headHash: this.chainHead,
      participantCount: this.participantCount,
      highestBid: this.highestBid,
      highestBidder: this.highestBidder,
      startedAt: this.startedAt,
      deadline: this.deadline,
      status: this.auctionStatus,
      serverNow,
      timeRemainingSec: this.deadline > 0 ? Math.max(this.deadline - serverNow, 0) : 0,
      snipeWindowSec: this.snipeWindowSec,
      extensionSec: this.extensionSec,
      maxExtensions: this.maxExtensions,
      extensionCount: this.extensionCount,
      roomConfig: this.roomConfig,
      terminalType: this.terminalType,
      winnerAgentId: this.winnerAgentId,
      winnerWallet: this.winnerWallet,
      winningBidAmount: this.winningBidAmount,
    }
    return Response.json(snapshot)
  }

  // ─── Sequencer Core ─────────────────────────────────────────────────

  /**
   * Ingest a validated action into the append-only event log.
   * Assigns monotonic seq, computes hash chain, persists to DO storage + D1.
   */
  async ingestAction(action: ValidatedAction, zkNullifier?: string): Promise<{
    seq: number
    eventHash: string
    prevHash: string
    sequencerSig: string
  }> {
    const prevHash = this.chainHead
    this.seqCounter += 1
    const seq = this.seqCounter

    // Update derived state (in-memory + DO storage) before persistence
    if (action.type === ActionType.JOIN) {
      this.participantCount += 1
      await this.state.storage.put('participantCount', this.participantCount)
    }
    if (action.type === ActionType.BID) {
      this.highestBid = action.amount
      this.highestBidder = action.agentId
      await this.state.storage.put('highestBid', this.highestBid)
      await this.state.storage.put('highestBidder', this.highestBidder)
    }

    // Compute payload hash from action fields
    const payloadHash = computePayloadHash(
      actionTypeToNumber(action.type),
      BigInt(action.agentId),
      action.wallet,
      BigInt(action.amount),
    )

    // Compute event hash: hash(seq, prevHash, payloadHash)
    const eventHash = await computeEventHash(
      BigInt(seq),
      toBytes(prevHash as `0x${string}`),
      payloadHash,
    )

    const eventHashHex = toHex(eventHash)
    const payloadHashHex = toHex(payloadHash)

    // Update chain head
    this.chainHead = eventHashHex

    // Persist to DO storage
    await this.state.storage.put('seqCounter', this.seqCounter)
    await this.state.storage.put('chainHead', this.chainHead)
    await this.state.storage.put(`event:${seq}`, {
      seq,
      prevHash,
      eventHash: eventHashHex,
      payloadHash: payloadHashHex,
      actionType: action.type,
      agentId: action.agentId,
      wallet: action.wallet,
      amount: action.amount,
      createdAt: Math.floor(Date.now() / 1000),
      ...(zkNullifier ? { zkNullifier } : {}),
    } satisfies AuctionEvent)

    // Persist to D1
    await this.env.AUCTION_DB
      .prepare(
        'INSERT INTO events (auction_id, seq, prev_hash, event_hash, payload_hash, action_type, agent_id, wallet, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        this.auctionId,
        seq,
        prevHash,
        eventHashHex,
        payloadHashHex,
        action.type,
        action.agentId,
        action.wallet,
        action.amount,
      )
      .run()

    const receivedAt = Math.floor(Date.now() / 1000)

    const receipt = await signInclusionReceipt(
      {
        auctionId: this.auctionId as `0x${string}`,
        seq,
        eventHash: eventHashHex as `0x${string}`,
        prevHash: prevHash as `0x${string}`,
        actionType: action.type,
        receivedAt,
      },
      this.env.SEQUENCER_PRIVATE_KEY as `0x${string}`,
    )

    // Broadcast to all connected WebSocket clients
    this.broadcastEvent({
      seq,
      eventHash: eventHashHex,
      actionType: action.type,
      agentId: action.agentId,
      amount: action.amount,
      timestamp: receivedAt,
      wallet: action.wallet,
    })
    if (action.type === ActionType.BID) {
      await this.maybeExtendDeadlineOnBid(receivedAt)
    }
    return { seq, eventHash: eventHashHex, prevHash, sequencerSig: receipt.sequencerSig }
  }

  private async maybeExtendDeadlineOnBid(nowSec: number): Promise<void> {
    if (this.deadline <= 0) return
    if (this.auctionStatus !== 1) return
    if (this.snipeWindowSec <= 0 || this.extensionSec <= 0 || this.maxExtensions <= 0) return
    if (this.extensionCount >= this.maxExtensions) return

    const remaining = this.deadline - nowSec
    if (remaining < 0 || remaining > this.snipeWindowSec) return

    const oldDeadline = this.deadline
    this.deadline += this.extensionSec
    this.extensionCount += 1

    await this.state.storage.put('deadline', this.deadline)
    await this.state.storage.put('extensionCount', this.extensionCount)
    this.roomConfig.engine = {
      ...this.roomConfig.engine,
      snipeWindowSec: this.snipeWindowSec,
      extensionSec: this.extensionSec,
      maxExtensions: this.maxExtensions,
    }
    await this.state.storage.put('roomConfig', this.roomConfig)
    await this.state.storage.setAlarm(this.deadline * 1000)

    this.broadcastEvent({
      actionType: 'DEADLINE_EXTENDED',
      agentId: '0',
      amount: '0',
      wallet: ZERO_WALLET,
      timestamp: nowSec,
      deadline: this.deadline,
      oldDeadline,
      extensionCount: this.extensionCount,
      maxExtensions: this.maxExtensions,
      extensionsRemaining: Math.max(this.maxExtensions - this.extensionCount, 0),
    })
  }

  private async setTerminalState(state: {
    terminalType: 'CLOSE' | 'CANCEL'
    status: number
    winnerAgentId: string
    winnerWallet: `0x${string}`
    winningBidAmount: string
  }): Promise<void> {
    this.terminalType = state.terminalType
    this.auctionStatus = state.status
    this.winnerAgentId = state.winnerAgentId
    this.winnerWallet = state.winnerWallet
    this.winningBidAmount = state.winningBidAmount

    await this.state.storage.put('terminalType', this.terminalType)
    await this.state.storage.put('auctionStatus', this.auctionStatus)
    await this.state.storage.put('winnerAgentId', this.winnerAgentId)
    await this.state.storage.put('winnerWallet', this.winnerWallet)
    await this.state.storage.put('winningBidAmount', this.winningBidAmount)
    await this.env.AUCTION_DB
      .prepare('UPDATE auctions SET status = ? WHERE auction_id = ?')
      .bind(this.auctionStatus, this.auctionId)
      .run()
  }

  /** POST /close — manually trigger auction close with visible errors */
  private async handleClose(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json({ error: 'method not allowed' }, { status: 405 })
    }
    if (!this.auctionId) {
      return Response.json({ error: 'auctionId not set' }, { status: 400 })
    }
    try {
      const result = await this.closeAuction(this.auctionId)
      return Response.json({ ok: true, ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return Response.json({
        error: message,
        settlementRetries: this.settlementRetries,
      }, { status: 500 })
    }
  }

  private async handleCancel(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json({ error: 'method not allowed' }, { status: 405 })
    }
    if (!this.auctionId) {
      return Response.json({ error: 'auctionId not set' }, { status: 400 })
    }

    const auctionRow = await this.env.AUCTION_DB
      .prepare('SELECT deadline, status FROM auctions WHERE auction_id = ?')
      .bind(this.auctionId)
      .first<{ deadline: number; status: number }>()
    if (!auctionRow) {
      return Response.json({ error: 'auction not found' }, { status: 404 })
    }

    if (auctionRow.status === 4) {
      return Response.json({ ok: true, already: 'cancelled' })
    }
    if (auctionRow.status === 3) {
      return Response.json({ error: 'auction already settled on-chain' }, { status: 400 })
    }

    const now = Math.floor(Date.now() / 1000)
    const earliest = auctionRow.deadline + CANCEL_TIMEOUT_SEC
    if (now < earliest) {
      return Response.json(
        {
          error: 'cancel not allowed before timeout',
          earliestCancelAt: earliest,
          waitSeconds: earliest - now,
        },
        { status: 400 },
      )
    }

    if (this.terminalType !== 'CANCEL') {
      await this.setTerminalState({
        terminalType: 'CANCEL',
        status: 4,
        winnerAgentId: '0',
        winnerWallet: ZERO_WALLET,
        winningBidAmount: '0',
      })
      this.broadcastEvent({
        actionType: 'CANCEL',
        agentId: '0',
        amount: '0',
        wallet: ZERO_WALLET,
        timestamp: now,
        reason: 'TIMEOUT',
      })
    }
    return Response.json({
      ok: true,
      terminalType: this.terminalType,
      status: this.auctionStatus,
      winnerAgentId: this.winnerAgentId,
      winnerWallet: this.winnerWallet,
      winningBidAmount: this.winningBidAmount,
    })
  }

  /** POST /delete — wipe all DO storage for this room */
  private async handleDelete(): Promise<Response> {
    await this.state.storage.deleteAll()
    return Response.json({ ok: true })
  }

  // ─── Settlement Retry ───────────────────────────────────────────────

  /** Admin-triggered manual retry of on-chain settlement */
  async handleRetrySettlement(): Promise<{ status: string; retries: number }> {
    if (!this.auctionId) {
      return { status: 'error', retries: 0 }
    }
    if (this.onChainSettled) {
      return { status: 'already_settled', retries: this.settlementRetries }
    }
    if (this.auctionStatus !== 2 && this.auctionStatus !== 3) {
      // Not CLOSED (2) or SETTLED (3)
      return { status: 'not_closeable', retries: this.settlementRetries }
    }

    // Reset retry counter
    this.settlementRetries = 0
    await this.state.storage.put('settlementRetries', 0)

    // Re-trigger settlement
    await this.closeAuction(this.auctionId)

    return {
      status: this.onChainSettled ? 'settled' : 'retrying',
      retries: this.settlementRetries,
    }
  }

  // ─── Auction Close Flow ─────────────────────────────────────────────

  /**
   * Close an open auction and submit the result on-chain.
   *
   * This updates D1 `auctions.status` to CLOSED, computes the winner from the
   * append-only event log in D1, signs the EIP-712 settlement packet, and calls
   * `AuctionRegistry.recordResult(packet, sequencerSig)`.
   */
  async closeAuction(auctionId: string): Promise<{
    terminalType: 'CLOSE' | 'CANCEL'
    status: number
    winnerAgentId: string
    winnerWallet: string
    winningBidAmount: string
    onChainSettled: boolean
  }> {
    if (!auctionId) {
      throw new Error('auctionId required')
    }
    if (this.auctionId && this.auctionId !== auctionId) {
      throw new Error('auctionId mismatch')
    }
    if (!this.auctionId) {
      this.auctionId = auctionId
      await this.state.storage.put('auctionId', this.auctionId)
    }

    if (this.auctionStatus === 4) {
      return {
        terminalType: 'CANCEL',
        status: this.auctionStatus,
        winnerAgentId: this.winnerAgentId,
        winnerWallet: this.winnerWallet,
        winningBidAmount: this.winningBidAmount,
        onChainSettled: this.onChainSettled,
      }
    }

    // If on-chain settlement already succeeded, nothing to do.
    if (this.onChainSettled) {
      return {
        terminalType: this.terminalType === 'NONE' ? 'CLOSE' : this.terminalType,
        status: this.auctionStatus,
        winnerAgentId: this.winnerAgentId,
        winnerWallet: this.winnerWallet,
        winningBidAmount: this.winningBidAmount,
        onChainSettled: this.onChainSettled,
      }
    }

    // Load auction data from D1 (includes fields needed for self-healing createAuction).
    const auctionRow = await this.env.AUCTION_DB
      .prepare('SELECT manifest_hash, reserve_price, deposit_amount, deadline, auction_type, max_bid FROM auctions WHERE auction_id = ?')
      .bind(this.auctionId)
      .first<{ manifest_hash: string; reserve_price: string; deposit_amount: string; deadline: number; auction_type: string | null; max_bid: string | null }>()

    if (!auctionRow) {
      throw new Error('auction not found in D1')
    }

    // Determine winner from the event log and compute replay content hash.
    const events = await this.env.AUCTION_DB
      .prepare('SELECT seq, prev_hash, event_hash, payload_hash, action_type, agent_id, wallet, amount, created_at FROM events WHERE auction_id = ? ORDER BY seq')
      .bind(this.auctionId)
      .all<{ seq: number; prev_hash: string; event_hash: string; payload_hash: string; action_type: string; agent_id: string; wallet: string; amount: string; created_at: number }>()

    let winnerAgentId = 0n
    let winnerWallet: `0x${string}` = ZERO_WALLET
    let winningBidAmount = 0n
    let hasBids = false

    const replayEvents: AuctionEvent[] = []
    for (const e of events.results ?? []) {
      replayEvents.push({
        seq: Number(e.seq),
        prevHash: e.prev_hash,
        eventHash: e.event_hash,
        payloadHash: e.payload_hash,
        actionType: e.action_type as ActionType,
        agentId: e.agent_id,
        wallet: e.wallet,
        amount: e.amount,
        createdAt: Number(e.created_at ?? 0),
      })
      if (e.action_type !== ActionType.BID) continue
      hasBids = true
      const amount = BigInt(e.amount)
      if (amount > winningBidAmount) {
        winningBidAmount = amount
        winnerAgentId = BigInt(e.agent_id)
        winnerWallet = e.wallet as `0x${string}`
      }
    }

    if (!hasBids) {
      if (this.terminalType !== 'CANCEL') {
        await this.setTerminalState({
          terminalType: 'CANCEL',
          status: 4,
          winnerAgentId: '0',
          winnerWallet: ZERO_WALLET,
          winningBidAmount: '0',
        })
        this.broadcastEvent({
          actionType: 'CANCEL',
          agentId: '0',
          amount: '0',
          wallet: ZERO_WALLET,
          timestamp: Math.floor(Date.now() / 1000),
          reason: 'NO_BIDS',
        })
      }

      return {
        terminalType: 'CANCEL',
        status: this.auctionStatus,
        winnerAgentId: this.winnerAgentId,
        winnerWallet: this.winnerWallet,
        winningBidAmount: this.winningBidAmount,
        onChainSettled: this.onChainSettled,
      }
    }

    if (this.auctionStatus < 2) {
      this.auctionStatus = 2
      await this.state.storage.put('auctionStatus', this.auctionStatus)
      await this.env.AUCTION_DB
        .prepare('UPDATE auctions SET status = 2 WHERE auction_id = ?')
        .bind(this.auctionId)
        .run()
    }

    if (this.terminalType !== 'CLOSE') {
      await this.setTerminalState({
        terminalType: 'CLOSE',
        status: 2,
        winnerAgentId: winnerAgentId.toString(),
        winnerWallet,
        winningBidAmount: winningBidAmount.toString(),
      })
      this.broadcastEvent({
        actionType: 'CLOSE',
        agentId: winnerAgentId.toString(),
        amount: winningBidAmount.toString(),
        wallet: winnerWallet,
        timestamp: Math.floor(Date.now() / 1000),
      })
    }

    const closeTimestamp = BigInt(Math.floor(Date.now() / 1000))
    const packet: AuctionSettlementPacket = {
      auctionId: this.auctionId as `0x${string}`,
      manifestHash: auctionRow.manifest_hash as `0x${string}`,
      finalLogHash: this.chainHead as `0x${string}`,
      winnerAgentId,
      winnerWallet,
      winningBidAmount,
      closeTimestamp,
    }

    const privateKey = this.env.SEQUENCER_PRIVATE_KEY as `0x${string}`

    try {
      // Self-healing: if auction was never registered on-chain, create it now.
      const roomConfigHash = keccak256(
        encodePacked(
          ['string', 'string'],
          [auctionRow.auction_type ?? 'english', auctionRow.max_bid ?? '0'],
        ),
      )
      await ensureAuctionOnChain(
        this.auctionId as `0x${string}`,
        {
          manifestHash: auctionRow.manifest_hash as `0x${string}`,
          roomConfigHash,
          reservePrice: BigInt(auctionRow.reserve_price),
          depositAmount: BigInt(auctionRow.deposit_amount),
          deadline: BigInt(auctionRow.deadline),
        },
        privateKey,
      )

      const sequencerSig = await signSettlementPacket(packet, privateKey)
      await recordResultOnChain(packet, sequencerSig, privateKey)

      // Mark on-chain settlement as complete — prevents future retries.
      this.onChainSettled = true
      await this.state.storage.put('onChainSettled', true)
    } catch (err) {
      this.settlementRetries += 1
      await this.state.storage.put('settlementRetries', this.settlementRetries)

      const MAX_RETRIES = 5
      if (this.settlementRetries < MAX_RETRIES) {
        // Exponential backoff: 30s, 60s, 120s, 240s
        const delay = Math.min(30_000 * Math.pow(2, this.settlementRetries - 1), 300_000)
        await this.state.storage.setAlarm(Date.now() + delay)
        console.error(
          `[AuctionRoom] on-chain settlement failed for ${this.auctionId} (attempt ${this.settlementRetries}/${MAX_RETRIES}), retrying in ${delay / 1000}s:`,
          err,
        )
      } else {
        console.error(
          `[AuctionRoom] on-chain settlement for ${this.auctionId} failed after ${this.settlementRetries} attempts — giving up:`,
          err,
        )
        // Broadcast failure to connected clients so they know settlement is stuck
        this.broadcast({
          type: 'SETTLEMENT_FAILED',
          auctionId: this.auctionId,
          attempts: this.settlementRetries,
          error: err instanceof Error ? err.message : String(err),
          timestamp: Math.floor(Date.now() / 1000),
        })
      }
    }

    return {
      terminalType: this.terminalType === 'NONE' ? 'CLOSE' : this.terminalType,
      status: this.auctionStatus,
      winnerAgentId: this.winnerAgentId,
      winnerWallet: this.winnerWallet,
      winningBidAmount: this.winningBidAmount,
      onChainSettled: this.onChainSettled,
    }
  }

  // ─── Alarm Handler ──────────────────────────────────────────────────

  /** Alarm fires at auction deadline or as settlement retry */
  async alarm(): Promise<void> {
    console.log(`[AuctionRoom] alarm fired for auction ${this.auctionId}`)
    if (!this.auctionId) return
    // closeAuction is idempotent via onChainSettled — safe to call on retries
    if (this.auctionStatus === 4) return
    if (this.onChainSettled) return
    await this.closeAuction(this.auctionId)
  }

  // ─── Hibernatable WebSocket Handlers ────────────────────────────────

  /** Called when a hibernated WebSocket receives a message — clients are read-only spectators */
  async webSocketMessage(ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    // Clients are read-only spectators; acknowledge receipt
    try {
      ws.send(JSON.stringify({ type: 'ack' }))
    } catch {
      // Ignore send errors on closed sockets
    }
  }

  /** Called when a hibernated WebSocket is closed */
  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    ws.close(code, reason)
  }

  /** Called when a hibernated WebSocket encounters an error */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    // Stub — log and close
    console.error(`[AuctionRoom] WebSocket error:`, error)
    ws.close(1011, 'WebSocket error')
  }

  // ─── Broadcast ───────────────────────────────────────────────────────

  /** Broadcast an event to all connected WebSocket clients */
  private broadcastEvent(event: {
    seq?: number
    eventHash?: string
    actionType: string
    agentId: string
    amount: string
    wallet?: string
    timestamp: number
    deadline?: number
    oldDeadline?: number
    extensionCount?: number
    maxExtensions?: number
    extensionsRemaining?: number
    reason?: string
  }): void {
    const message = JSON.stringify({
      type: 'event',
      seq: event.seq ?? this.seqCounter,
      eventHash: event.eventHash ?? this.chainHead,
      ...event,
    })
    const sockets = this.state.getWebSockets()
    for (const ws of sockets) {
      try {
        ws.send(message)
      } catch {
        // Ignore errors from closed/errored sockets
      }
    }
  }

  /** Broadcast a JSON message to all connected WebSocket clients */
  private broadcast(data: unknown): void {
    const message = JSON.stringify(data)
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(message)
      } catch {
        // Ignore errors on closed sockets
      }
    }
  }

  // ─── Accessors (for testing) ────────────────────────────────────────

  /** @internal — exposed for tests */
  getSeqCounter(): number {
    return this.seqCounter
  }

  /** @internal — exposed for tests */
  getChainHead(): string {
    return this.chainHead
  }
}
