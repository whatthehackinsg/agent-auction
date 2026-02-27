import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { AuctionRoom } from './auction-room'
import { toHex, keccak256, encodePacked } from 'viem'
import { serializeReplayBundle, computeContentHash } from './lib/replay-bundle'
import { type AuctionEvent, type ItemMetadata, ActionType } from './types/engine'
import { getBondStatus, verifyBondFromReceipt } from './lib/bond-watcher'
import { createX402Middleware } from './middleware/x402'
import { pinToIpfs } from './lib/ipfs'
import { onboardAgent } from './lib/onboard'
import { createSequencerClient, auctionRegistryAbi } from './lib/chain-client'
import { ADDRESSES } from './lib/addresses'

export interface Env {
  AUCTION_DB: D1Database
  AUCTION_ROOM: DurableObjectNamespace
  SEQUENCER_PRIVATE_KEY: string
  PINATA_API_KEY?: string
  X402_MODE?: string                // 'off' (default) | 'on'
  X402_RECEIVER_ADDRESS?: string    // wallet to receive x402 payments
  X402_FACILITATOR_URL?: string     // default: https://www.x402.org/facilitator
  ENGINE_ADMIN_KEY?: string
}

const app = new Hono<{ Bindings: Env }>()

app.use('/*', cors())

// x402-gated resources (micropayments)
// Middleware is created lazily per-request so env vars are available at runtime.
// When X402_MODE !== 'on', all requests pass through without payment.
let x402Handler: ReturnType<typeof createX402Middleware> | null = null

