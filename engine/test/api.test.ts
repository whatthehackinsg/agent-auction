import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Miniflare } from 'miniflare'
import app, { type Env } from '../src/index'
import { applySchema, createTestMiniflare, randomAuctionId } from './setup'

type Call = {
  url: string
  method: string
}

function createMockRoomNamespace() {
  const calls: Call[] = []

  const ns = {
    idFromName: (name: string) => {
      return {
        name,
        toString: () => name,
        equals: (other: { toString: () => string }) => other.toString() === name,
      } as unknown as DurableObjectId
    },
    get: (_id: DurableObjectId) => {
      const stub: DurableObjectStub = {
        fetch: async (request: Request) => {
          calls.push({ url: request.url, method: request.method })
          const u = new URL(request.url)

          if (u.pathname === '/snapshot') {
            return Response.json({
              auctionId: u.searchParams.get('auctionId') ?? '',
              currentSeq: 0,
              headHash: '0x' + '00'.repeat(32),
              participantCount: 0,
              highestBid: '0',
              highestBidder: '0',
              startedAt: 0,
              deadline: 0,
            })
          }

          if (u.pathname === '/action') {
            return Response.json({ seq: 1, eventHash: '0x' + '11'.repeat(32), prevHash: '0x' + '00'.repeat(32) })
          }

          if (u.pathname === '/stream') {
            // Note: Node's Fetch (undici) rejects status 101.
            // In production Workers, this will be a WebSocket 101 response.
            return new Response(null, { status: 200 })
          }

          if (u.pathname === '/init') {
            return Response.json({ ok: true })
          }

          return new Response('not found', { status: 404 })
        },
      }
      return stub
    },
    _calls: calls,
  }

  return ns as unknown as DurableObjectNamespace & { _calls: Call[] }
}

