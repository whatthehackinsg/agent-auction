import type { Env } from './index'
import type {
  RoomSnapshot,
  ValidatedAction,
  AuctionEvent,
  ActionRequest,
} from './types/engine'
import { ActionType } from './types/engine'
import { computeEventHash, computePayloadHash, ZERO_HASH } from './lib/crypto'
import { toHex, toBytes, keccak256, encodePacked } from 'viem'
import { validateAction, commitValidationMutation } from './handlers/actions'
import type { AuctionSettlementPacket } from './types/contracts'
import { ensureAuctionOnChain, recordResultOnChain, signSettlementPacket } from './lib/settlement'
import { signInclusionReceipt } from './lib/inclusion-receipt'
import { enforceJoinBondObservation, pollAndRecordBondTransfers } from './lib/bond-watcher'
import { serializeReplayBundle, computeContentHash } from './lib/replay-bundle'

/** Zero hash as 0x-prefixed hex string (32 zero bytes) */
const ZERO_HASH_HEX = '0x' + '00'.repeat(32)


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

  /** Mirrors D1 auctions.status (1=open, 2=closed, 3=settled, 4=cancelled) */
  private auctionStatus: number = 1
  /** Whether on-chain recordResult() has succeeded (separate from auctionStatus for retry) */
  private onChainSettled: boolean = false
  /** Number of failed on-chain settlement attempts (caps retries) */
  private settlementRetries: number = 0

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env

    // Load persisted state before handling any requests
    this.state.blockConcurrencyWhile(async () => {
      const [seq, head, id, participants, highestBid, highestBidder, startedAt, deadline, status, onChainSettled, settlementRetries] = await Promise.all([
        this.state.storage.get<number>('seqCounter'),
        this.state.storage.get<string>('chainHead'),
        this.state.storage.get<string>('auctionId'),
        this.state.storage.get<number>('participantCount'),
        this.state.storage.get<string>('highestBid'),
        this.state.storage.get<string>('highestBidder'),
        this.state.storage.get<number>('startedAt'),
        this.state.storage.get<number>('deadline'),
        this.state.storage.get<number>('auctionStatus'),
        this.state.storage.get<boolean>('onChainSettled'),
        this.state.storage.get<number>('settlementRetries'),
      ])
      this.seqCounter = seq ?? 0
      this.chainHead = head ?? ZERO_HASH_HEX
      this.auctionId = id ?? ''
      this.participantCount = participants ?? 0
      this.highestBid = highestBid ?? '0'
      this.highestBidder = highestBidder ?? '0'
      this.startedAt = startedAt ?? 0
      this.deadline = deadline ?? 0
      this.auctionStatus = status ?? 1
      this.onChainSettled = onChainSettled ?? false
      this.settlementRetries = settlementRetries ?? 0
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

      if (action.type === ActionType.JOIN) {
        const row = await this.env.AUCTION_DB
          .prepare('SELECT deposit_amount FROM auctions WHERE auction_id = ?')
          .bind(this.auctionId)
          .first<{ deposit_amount: string }>()

        const requiredBond = row?.deposit_amount ?? '0'
        if (BigInt(requiredBond) > 0n) {
          // Refresh pending bond observations from chain logs before gating JOIN.
          try {
            await pollAndRecordBondTransfers(
              this.env.AUCTION_DB,
              this.env.SEQUENCER_PRIVATE_KEY as `0x${string}`,
            )
          } catch {
            // Best effort: if polling fails, fall back to current D1 observation status.
          }
          await enforceJoinBondObservation(this.env.AUCTION_DB, {
            auctionId: this.auctionId,
            agentId: action.agentId,
            wallet: action.wallet,
            amount: requiredBond,
          })
        }
      }

      const validation = await validateAction(
        action,
        this.state.storage,
        this.auctionId,
        this.highestBid,
      )
      const result = await this.ingestAction(validation.action)
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
    const snapshot: RoomSnapshot = {
      auctionId: this.auctionId,
      currentSeq: this.seqCounter,
      headHash: this.chainHead,
      participantCount: this.participantCount,
      highestBid: this.highestBid,
      highestBidder: this.highestBidder,
      startedAt: this.startedAt,
      deadline: this.deadline,
    }
    return Response.json(snapshot)
  }

  // ─── Sequencer Core ─────────────────────────────────────────────────

  /**
   * Ingest a validated action into the append-only event log.
   * Assigns monotonic seq, computes hash chain, persists to DO storage + D1.
   */
  async ingestAction(action: ValidatedAction): Promise<{
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
    })
    return { seq, eventHash: eventHashHex, prevHash, sequencerSig: receipt.sequencerSig }
  }

  // ─── Auction Close Flow ─────────────────────────────────────────────

  /**
   * Close an open auction and submit the result on-chain.
   *
   * This updates D1 `auctions.status` to CLOSED, computes the winner from the
   * append-only event log in D1, signs the EIP-712 settlement packet, and calls
   * `AuctionRegistry.recordResult(packet, sequencerSig)`.
   */
  async closeAuction(auctionId: string): Promise<void> {
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

    // If on-chain settlement already succeeded, nothing to do.
    if (this.onChainSettled) {
      return
    }

    // Mark closed locally first (blocks late bids) — idempotent.
    if (this.auctionStatus < 2) {
      this.auctionStatus = 2
      await this.state.storage.put('auctionStatus', this.auctionStatus)
      await this.env.AUCTION_DB
        .prepare('UPDATE auctions SET status = 2 WHERE auction_id = ?')
        .bind(this.auctionId)
        .run()
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
    let winnerWallet: `0x${string}` = ('0x' + '00'.repeat(20)) as `0x${string}`
    let winningBidAmount = 0n

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
      const amount = BigInt(e.amount)
      if (amount > winningBidAmount) {
        winningBidAmount = amount
        winnerAgentId = BigInt(e.agent_id)
        winnerWallet = e.wallet as `0x${string}`
      }
    }

    // Compute replay content hash (SHA-256 of canonical replay bundle)
    let replayContentHashHex: `0x${string}` = ZERO_HASH_HEX as `0x${string}`
    if (replayEvents.length > 0) {
      const replayBytes = serializeReplayBundle(this.auctionId, replayEvents)
      const replayHash = await computeContentHash(replayBytes)
      replayContentHashHex = toHex(replayHash) as `0x${string}`
    }

    const closeTimestamp = BigInt(Math.floor(Date.now() / 1000))
    const packet: AuctionSettlementPacket = {
      auctionId: this.auctionId as `0x${string}`,
      manifestHash: auctionRow.manifest_hash as `0x${string}`,
      finalLogHash: this.chainHead as `0x${string}`,
      replayContentHash: replayContentHashHex,
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
      }
    }
  }

  // ─── Alarm Handler ──────────────────────────────────────────────────

  /** Alarm fires at auction deadline or as settlement retry */
  async alarm(): Promise<void> {
    console.log(`[AuctionRoom] alarm fired for auction ${this.auctionId}`)
    if (!this.auctionId) return
    // closeAuction is idempotent via onChainSettled — safe to call on retries
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
    seq: number
    eventHash: string
    actionType: string
    agentId: string
    amount: string
    timestamp: number
  }): void {
    const message = JSON.stringify({ type: 'event', ...event })
    const sockets = this.state.getWebSockets()
    for (const ws of sockets) {
      try {
        ws.send(message)
      } catch {
        // Ignore errors from closed/errored sockets
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