app.use('/auctions/:id/manifest', async (c, next) => {
  if (c.env.X402_MODE !== 'on') return next()
  if (!x402Handler) {
    x402Handler = createX402Middleware({
      receiverAddress: (c.env.X402_RECEIVER_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
      facilitatorUrl: c.env.X402_FACILITATOR_URL ?? 'https://www.x402.org/facilitator',
    })
  }
  return x402Handler(c, next)
})

app.use('/auctions/:id/events', async (c, next) => {
  if (c.env.X402_MODE !== 'on') return next()
  if (!x402Handler) {
    x402Handler = createX402Middleware({
      receiverAddress: (c.env.X402_RECEIVER_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
      facilitatorUrl: c.env.X402_FACILITATOR_URL ?? 'https://www.x402.org/facilitator',
    })
  }
  return x402Handler(c, next)
})

app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

function randomAuctionId(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

function roomStub(env: Env, auctionId: string): DurableObjectStub {
  const id = env.AUCTION_ROOM.idFromName(auctionId)
  return env.AUCTION_ROOM.get(id)
}

function makeRoomRequest(path: string, auctionId: string, init?: RequestInit): Request {
  // Durable Object fetch only cares about pathname + query params.
  // We always pass auctionId as a query param so the DO can persist it.
  const url = `https://auction-room${path}?auctionId=${encodeURIComponent(auctionId)}`
  return new Request(url, init)
}

type CreateAuctionRequest = {
  auctionId?: string
  auction_id?: string
  manifestHash: string
  manifest_hash?: string
  reservePrice: string
  reserve_price?: string
  depositAmount?: string
  deposit_amount?: string
  deadline: number
  title?: string
  description?: string
  auctionType?: string
  auction_type?: string
  maxBid?: string
  max_bid?: string
  snipeWindowSec?: number
  snipe_window_sec?: number
  extensionSec?: number
  extension_sec?: number
  maxExtensions?: number
  max_extensions?: number
  roomConfig?: Record<string, unknown>
  room_config?: Record<string, unknown>
  itemImageCid?: string
  nftContract?: string
  nftTokenId?: string
  nftChainId?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeRoomConfig(raw: unknown): { engine: Record<string, unknown>; future: Record<string, unknown> } {
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

app.get('/auctions', async (c) => {
  const result = await c.env.AUCTION_DB
    .prepare('SELECT * FROM auctions ORDER BY created_at DESC')
    .all()
  return c.json({ auctions: result.results ?? [] })
})

app.post('/auctions', async (c) => {
  const body = (await c.req.json()) as CreateAuctionRequest

  const auctionId = body.auctionId ?? body.auction_id ?? randomAuctionId()
  const manifestHash = body.manifestHash ?? body.manifest_hash
  const reservePrice = body.reservePrice ?? body.reserve_price
  const depositAmount = body.depositAmount ?? body.deposit_amount ?? '0'
  const deadline = body.deadline
  const title = body.title ?? null
  const description = body.description ?? null
  const auctionType = body.auctionType ?? body.auction_type ?? 'english'
  const maxBid = body.maxBid ?? body.max_bid ?? null
  const rawRoomConfig = body.roomConfig ?? body.room_config ?? {}
  if (!isRecord(rawRoomConfig)) {
    return c.json({ error: 'roomConfig must be an object' }, 400)
  }
  const roomConfig = normalizeRoomConfig(rawRoomConfig)
  const roomSnipeWindow = typeof roomConfig.engine.snipeWindowSec === 'number' ? roomConfig.engine.snipeWindowSec : undefined
  const roomExtension = typeof roomConfig.engine.extensionSec === 'number' ? roomConfig.engine.extensionSec : undefined
  const roomMaxExtensions = typeof roomConfig.engine.maxExtensions === 'number' ? roomConfig.engine.maxExtensions : undefined
  const snipeWindowSec = body.snipeWindowSec ?? body.snipe_window_sec ?? roomSnipeWindow ?? 60
  const extensionSec = body.extensionSec ?? body.extension_sec ?? roomExtension ?? 30
  const maxExtensions = body.maxExtensions ?? body.max_extensions ?? roomMaxExtensions ?? 5
  const mergedRoomConfig = {
    engine: {
      ...roomConfig.engine,
      snipeWindowSec,
      extensionSec,
      maxExtensions,
    },
    future: {
      ...roomConfig.future,
    },
  }

  if (!manifestHash || !reservePrice || typeof deadline !== 'number') {
    return c.json({ error: 'missing required fields' }, 400)
  }

  const bytes32Re = /^0x[0-9a-fA-F]{64}$/
  const uintRe = /^\d+$/
  if (!bytes32Re.test(auctionId)) {
    return c.json({ error: 'auctionId must be bytes32 hex' }, 400)
  }
  if (!bytes32Re.test(manifestHash)) {
    return c.json({ error: 'manifestHash must be bytes32 hex' }, 400)
  }
  if (!uintRe.test(reservePrice) || !uintRe.test(depositAmount)) {
    return c.json({ error: 'reservePrice/depositAmount must be uint strings' }, 400)
  }
  if (maxBid !== null && !uintRe.test(maxBid)) {
    return c.json({ error: 'maxBid must be a uint string' }, 400)
  }
  if (!Number.isInteger(snipeWindowSec) || snipeWindowSec < 0) {
    return c.json({ error: 'snipeWindowSec must be a non-negative integer' }, 400)
  }
  if (!Number.isInteger(extensionSec) || extensionSec < 0) {
    return c.json({ error: 'extensionSec must be a non-negative integer' }, 400)
  }
  if (!Number.isInteger(maxExtensions) || maxExtensions < 0) {
    return c.json({ error: 'maxExtensions must be a non-negative integer' }, 400)
  }
  const validTypes = ['english', 'sealed-bid']
  if (!validTypes.includes(auctionType)) {
    return c.json({ error: `auctionType must be one of: ${validTypes.join(', ')}` }, 400)
  }

  // ── NFT item metadata (all optional) ─────────────────────────────
  const itemImageCid = body.itemImageCid ?? null
  const nftContract = body.nftContract ?? null
  const nftTokenId = body.nftTokenId ?? null
  const nftChainId = body.nftChainId ?? null

  const addressRe = /^0x[0-9a-fA-F]{40}$/
  if (nftContract !== null && !addressRe.test(nftContract)) {
    return c.json({ error: 'nftContract must be 0x + 40 hex chars' }, 400)
  }
  if (nftTokenId !== null && !/^\d+$/.test(nftTokenId)) {
    return c.json({ error: 'nftTokenId must be a uint string' }, 400)
  }
  if (nftChainId !== null && (!Number.isInteger(nftChainId) || nftChainId <= 0)) {
    return c.json({ error: 'nftChainId must be a positive integer' }, 400)
  }

  const createdAt = Math.floor(Date.now() / 1000)

  const insert = await c.env.AUCTION_DB
    .prepare(
      'INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline, title, description, auction_type, max_bid, snipe_window_sec, extension_sec, max_extensions, room_config_json, item_image_cid, nft_contract, nft_token_id, nft_chain_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      auctionId,
      manifestHash,
      1,
      reservePrice,
      depositAmount,
      deadline,
      title,
      description,
      auctionType,
      maxBid,
      snipeWindowSec,
      extensionSec,
      maxExtensions,
      JSON.stringify(mergedRoomConfig),
      itemImageCid,
      nftContract,
      nftTokenId,
      nftChainId,
      createdAt,
    )
    .run()

  if (!insert.success) {
    return c.json({ error: 'failed to create auction' }, 500)
  }

  // Initialize the room metadata (best effort).
  const room = roomStub(c.env, auctionId)
  await room.fetch(
    makeRoomRequest('/init', auctionId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startedAt: createdAt,
        deadline,
        snipeWindowSec,
        extensionSec,
        maxExtensions,
        roomConfig: mergedRoomConfig,
      }),
    }),
  )

  // Register auction on-chain via AuctionRegistry.createAuction()
  let txHash: string | null = null
  try {
    const roomConfigHash = keccak256(
      encodePacked(['string', 'string'], [auctionType, maxBid ?? '0']),
    )
    const sequencerClient = createSequencerClient(
      c.env.SEQUENCER_PRIVATE_KEY as `0x${string}`,
    )
    txHash = await sequencerClient.writeContract({
      address: ADDRESSES.auctionRegistry,
      abi: auctionRegistryAbi,
      functionName: 'createAuction',
      args: [
        auctionId as `0x${string}`,
        manifestHash as `0x${string}`,
        roomConfigHash,
        BigInt(reservePrice),
        BigInt(depositAmount),
        BigInt(deadline),
      ],
    })
  } catch (err) {
    // On-chain registration is best-effort — auction still usable off-chain.
    // Common failure: auction already exists on-chain (idempotent retry).
    console.error('[createAuction] on-chain registration failed:', err)
  }

  const item: ItemMetadata = {
    imageCid: itemImageCid,
    nftContract,
    nftTokenId,
    nftChainId,
  }

  return c.json({ auctionId, createdAt, txHash, item }, 201)
})

app.get('/auctions/:id', async (c) => {
  const auctionId = c.req.param('id')
  const auction = await c.env.AUCTION_DB
    .prepare('SELECT * FROM auctions WHERE auction_id = ?')
    .bind(auctionId)
    .first()

  if (!auction) {
    return c.json({ error: 'auction not found' }, 404)
  }

  const room = roomStub(c.env, auctionId)
  const snapshotRes = await room.fetch(makeRoomRequest('/snapshot', auctionId))
  const snapshot = await snapshotRes.json()

  return c.json({ auction, snapshot })
})

app.post('/auctions/:id/close', async (c) => {
  const expected = c.env.ENGINE_ADMIN_KEY
  if (!expected) {
    return c.json({ error: 'ENGINE_ADMIN_KEY not configured' }, 500)
  }
  const provided = c.req.header('X-ENGINE-ADMIN-KEY') ?? ''
  if (provided !== expected) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const auctionId = c.req.param('id')
  const room = roomStub(c.env, auctionId)
  const res = await room.fetch(
    makeRoomRequest('/close', auctionId, { method: 'POST' }),
  )
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
})

app.post('/auctions/:id/cancel', async (c) => {
  const auctionId = c.req.param('id')
  const room = roomStub(c.env, auctionId)
  const res = await room.fetch(
    makeRoomRequest('/cancel', auctionId, { method: 'POST' }),
  )
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
})

app.post('/auctions/:id/action', async (c) => {
  const auctionId = c.req.param('id')
  const body = await c.req.json()

  const room = roomStub(c.env, auctionId)
  const res = await room.fetch(
    makeRoomRequest('/action', auctionId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
  })
})

app.get('/auctions/:id/manifest', async (c) => {
  const auctionId = c.req.param('id')
  const row = await c.env.AUCTION_DB
    .prepare('SELECT auction_id, manifest_hash, title, description, item_image_cid, nft_contract, nft_token_id, nft_chain_id FROM auctions WHERE auction_id = ?')
    .bind(auctionId)
    .first<{ auction_id: string; manifest_hash: string; title: string | null; description: string | null; item_image_cid: string | null; nft_contract: string | null; nft_token_id: string | null; nft_chain_id: number | null }>()

  if (!row) {
    return c.json({ error: 'auction not found' }, 404)
  }

  const item: ItemMetadata = {
    imageCid: row.item_image_cid,
    nftContract: row.nft_contract,
    nftTokenId: row.nft_token_id,
    nftChainId: row.nft_chain_id,
  }

  return c.json({
    auctionId: row.auction_id,
    manifestHash: row.manifest_hash,
    title: row.title,
    description: row.description,
    item,
  })
})

const IMAGE_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

app.post('/auctions/:id/image', async (c) => {
  const auctionId = c.req.param('id')

  const auction = await c.env.AUCTION_DB
    .prepare('SELECT auction_id FROM auctions WHERE auction_id = ?')
    .bind(auctionId)
    .first()
  if (!auction) {
    return c.json({ error: 'auction not found' }, 404)
  }

  let imageBytes: Uint8Array

  const contentType = c.req.header('Content-Type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData()
    const file = formData.get('image') as unknown as File | null
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
      return c.json({ error: 'missing image field in multipart form' }, 400)
    }
    if (file.size > IMAGE_MAX_BYTES) {
      return c.json({ error: `image exceeds ${IMAGE_MAX_BYTES} byte limit` }, 400)
    }
    imageBytes = new Uint8Array(await file.arrayBuffer())
  } else {
    const buf = await c.req.arrayBuffer()
    if (buf.byteLength === 0) {
      return c.json({ error: 'empty request body' }, 400)
    }
    if (buf.byteLength > IMAGE_MAX_BYTES) {
      return c.json({ error: `image exceeds ${IMAGE_MAX_BYTES} byte limit` }, 400)
    }
    imageBytes = new Uint8Array(buf)
  }

  const pin = await pinToIpfs(imageBytes, {
    pinataJwt: c.env.PINATA_API_KEY,
    fileName: `${auctionId}.item-image`,
  })

  if (!pin.cid) {
    return c.json({ error: pin.error ?? 'IPFS pinning failed' }, 502)
  }

  await c.env.AUCTION_DB
    .prepare('UPDATE auctions SET item_image_cid = ? WHERE auction_id = ?')
    .bind(pin.cid, auctionId)
    .run()

  return c.json({ auctionId, imageCid: pin.cid }, 201)
})

app.get('/auctions/:id/events', async (c) => {
  const auctionId = c.req.param('id')
  const result = await c.env.AUCTION_DB
    .prepare('SELECT * FROM events WHERE auction_id = ? ORDER BY seq')
    .bind(auctionId)
    .all()
  return c.json({ events: result.results ?? [] })
})

app.get('/auctions/:id/replay', async (c) => {
  const auctionId = c.req.param('id')
  const result = await c.env.AUCTION_DB
    .prepare('SELECT seq, prev_hash, event_hash, payload_hash, action_type, agent_id, wallet, amount, created_at FROM events WHERE auction_id = ? ORDER BY seq')
    .bind(auctionId)
    .all<{
      seq: number
      prev_hash: string
      event_hash: string
      payload_hash: string
      action_type: string
      agent_id: string
      wallet: string
      amount: string
      created_at: number
    }>()

  const events: AuctionEvent[] = (result.results ?? []).map((row) => ({
    seq: Number(row.seq),
    prevHash: row.prev_hash,
    eventHash: row.event_hash,
    payloadHash: row.payload_hash,
    actionType: row.action_type as ActionType,
    agentId: row.agent_id,
    wallet: row.wallet,
    amount: row.amount,
    createdAt: Number(row.created_at ?? 0),
  }))

  const replayBytes = serializeReplayBundle(auctionId, events)
  const replayHash = await computeContentHash(replayBytes)

  let replayCid: string | null = null
  const cidRow = await c.env.AUCTION_DB
    .prepare('SELECT replay_cid FROM auctions WHERE auction_id = ?')
    .bind(auctionId)
    .first<{ replay_cid: string | null }>()

  replayCid = cidRow?.replay_cid ?? null

  if (!replayCid) {
    const pin = await pinToIpfs(replayBytes, {
      pinataJwt: c.env.PINATA_API_KEY,
      fileName: `${auctionId}.replay.bin`,
    })

    if (pin.cid) {
      replayCid = pin.cid
      // Best effort persistence: ignore DB errors to preserve replay serving path.
      await c.env.AUCTION_DB
        .prepare('UPDATE auctions SET replay_cid = ? WHERE auction_id = ?')
        .bind(replayCid, auctionId)
        .run()
    }
  }

  return new Response(replayBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Replay-Content-Hash': toHex(replayHash),
      ...(replayCid ? { 'X-IPFS-CID': replayCid } : {}),
    },
  })
})

