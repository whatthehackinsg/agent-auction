import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { AuctionRoom } from './auction-room'
import { toHex } from 'viem'
import { serializeReplayBundle, computeContentHash } from './lib/replay-bundle'
import { type AuctionEvent, ActionType } from './types/engine'
import { getBondStatus, pollAndRecordBondTransfers } from './lib/bond-watcher'
import { requireX402 } from './middleware/x402'
import { pinReplayBundleToIpfs } from './lib/ipfs'

export interface Env {
  AUCTION_DB: D1Database
  AUCTION_ROOM: DurableObjectNamespace
  SEQUENCER_PRIVATE_KEY: string
  PINATA_API_KEY?: string
}

const app = new Hono<{ Bindings: Env }>()

app.use('/*', cors())

// x402-gated resources (micropayments)
app.use('/auctions/:id/manifest', requireX402({ resource: 'auction-manifest', priceUsdc: '0.001' }))
app.use('/auctions/:id/events', requireX402({ resource: 'auction-events', priceUsdc: '0.0001' }))

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

  const createdAt = Math.floor(Date.now() / 1000)

  const insert = await c.env.AUCTION_DB
    .prepare(
      'INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(auctionId, manifestHash, 1, reservePrice, depositAmount, deadline, createdAt)
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
      body: JSON.stringify({ startedAt: createdAt, deadline }),
    }),
  )

  return c.json({ auctionId, createdAt }, 201)
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
    .prepare('SELECT auction_id, manifest_hash FROM auctions WHERE auction_id = ?')
    .bind(auctionId)
    .first<{ auction_id: string; manifest_hash: string }>()

  if (!row) {
    return c.json({ error: 'auction not found' }, 404)
  }

  return c.json({ auctionId: row.auction_id, manifestHash: row.manifest_hash })
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
  const replayHash = computeContentHash(replayBytes)

  let replayCid: string | null = null
  const cidRow = await c.env.AUCTION_DB
    .prepare('SELECT replay_cid FROM auctions WHERE auction_id = ?')
    .bind(auctionId)
    .first<{ replay_cid: string | null }>()

  replayCid = cidRow?.replay_cid ?? null

  if (!replayCid) {
    const pin = await pinReplayBundleToIpfs(replayBytes, {
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

app.get('/auctions/:id/bonds/:agentId', async (c) => {
  const auctionId = c.req.param('id')
  const agentId = c.req.param('agentId')

  // Best effort refresh from chain logs.
  try {
    await pollAndRecordBondTransfers(
      c.env.AUCTION_DB,
      c.env.SEQUENCER_PRIVATE_KEY as `0x${string}`,
    )
  } catch {
    // Fallback to current D1 status if chain polling fails.
  }

  const status = await getBondStatus(c.env.AUCTION_DB, auctionId, agentId)
  return c.json(status)
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