describe('API routes (Hono)', () => {
  let mf: Miniflare
  let db: D1Database
  let env: Env
  let rooms: DurableObjectNamespace & { _calls: Call[] }

  beforeAll(async () => {
    mf = createTestMiniflare()
    db = await mf.getD1Database('AUCTION_DB')
    await applySchema(db)

    rooms = createMockRoomNamespace()
    env = {
      AUCTION_DB: db,
      AUCTION_ROOM: rooms,
      SEQUENCER_PRIVATE_KEY: (process.env.SEQUENCER_PRIVATE_KEY ?? '0x' + '11'.repeat(32)) as string,
    }
  })

  afterAll(async () => {
    await mf.dispose()
  })

  it('GET /health returns ok', async () => {
    const res = await app.request('http://localhost/health', {}, env)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('ok')
  })

  it('POST /auctions inserts into D1 and initializes room', async () => {
    const auctionId = randomAuctionId()
    const deadline = Math.floor(Date.now() / 1000) + 60
    const manifestHash = '0x' + 'aa'.repeat(32)

    const res = await app.request(
      'http://localhost/auctions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auctionId,
          manifestHash,
          reservePrice: '1000000',
          depositAmount: '500000',
          deadline,
        }),
      },
      env,
    )

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.auctionId).toBe(auctionId)

    const row = await db
      .prepare('SELECT * FROM auctions WHERE auction_id = ?')
      .bind(auctionId)
      .first<Record<string, unknown>>()
    expect(row).not.toBeNull()
    expect(row!.manifest_hash).toBe(manifestHash)
    expect(row!.reserve_price).toBe('1000000')

    expect(rooms._calls.some((c) => c.url.includes('/init'))).toBe(true)
  })

  it('GET /auctions returns list', async () => {
    const res = await app.request('http://localhost/auctions', {}, env)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.auctions)).toBe(true)
    expect(json.auctions.length).toBeGreaterThan(0)
  })

  it('GET /auctions/:id returns auction + snapshot', async () => {
    const auctionId = randomAuctionId()
    await db
      .prepare(
        'INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(auctionId, '0xhash', 1, '1', '0', Math.floor(Date.now() / 1000) + 60)
      .run()

    const res = await app.request(`http://localhost/auctions/${auctionId}`, {}, env)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.auction).toBeTruthy()
    expect(json.snapshot).toBeTruthy()
    expect(json.snapshot.auctionId).toBe(auctionId)
  })

  it('POST /auctions/:id/action proxies to room /action', async () => {
    const auctionId = randomAuctionId()
    const res = await app.request(
      `http://localhost/auctions/${auctionId}/action`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'BID', agentId: '1', wallet: '0x' + '11'.repeat(20), amount: '1', nonce: 0, signature: '0x' }),
      },
      env,
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.seq).toBe(1)
    expect(rooms._calls.some((c) => c.url.includes('/action'))).toBe(true)
  })

  it('GET /auctions/:id/events returns ordered events from D1', async () => {
    const auctionId = randomAuctionId()

    await db
      .prepare(
        'INSERT INTO events (auction_id, seq, prev_hash, event_hash, payload_hash, action_type, agent_id, wallet, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(auctionId, 1, '0x' + '00'.repeat(32), '0x' + '11'.repeat(32), '0x' + '22'.repeat(32), 'BID', '1', '0x' + '11'.repeat(20), '1')
      .run()

    await db
      .prepare(
        'INSERT INTO events (auction_id, seq, prev_hash, event_hash, payload_hash, action_type, agent_id, wallet, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(auctionId, 2, '0x' + '11'.repeat(32), '0x' + '33'.repeat(32), '0x' + '44'.repeat(32), 'BID', '2', '0x' + '22'.repeat(20), '2')
      .run()

    const res = await app.request(
      `http://localhost/auctions/${auctionId}/events`,
      { headers: { 'x402-receipt': 'receipt-events-1' } },
      env,
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.events).toHaveLength(2)
    expect(json.events[0].seq).toBe(1)
    expect(json.events[1].seq).toBe(2)
  })

  it('manifest/events endpoints are open when x402 mode is off', async () => {
    const auctionId = randomAuctionId()
    await db
      .prepare(
        'INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(auctionId, '0x' + 'aa'.repeat(32), 1, '1', '0', Math.floor(Date.now() / 1000) + 60)
      .run()

    const eventsRes = await app.request(`http://localhost/auctions/${auctionId}/events`, {}, env)
    expect(eventsRes.status).toBe(200)

    const manifestRes = await app.request(`http://localhost/auctions/${auctionId}/manifest`, {}, env)
    expect(manifestRes.status).toBe(200)
  })

  it('rejects duplicate x402 receipt hash with 409 in insecure header-hash mode', async () => {
    const auctionId = randomAuctionId()
    env.X402_MODE = 'insecure_header_hash'
    await db
      .prepare(
        'INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(auctionId, '0x' + 'ab'.repeat(32), 1, '1', '0', Math.floor(Date.now() / 1000) + 60)
      .run()

    const first = await app.request(
      `http://localhost/auctions/${auctionId}/manifest`,
      { headers: { 'x402-receipt': 'same-receipt' } },
      env,
    )
    expect(first.status).toBe(200)

    const second = await app.request(
      `http://localhost/auctions/${auctionId}/manifest`,
      { headers: { 'x402-receipt': 'same-receipt' } },
      env,
    )
    expect(second.status).toBe(409)
    delete env.X402_MODE
  })

  it('GET /auctions/:id/manifest succeeds with valid x402 receipt in insecure header-hash mode', async () => {
    const auctionId = randomAuctionId()
    env.X402_MODE = 'insecure_header_hash'
    const manifestHash = '0x' + 'cd'.repeat(32)
    await db
      .prepare(
        'INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(auctionId, manifestHash, 1, '1', '0', Math.floor(Date.now() / 1000) + 60)
      .run()

    const res = await app.request(
      `http://localhost/auctions/${auctionId}/manifest`,
      { headers: { 'x402-receipt': 'manifest-receipt-1' } },
      env,
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.auctionId).toBe(auctionId)
    expect(body.manifestHash).toBe(manifestHash)
    delete env.X402_MODE
  })

  it('GET /auctions/:id/replay returns canonical replay bytes', async () => {
    const auctionId = randomAuctionId()

    await db
      .prepare(
        'INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline, replay_cid) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(auctionId, '0x' + 'aa'.repeat(32), 1, '1', '0', Math.floor(Date.now() / 1000) + 60, 'bafy-test-cid')
      .run()

    await db
      .prepare(
        'INSERT INTO events (auction_id, seq, prev_hash, event_hash, payload_hash, action_type, agent_id, wallet, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        auctionId,
        1,
        '0x' + '00'.repeat(32),
        '0x' + '22'.repeat(32),
        '0x' + '33'.repeat(32),
        'JOIN',
        '101',
        '0x' + '11'.repeat(20),
        '0',
      )
      .run()

    const res = await app.request(`http://localhost/auctions/${auctionId}/replay`, {}, env)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('application/octet-stream')

    const bytes = new Uint8Array(await res.arrayBuffer())
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('schema:v1')
    expect(text).toContain(`auction_id:${auctionId}`)
    expect(text).toContain('event:seq=1|type=JOIN|agent_id=101')

    const contentHash = res.headers.get('X-Replay-Content-Hash')
    expect(contentHash).toMatch(/^0x[0-9a-f]{64}$/)
    expect(res.headers.get('X-IPFS-CID')).toBe('bafy-test-cid')
  })

  it('GET /auctions/:id/bonds/:agentId returns bond observation status', async () => {
    const auctionId = randomAuctionId()
    const agentId = '101'

    const noneRes = await app.request(
      `http://localhost/auctions/${auctionId}/bonds/${agentId}`,
      {},
      env,
    )
    expect(noneRes.status).toBe(200)
    const none = await noneRes.json()
    expect(none.status).toBe('NONE')

    await db
      .prepare(
        `INSERT INTO bond_observations (auction_id, agent_id, depositor, amount, status, requested_at, confirmed_at, observed_tx_hash, observed_log_index)
         VALUES (?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?)`,
      )
      .bind(
        auctionId,
        agentId,
        '0x' + '11'.repeat(20),
        '500000',
        100,
        110,
        '0x' + '22'.repeat(32),
        3,
      )
      .run()

    const confirmedRes = await app.request(
      `http://localhost/auctions/${auctionId}/bonds/${agentId}`,
      {},
      env,
    )
    expect(confirmedRes.status).toBe(200)
    const confirmed = await confirmedRes.json()
    expect(confirmed.status).toBe('CONFIRMED')
    expect(confirmed.observedLogIndex).toBe(3)
  })

  it('GET /auctions/:id/stream proxies upgrade request to room', async () => {
    const auctionId = randomAuctionId()
    const res = await app.request(
      `http://localhost/auctions/${auctionId}/stream`,
      {
        headers: {
          Upgrade: 'websocket',
        },
      },
      env,
    )
    expect(res.status).toBe(200)
    expect(rooms._calls.some((c) => c.url.includes('/stream'))).toBe(true)
  })
})