app.post('/auctions/:id/bonds', async (c) => {
  const auctionId = c.req.param('id')
  const body = (await c.req.json()) as { agentId: string; depositor: string; amount: string; txHash: string }

  if (!body.txHash || !body.agentId || !body.depositor || !body.amount) {
    return c.json({ error: 'missing required fields: agentId, depositor, amount, txHash' }, 400)
  }

  try {
    const confirmed = await verifyBondFromReceipt(
      c.env.AUCTION_DB,
      c.env.SEQUENCER_PRIVATE_KEY as `0x${string}`,
      {
        auctionId,
        agentId: body.agentId,
        depositor: body.depositor,
        amount: body.amount,
        txHash: body.txHash as `0x${string}`,
      },
    )

    if (!confirmed) {
      return c.json({ error: 'bond transfer not found in TX receipt' }, 400)
    }
    return c.json({ status: 'CONFIRMED', txHash: body.txHash })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return c.json({ error: `bond verification failed: ${msg}` }, 500)
  }
})

app.get('/auctions/:id/bonds/:agentId', async (c) => {
  const auctionId = c.req.param('id')
  const agentId = c.req.param('agentId')
  const status = await getBondStatus(c.env.AUCTION_DB, auctionId, agentId)
  return c.json(status)
})

// ── Agent onboarding ──────────────────────────────────────────────────

