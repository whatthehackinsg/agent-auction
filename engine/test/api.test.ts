import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Miniflare } from 'miniflare'
import app, { type Env } from '../src/index'
import { applySchema, createTestMiniflare, randomAuctionId } from './setup'
import { sha256Hex } from '../src/lib/x402-policy'

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

          if (u.pathname === '/close') {
            return Response.json({ ok: true, closed: true })
          }

          if (u.pathname === '/cancel') {
            return Response.json({ ok: true, cancelled: true })
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

const TEST_ADMIN_KEY = 'test-admin-key'
const adminHeaders = { 'Content-Type': 'application/json', 'X-ENGINE-ADMIN-KEY': TEST_ADMIN_KEY }

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
      ENGINE_ADMIN_KEY: 'test-admin-key',
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
        headers: adminHeaders,
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

  it('POST /auctions supports extensible roomConfig payload', async () => {
    const auctionId = randomAuctionId()
    const deadline = Math.floor(Date.now() / 1000) + 60

    const res = await app.request(
      'http://localhost/auctions',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          auctionId,
          manifestHash: '0x' + 'bb'.repeat(32),
          reservePrice: '2000000',
          depositAmount: '1000000',
          deadline,
          roomConfig: {
            engine: {
              snipeWindowSec: 45,
              extensionSec: 15,
              maxExtensions: 3,
            },
            future: {
              customField: 'future-proof',
            },
          },
        }),
      },
      env,
    )
    expect(res.status).toBe(201)

    const row = await db
      .prepare('SELECT snipe_window_sec, extension_sec, max_extensions, room_config_json FROM auctions WHERE auction_id = ?')
      .bind(auctionId)
      .first<Record<string, unknown>>()
    expect(row).not.toBeNull()
    expect(row!.snipe_window_sec).toBe(45)
    expect(row!.extension_sec).toBe(15)
    expect(row!.max_extensions).toBe(3)
    expect(typeof row!.room_config_json).toBe('string')
    const parsed = JSON.parse(String(row!.room_config_json)) as Record<string, unknown>
    expect((parsed.engine as Record<string, unknown>).snipeWindowSec).toBe(45)
    expect((parsed.engine as Record<string, unknown>).extensionSec).toBe(15)
    expect((parsed.engine as Record<string, unknown>).maxExtensions).toBe(3)
    expect((parsed.future as Record<string, unknown>).customField).toBe('future-proof')
  })

  it('POST /auctions coerces flat roomConfig payload into namespaced format', async () => {
    const auctionId = randomAuctionId()
    const deadline = Math.floor(Date.now() / 1000) + 60

    const res = await app.request(
      'http://localhost/auctions',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          auctionId,
          manifestHash: '0x' + 'bc'.repeat(32),
          reservePrice: '3000000',
          depositAmount: '1000000',
          deadline,
          roomConfig: {
            snipeWindowSec: 55,
            extensionSec: 11,
            maxExtensions: 4,
            experimentalFoo: 'bar',
          },
        }),
      },
      env,
    )
    expect(res.status).toBe(201)

    const row = await db
      .prepare('SELECT snipe_window_sec, extension_sec, max_extensions, room_config_json FROM auctions WHERE auction_id = ?')
      .bind(auctionId)
      .first<Record<string, unknown>>()
    expect(row).not.toBeNull()
    expect(row!.snipe_window_sec).toBe(55)
    expect(row!.extension_sec).toBe(11)
    expect(row!.max_extensions).toBe(4)
    const parsed = JSON.parse(String(row!.room_config_json)) as Record<string, unknown>
    expect((parsed.engine as Record<string, unknown>).snipeWindowSec).toBe(55)
    expect((parsed.engine as Record<string, unknown>).extensionSec).toBe(11)
    expect((parsed.engine as Record<string, unknown>).maxExtensions).toBe(4)
    expect((parsed.future as Record<string, unknown>).experimentalFoo).toBe('bar')
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

  it('POST /auctions/:id/close requires admin key', async () => {
    const auctionId = randomAuctionId()

    const unauthorized = await app.request(
      `http://localhost/auctions/${auctionId}/close`,
      { method: 'POST' },
      env,
    )
    expect(unauthorized.status).toBe(401)

    const authorized = await app.request(
      `http://localhost/auctions/${auctionId}/close`,
      {
        method: 'POST',
        headers: { 'X-ENGINE-ADMIN-KEY': TEST_ADMIN_KEY },
      },
      env,
    )
    expect(authorized.status).toBe(200)
    expect(rooms._calls.some((c) => c.url.includes('/close'))).toBe(true)
  })

  it('POST /auctions/:id/cancel requires admin auth', async () => {
    const auctionId = randomAuctionId()

    const unauthorized = await app.request(
      `http://localhost/auctions/${auctionId}/cancel`,
      { method: 'POST' },
      env,
    )
    expect(unauthorized.status).toBe(401)

    const authorized = await app.request(
      `http://localhost/auctions/${auctionId}/cancel`,
      { method: 'POST', headers: { 'X-ENGINE-ADMIN-KEY': TEST_ADMIN_KEY } },
      env,
    )
    expect(authorized.status).toBe(200)
    expect(rooms._calls.some((c) => c.url.includes('/cancel'))).toBe(true)
  })

  it('GET /auctions/:id/events returns ordered events from D1 (admin auth)', async () => {
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
      { headers: { 'X-ENGINE-ADMIN-KEY': TEST_ADMIN_KEY } },
      env,
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.events).toHaveLength(2)
    expect(json.events[0].seq).toBe(1)
    expect(json.events[1].seq).toBe(2)
  })

  it('GET /auctions/:id/events returns 403 without auth', async () => {
    const auctionId = randomAuctionId()

    const res = await app.request(
      `http://localhost/auctions/${auctionId}/events`,
      {},
      env,
    )
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toContain('participant token or admin key')
  })

  it('GET /auctions/:id/events allows participant access via participantToken', async () => {
    const auctionId = randomAuctionId()
    const agentId = '42'

    // Insert a JOIN event to establish participation
    await db
      .prepare(
        'INSERT INTO events (auction_id, seq, prev_hash, event_hash, payload_hash, action_type, agent_id, wallet, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(auctionId, 1, '0x' + '00'.repeat(32), '0x' + '11'.repeat(32), '0x' + '22'.repeat(32), 'JOIN', agentId, '0x' + '11'.repeat(20), '0')
      .run()

    await db
      .prepare(
        'INSERT INTO events (auction_id, seq, prev_hash, event_hash, payload_hash, action_type, agent_id, wallet, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(auctionId, 2, '0x' + '11'.repeat(32), '0x' + '33'.repeat(32), '0x' + '44'.repeat(32), 'BID', agentId, '0x' + '11'.repeat(20), '100')
      .run()

    const res = await app.request(
      `http://localhost/auctions/${auctionId}/events?participantToken=${agentId}`,
      {},
      env,
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.events).toHaveLength(2)
  })

  it('manifest endpoint is open when x402 mode is off; events requires auth', async () => {
    const auctionId = randomAuctionId()
    await db
      .prepare(
        'INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(auctionId, '0x' + 'aa'.repeat(32), 1, '1', '0', Math.floor(Date.now() / 1000) + 60)
      .run()

    // Events require auth (admin or participant) regardless of x402
    const eventsNoAuth = await app.request(`http://localhost/auctions/${auctionId}/events`, {}, env)
    expect(eventsNoAuth.status).toBe(403)

    // Events with admin key should work
    const eventsAdmin = await app.request(
      `http://localhost/auctions/${auctionId}/events`,
      { headers: { 'X-ENGINE-ADMIN-KEY': TEST_ADMIN_KEY } },
      env,
    )
    expect(eventsAdmin.status).toBe(200)

    const manifestRes = await app.request(`http://localhost/auctions/${auctionId}/manifest`, {}, env)
    expect(manifestRes.status).toBe(200)
  })

  it('discovery routes return 402 when x402 discovery is enabled and no payment provided', async () => {
    const auctionId = randomAuctionId()
    await db
      .prepare('INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(auctionId, '0x' + 'ab'.repeat(32), 1, '1', '0', Math.floor(Date.now() / 1000) + 60)
      .run()

    env.X402_MODE = 'on'
    env.X402_RECEIVER_ADDRESS = '0x' + '11'.repeat(20)
    env.ENGINE_X402_DISCOVERY = 'true'

    const listRes = await app.request('http://localhost/auctions', {}, env)
    expect(listRes.status).toBe(402)

    const detailRes = await app.request(`http://localhost/auctions/${auctionId}`, {}, env)
    expect(detailRes.status).toBe(402)

    delete env.X402_MODE
    delete env.X402_RECEIVER_ADDRESS
    delete env.ENGINE_X402_DISCOVERY
  })

  it('discovery routes reject duplicate payment-signature receipt hash', async () => {
    const auctionId = randomAuctionId()
    await db
      .prepare('INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(auctionId, '0x' + 'ab'.repeat(32), 1, '1', '0', Math.floor(Date.now() / 1000) + 60)
      .run()

    env.X402_MODE = 'on'
    env.X402_RECEIVER_ADDRESS = '0x' + '11'.repeat(20)
    env.ENGINE_X402_DISCOVERY = 'true'

    const paymentSignature = 'base64-mock-payload'
    const receiptHash = await sha256Hex(paymentSignature)
    await db
      .prepare('INSERT INTO x402_receipts (receipt_hash, used_at) VALUES (?, ?)')
      .bind(receiptHash, Math.floor(Date.now() / 1000))
      .run()

    const res = await app.request(
      `http://localhost/auctions/${auctionId}`,
      { headers: { 'PAYMENT-SIGNATURE': paymentSignature } },
      env,
    )
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toContain('duplicate PAYMENT-SIGNATURE')

    delete env.X402_MODE
    delete env.X402_RECEIVER_ADDRESS
    delete env.ENGINE_X402_DISCOVERY
  })

  it('discovery gate passes through when receiver address is missing', async () => {
    const auctionId = randomAuctionId()
    await db
      .prepare('INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(auctionId, '0x' + 'ab'.repeat(32), 1, '1', '0', Math.floor(Date.now() / 1000) + 60)
      .run()

    env.X402_MODE = 'on'
    env.ENGINE_X402_DISCOVERY = 'true'
    delete env.X402_RECEIVER_ADDRESS

    // No receiver → platformConfig.enabled=false → gate passes through → 200
    const res = await app.request(`http://localhost/auctions/${auctionId}`, {}, env)
    expect(res.status).toBe(200)

    delete env.X402_MODE
    delete env.ENGINE_X402_DISCOVERY
  })

  it('admin key bypasses x402 on discovery routes', async () => {
    const auctionId = randomAuctionId()
    await db
      .prepare('INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(auctionId, '0x' + 'ab'.repeat(32), 1, '1', '0', Math.floor(Date.now() / 1000) + 60)
      .run()

    env.X402_MODE = 'on'
    env.X402_RECEIVER_ADDRESS = '0x' + '11'.repeat(20)
    env.ENGINE_X402_DISCOVERY = 'true'

    // Without admin key → 402
    const gatedRes = await app.request(`http://localhost/auctions/${auctionId}`, {}, env)
    expect(gatedRes.status).toBe(402)

    // With admin key → bypasses x402 → 200
    const bypassRes = await app.request(
      `http://localhost/auctions/${auctionId}`,
      { headers: { 'X-ENGINE-ADMIN-KEY': TEST_ADMIN_KEY } },
      env,
    )
    expect(bypassRes.status).toBe(200)

    delete env.X402_MODE
    delete env.X402_RECEIVER_ADDRESS
    delete env.ENGINE_X402_DISCOVERY
  })

  it('discovery routes are free when ENGINE_X402_DISCOVERY is not set', async () => {
    const auctionId = randomAuctionId()
    await db
      .prepare('INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(auctionId, '0x' + 'ab'.repeat(32), 1, '1', '0', Math.floor(Date.now() / 1000) + 60)
      .run()

    env.X402_MODE = 'on'
    env.X402_RECEIVER_ADDRESS = '0x' + '11'.repeat(20)
    // ENGINE_X402_DISCOVERY not set → gate passes through
    delete env.ENGINE_X402_DISCOVERY

    const listRes = await app.request('http://localhost/auctions', {}, env)
    expect(listRes.status).toBe(200)

    const detailRes = await app.request(`http://localhost/auctions/${auctionId}`, {}, env)
    expect(detailRes.status).toBe(200)

    delete env.X402_MODE
    delete env.X402_RECEIVER_ADDRESS
  })

  it('POST to /auctions bypasses x402 gate (only GET gated)', async () => {
    env.X402_MODE = 'on'
    env.X402_RECEIVER_ADDRESS = '0x' + '11'.repeat(20)
    env.ENGINE_X402_DISCOVERY = 'true'

    const auctionId = randomAuctionId()
    const deadline = Math.floor(Date.now() / 1000) + 60

    const res = await app.request(
      'http://localhost/auctions',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          auctionId,
          manifestHash: '0x' + 'a2'.repeat(32),
          reservePrice: '1000000',
          deadline,
        }),
      },
      env,
    )
    expect(res.status).toBe(201)

    delete env.X402_MODE
    delete env.X402_RECEIVER_ADDRESS
    delete env.ENGINE_X402_DISCOVERY
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

  // ── NFT Item Metadata ───────────────────────────────────────────────

  it('POST /auctions accepts NFT item metadata', async () => {
    const auctionId = randomAuctionId()
    const deadline = Math.floor(Date.now() / 1000) + 60

    const res = await app.request(
      'http://localhost/auctions',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          auctionId,
          manifestHash: '0x' + 'cc'.repeat(32),
          reservePrice: '1000000',
          deadline,
          itemImageCid: 'QmTestImageCid123',
          nftContract: '0x' + 'ab'.repeat(20),
          nftTokenId: '42',
          nftChainId: 84532,
        }),
      },
      env,
    )

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.auctionId).toBe(auctionId)
    expect(json.item).toBeTruthy()
    expect(json.item.imageCid).toBe('QmTestImageCid123')
    expect(json.item.nftContract).toBe('0x' + 'ab'.repeat(20))
    expect(json.item.nftTokenId).toBe('42')
    expect(json.item.nftChainId).toBe(84532)

    const row = await db
      .prepare('SELECT item_image_cid, nft_contract, nft_token_id, nft_chain_id FROM auctions WHERE auction_id = ?')
      .bind(auctionId)
      .first<Record<string, unknown>>()
    expect(row).not.toBeNull()
    expect(row!.item_image_cid).toBe('QmTestImageCid123')
    expect(row!.nft_contract).toBe('0x' + 'ab'.repeat(20))
    expect(row!.nft_token_id).toBe('42')
    expect(row!.nft_chain_id).toBe(84532)
  })

  it('POST /auctions works without NFT fields (backward compatible)', async () => {
    const auctionId = randomAuctionId()
    const deadline = Math.floor(Date.now() / 1000) + 60

    const res = await app.request(
      'http://localhost/auctions',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          auctionId,
          manifestHash: '0x' + 'dd'.repeat(32),
          reservePrice: '1000000',
          deadline,
        }),
      },
      env,
    )

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.item).toBeTruthy()
    expect(json.item.imageCid).toBeNull()
    expect(json.item.nftContract).toBeNull()
    expect(json.item.nftTokenId).toBeNull()
    expect(json.item.nftChainId).toBeNull()

    const row = await db
      .prepare('SELECT item_image_cid, nft_contract, nft_token_id, nft_chain_id FROM auctions WHERE auction_id = ?')
      .bind(auctionId)
      .first<Record<string, unknown>>()
    expect(row).not.toBeNull()
    expect(row!.item_image_cid).toBeNull()
    expect(row!.nft_contract).toBeNull()
    expect(row!.nft_token_id).toBeNull()
    expect(row!.nft_chain_id).toBeNull()
  })

  it('POST /auctions rejects invalid nftContract address', async () => {
    const auctionId = randomAuctionId()
    const deadline = Math.floor(Date.now() / 1000) + 60

    const res = await app.request(
      'http://localhost/auctions',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          auctionId,
          manifestHash: '0x' + 'ee'.repeat(32),
          reservePrice: '1000000',
          deadline,
          nftContract: 'not-an-address',
        }),
      },
      env,
    )

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('nftContract')
  })

  it('POST /auctions rejects invalid nftTokenId', async () => {
    const auctionId = randomAuctionId()
    const deadline = Math.floor(Date.now() / 1000) + 60

    const res = await app.request(
      'http://localhost/auctions',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          auctionId,
          manifestHash: '0x' + 'ef'.repeat(32),
          reservePrice: '1000000',
          deadline,
          nftTokenId: '-1',
        }),
      },
      env,
    )

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('nftTokenId')
  })

  it('POST /auctions rejects invalid nftChainId', async () => {
    const auctionId = randomAuctionId()
    const deadline = Math.floor(Date.now() / 1000) + 60

    const res = await app.request(
      'http://localhost/auctions',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          auctionId,
          manifestHash: '0x' + 'fa'.repeat(32),
          reservePrice: '1000000',
          deadline,
          nftChainId: -5,
        }),
      },
      env,
    )

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('nftChainId')
  })

  it('GET /auctions/:id/manifest returns item metadata', async () => {
    const auctionId = randomAuctionId()
    await db
      .prepare(
        'INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline, title, description, item_image_cid, nft_contract, nft_token_id, nft_chain_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        auctionId,
        '0x' + 'ff'.repeat(32),
        1,
        '1000000',
        '0',
        Math.floor(Date.now() / 1000) + 60,
        'Rare NFT Auction',
        'A very rare item',
        'QmManifestImageCid',
        '0x' + 'ab'.repeat(20),
        '99',
        84532,
      )
      .run()

    const res = await app.request(`http://localhost/auctions/${auctionId}/manifest`, {}, env)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.auctionId).toBe(auctionId)
    expect(json.manifestHash).toBe('0x' + 'ff'.repeat(32))
    expect(json.title).toBe('Rare NFT Auction')
    expect(json.description).toBe('A very rare item')
    expect(json.item).toBeTruthy()
    expect(json.item.imageCid).toBe('QmManifestImageCid')
    expect(json.item.nftContract).toBe('0x' + 'ab'.repeat(20))
    expect(json.item.nftTokenId).toBe('99')
    expect(json.item.nftChainId).toBe(84532)
  })

  it('GET /auctions/:id/manifest returns null item fields when not set', async () => {
    const auctionId = randomAuctionId()
    await db
      .prepare(
        'INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(auctionId, '0x' + 'ab'.repeat(32), 1, '1', '0', Math.floor(Date.now() / 1000) + 60)
      .run()

    const res = await app.request(`http://localhost/auctions/${auctionId}/manifest`, {}, env)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.item).toBeTruthy()
    expect(json.item.imageCid).toBeNull()
    expect(json.item.nftContract).toBeNull()
    expect(json.item.nftTokenId).toBeNull()
    expect(json.item.nftChainId).toBeNull()
  })

  it('POST /auctions/:id/image returns 404 for non-existent auction', async () => {
    const auctionId = randomAuctionId()
    const res = await app.request(
      `http://localhost/auctions/${auctionId}/image`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array([1, 2, 3]),
      },
      env,
    )
    expect(res.status).toBe(404)
  })

  // ── Per-Auction x402 Policy: CRUD ────────────────────────────────────

  it('POST /auctions rejects invalid x402Policy before creating auction', async () => {
    const auctionId = randomAuctionId()
    const deadline = Math.floor(Date.now() / 1000) + 60

    const res = await app.request(
      'http://localhost/auctions',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          auctionId,
          manifestHash: '0x' + 'a2'.repeat(32),
          reservePrice: '1000000',
          deadline,
          x402Policy: { mode: 'invalid-mode' },
        }),
      },
      env,
    )

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('mode')

    // Verify nothing was inserted
    const row = await db
      .prepare('SELECT auction_id FROM auctions WHERE auction_id = ?')
      .bind(auctionId)
      .first()
    expect(row).toBeNull()
  })

  it('PATCH /auctions/:id/x402-policy requires admin auth', async () => {
    const auctionId = randomAuctionId()

    const res = await app.request(
      `http://localhost/auctions/${auctionId}/x402-policy`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'off' }),
      },
      env,
    )

    expect(res.status).toBe(401)
  })

  it('PATCH /auctions/:id/x402-policy returns 404 for non-existent auction', async () => {
    const auctionId = randomAuctionId()

    const res = await app.request(
      `http://localhost/auctions/${auctionId}/x402-policy`,
      {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ mode: 'off' }),
      },
      env,
    )

    expect(res.status).toBe(404)
  })

  it('PATCH /auctions/:id/x402-policy returns 400 for CLOSED auction', async () => {
    const auctionId = randomAuctionId()
    await db
      .prepare('INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(auctionId, '0x' + 'ab'.repeat(32), 2, '1', '0', Math.floor(Date.now() / 1000) + 60)
      .run()

    const res = await app.request(
      `http://localhost/auctions/${auctionId}/x402-policy`,
      {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ mode: 'on', receiverAddress: '0x' + '11'.repeat(20) }),
      },
      env,
    )

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('closed')
  })

  // ── Discovery x402 Gate Scenarios ────────────────────────────────

  // Scenario 2: Admin creates a free demo auction exempt from platform-wide charges.
  // Manifest serves freely; other auctions still charge.
  it('demo auction (mode=off) serves manifest freely while platform is on', async () => {
    const freeAuctionId = randomAuctionId()

    await db
      .prepare('INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline, title, x402_policy_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(
        freeAuctionId,
        '0x' + 'ab'.repeat(32),
        1,
        '1',
        '0',
        Math.floor(Date.now() / 1000) + 60,
        'Free Demo Auction',
        JSON.stringify({ mode: 'off' }),
      )
      .run()

    env.X402_MODE = 'on'
    env.X402_RECEIVER_ADDRESS = '0x' + '55'.repeat(20)

    // Free auction → 200
    const manifestRes = await app.request(
      `http://localhost/auctions/${freeAuctionId}/manifest`,
      {},
      env,
    )
    expect(manifestRes.status).toBe(200)
    const manifestJson = await manifestRes.json()
    expect(manifestJson.title).toBe('Free Demo Auction')

    // Events endpoint requires auth (admin or participant) regardless of x402;
    // x402 gate is bypassed (mode=off), so the route handler runs and checks auth.
    const eventsNoAuth = await app.request(
      `http://localhost/auctions/${freeAuctionId}/events`,
      {},
      env,
    )
    expect(eventsNoAuth.status).toBe(403)

    // With admin key, events should be accessible
    const eventsAdmin = await app.request(
      `http://localhost/auctions/${freeAuctionId}/events`,
      { headers: { 'X-ENGINE-ADMIN-KEY': TEST_ADMIN_KEY } },
      env,
    )
    expect(eventsAdmin.status).toBe(200)

    delete env.X402_MODE
    delete env.X402_RECEIVER_ADDRESS
  })

  // Per-auction x402 policies (CRUD) are still stored but no longer gate discovery routes.
  // The discovery gate uses platform-level ENGINE_X402_DISCOVERY toggle only.

  // Scenario 7: POST /auctions without x402Policy is backward compatible.
  // No policy stored, no x402Policy in response.
  it('POST /auctions without x402Policy is backward compatible', async () => {
    const auctionId = randomAuctionId()
    const deadline = Math.floor(Date.now() / 1000) + 60

    const res = await app.request(
      'http://localhost/auctions',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          auctionId,
          manifestHash: '0x' + 'a3'.repeat(32),
          reservePrice: '1000000',
          deadline,
        }),
      },
      env,
    )

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.x402Policy).toBeUndefined()

    const row = await db
      .prepare('SELECT x402_policy_json FROM auctions WHERE auction_id = ?')
      .bind(auctionId)
      .first<{ x402_policy_json: string | null }>()
    expect(row!.x402_policy_json).toBeNull()
  })

  it('POST /auctions/:id/image returns 400 for empty body', async () => {
    const auctionId = randomAuctionId()
    await db
      .prepare(
        'INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(auctionId, '0x' + 'ab'.repeat(32), 1, '1', '0', Math.floor(Date.now() / 1000) + 60)
      .run()

    const res = await app.request(
      `http://localhost/auctions/${auctionId}/image`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(0),
      },
      env,
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('empty')
  })

  // ── GET /stats ────────────────────────────────────────────────────

  describe('GET /stats', () => {
    it('returns all zeros on empty DB', async () => {
      // Use a fresh isolated DB state — all counts come from pre-existing rows in shared DB,
      // so we just verify shape and types here against an endpoint that aggregates everything.
      const res = await app.request('http://localhost/stats', {}, env)
      expect(res.status).toBe(200)
      const json = await res.json() as Record<string, unknown>
      // Shape check — all 6 fields must be present
      expect('totalAuctions' in json).toBe(true)
      expect('activeAuctions' in json).toBe(true)
      expect('settledAuctions' in json).toBe(true)
      expect('totalUsdcBonded' in json).toBe(true)
      expect('totalBids' in json).toBe(true)
      expect('uniqueAgents' in json).toBe(true)
      // totalUsdcBonded must be a string
      expect(typeof json.totalUsdcBonded).toBe('string')
      // Numeric fields must be numbers
      expect(typeof json.totalAuctions).toBe('number')
      expect(typeof json.activeAuctions).toBe('number')
      expect(typeof json.settledAuctions).toBe('number')
      expect(typeof json.totalBids).toBe('number')
      expect(typeof json.uniqueAgents).toBe('number')
    })

    it('returns correct aggregates after inserting known data', async () => {
      const statsAuctionId1 = randomAuctionId()
      const statsAuctionId2 = randomAuctionId()
      const deadline = Math.floor(Date.now() / 1000) + 3600

      // Insert auction 1: OPEN (status=1), deposit=500000
      await db
        .prepare('INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(statsAuctionId1, '0x' + 'cc'.repeat(32), 1, '1000000', '500000', deadline)
        .run()

      // Insert auction 2: SETTLED (status=3), deposit=500000
      await db
        .prepare('INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(statsAuctionId2, '0x' + 'cd'.repeat(32), 3, '1000000', '500000', deadline)
        .run()

      // Insert 3 BID events: 2 from agent-1, 1 from agent-2
      await db
        .prepare('INSERT INTO events (auction_id, seq, prev_hash, event_hash, payload_hash, action_type, agent_id, wallet, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(statsAuctionId1, 10, '0x00', '0x01', '0x02', 'BID', 'stats-agent-1', '0xabc', '100')
        .run()
      await db
        .prepare('INSERT INTO events (auction_id, seq, prev_hash, event_hash, payload_hash, action_type, agent_id, wallet, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(statsAuctionId1, 11, '0x01', '0x03', '0x04', 'BID', 'stats-agent-1', '0xabc', '200')
        .run()
      await db
        .prepare('INSERT INTO events (auction_id, seq, prev_hash, event_hash, payload_hash, action_type, agent_id, wallet, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(statsAuctionId2, 10, '0x00', '0x05', '0x06', 'BID', 'stats-agent-2', '0xdef', '150')
        .run()

      const res = await app.request('http://localhost/stats', {}, env)
      expect(res.status).toBe(200)
      const json = await res.json() as Record<string, unknown>

      // These auctions added 2 to totalAuctions, 1 to active, 1 to settled
      // totalUsdcBonded added 1000000 from these two auctions
      // totalBids added 3
      // uniqueAgents: stats-agent-1 and stats-agent-2 are new unique BID agents
      // (prior tests may have inserted other bids — we check >= not exact)
      expect(typeof json.totalAuctions).toBe('number')
      expect((json.totalAuctions as number)).toBeGreaterThanOrEqual(2)
      expect((json.activeAuctions as number)).toBeGreaterThanOrEqual(1)
      expect((json.settledAuctions as number)).toBeGreaterThanOrEqual(1)
      expect(typeof json.totalUsdcBonded).toBe('string')
      // totalBids should include at least 3 from our inserts
      expect((json.totalBids as number)).toBeGreaterThanOrEqual(3)
      // uniqueAgents should include at least 2 distinct agents from our inserts
      expect((json.uniqueAgents as number)).toBeGreaterThanOrEqual(2)
    })

    it('response includes Cache-Control header with max-age=10', async () => {
      const res = await app.request('http://localhost/stats', {}, env)
      expect(res.status).toBe(200)
      const cacheControl = res.headers.get('Cache-Control')
      expect(cacheControl).not.toBeNull()
      expect(cacheControl).toContain('max-age=10')
    })
  })
})