type OnboardRequest = {
  runtimeSigner: string      // EOA address that will sign for this agent
  salt?: string              // optional uint256 salt for deterministic wallet address (default: 0)
  mintAmount?: string        // optional USDC amount to mint in base units (default: 10_000_000 = 10 USDC)
}

app.post('/onboard', async (c) => {
  const body = (await c.req.json()) as OnboardRequest

  if (!body.runtimeSigner || !/^0x[0-9a-fA-F]{40}$/.test(body.runtimeSigner)) {
    return c.json({ error: 'runtimeSigner must be a valid 0x address' }, 400)
  }

  try {
    const result = await onboardAgent({
      runtimeSigner: body.runtimeSigner as `0x${string}`,
      salt: BigInt(body.salt ?? '0'),
      mintAmount: BigInt(body.mintAmount ?? '10000000'), // 10 USDC (6 decimals)
      sequencerPrivateKey: c.env.SEQUENCER_PRIVATE_KEY as `0x${string}`,
    })
    return c.json(result, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'onboarding failed'
    return c.json({ error: message }, 500)
  }
})

app.get('/auctions/:id/stream', async (c) => {
  const auctionId = c.req.param('id')
  const room = roomStub(c.env, auctionId)

  // Preserve upgrade headers by cloning the incoming request.
  const res = await room.fetch(
    makeRoomRequest('/stream', auctionId, {
      method: 'GET',
      headers: c.req.raw.headers,
    }),
  )

  return res
})

export default app
export { AuctionRoom }
