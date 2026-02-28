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
      {},
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

  it('manifest/events endpoints return 402 when x402 mode is on and no payment provided', async () => {
    const auctionId = randomAuctionId()
    env.X402_MODE = 'on'
    env.X402_RECEIVER_ADDRESS = '0x' + '11'.repeat(20)

    const manifestRes = await app.request(`http://localhost/auctions/${auctionId}/manifest`, {}, env)
    expect(manifestRes.status).toBe(402)

    const eventsRes = await app.request(`http://localhost/auctions/${auctionId}/events`, {}, env)
    expect(eventsRes.status).toBe(402)

    delete env.X402_MODE
    delete env.X402_RECEIVER_ADDRESS
  })

  it('manifest/events endpoints reject duplicate payment-signature receipt hash', async () => {
    const auctionId = randomAuctionId()
    env.X402_MODE = 'on'
    env.X402_RECEIVER_ADDRESS = '0x' + '11'.repeat(20)

    const paymentSignature = 'base64-mock-payload'
    const receiptHash = await sha256Hex(paymentSignature)
    await db
      .prepare('INSERT INTO x402_receipts (receipt_hash, used_at) VALUES (?, ?)')
      .bind(receiptHash, Math.floor(Date.now() / 1000))
      .run()

    const res = await app.request(
      `http://localhost/auctions/${auctionId}/manifest`,
      { headers: { 'PAYMENT-SIGNATURE': paymentSignature } },
      env,
    )
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toContain('duplicate PAYMENT-SIGNATURE')

    delete env.X402_MODE
    delete env.X402_RECEIVER_ADDRESS
  })

  it('x402 mode on fails closed when receiver address is missing', async () => {
    const auctionId = randomAuctionId()
    env.X402_MODE = 'on'
    delete env.X402_RECEIVER_ADDRESS

    const res = await app.request(`http://localhost/auctions/${auctionId}/manifest`, {}, env)
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toContain('X402_RECEIVER_ADDRESS')

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

  // ── Per-Auction x402 Policy: Real Scenarios ────────────────────────

  // Scenario 1: Admin creates a premium auction that charges even on a free platform.
  // Both manifest and events endpoints must return 402.
  it('premium auction (mode=on) charges on both manifest AND events even when platform is off', async () => {
    const auctionId = randomAuctionId()
    const receiverAddr = '0x' + '44'.repeat(20)

    await db
      .prepare('INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline, x402_policy_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(
        auctionId,
        '0x' + 'ab'.repeat(32),
        1,
        '1',
        '0',
        Math.floor(Date.now() / 1000) + 60,
        JSON.stringify({ mode: 'on', receiverAddress: receiverAddr }),
      )
      .run()

    // Platform is off
    delete env.X402_MODE
    delete env.X402_RECEIVER_ADDRESS

    const manifestRes = await app.request(
      `http://localhost/auctions/${auctionId}/manifest`,
      {},
      env,
    )
    expect(manifestRes.status).toBe(402)
    // x402 middleware sets PAYMENT-REQUIRED header with payment requirements
    expect(manifestRes.headers.get('PAYMENT-REQUIRED')).toBeTruthy()

    const eventsRes = await app.request(
      `http://localhost/auctions/${auctionId}/events`,
      {},
      env,
    )
    expect(eventsRes.status).toBe(402)
    expect(eventsRes.headers.get('PAYMENT-REQUIRED')).toBeTruthy()
  })

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

    // Events also free
    const eventsRes = await app.request(
      `http://localhost/auctions/${freeAuctionId}/events`,
      {},
      env,
    )
    expect(eventsRes.status).toBe(200)

    delete env.X402_MODE
    delete env.X402_RECEIVER_ADDRESS
  })

  // Scenario 3: Two auctions coexist with different policies under the same platform.
  // Auction A charges (mode=on), Auction B is free (mode=off).
  it('two auctions coexist: A charges, B is free, on same platform', async () => {
    const paidAuctionId = randomAuctionId()
    const freeAuctionId = randomAuctionId()
    const receiverAddr = '0x' + '66'.repeat(20)

    await db
      .prepare('INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline, x402_policy_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(paidAuctionId, '0x' + 'ab'.repeat(32), 1, '1', '0', Math.floor(Date.now() / 1000) + 60,
        JSON.stringify({ mode: 'on', receiverAddress: receiverAddr }))
      .run()

    await db
      .prepare('INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline, title, x402_policy_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(freeAuctionId, '0x' + 'cd'.repeat(32), 1, '1', '0', Math.floor(Date.now() / 1000) + 60, 'Free',
        JSON.stringify({ mode: 'off' }))
      .run()

    // Platform is off — policy differences are purely per-auction
    delete env.X402_MODE
    delete env.X402_RECEIVER_ADDRESS

    const paidRes = await app.request(`http://localhost/auctions/${paidAuctionId}/manifest`, {}, env)
    expect(paidRes.status).toBe(402)

    const freeRes = await app.request(`http://localhost/auctions/${freeAuctionId}/manifest`, {}, env)
    expect(freeRes.status).toBe(200)
  })

  // Scenario 4: Auction with no x402 policy inherits platform ON → 402.
  it('auction with no x402Policy inherits platform ON → 402', async () => {
    const auctionId = randomAuctionId()

    await db
      .prepare('INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(auctionId, '0x' + 'ab'.repeat(32), 1, '1', '0', Math.floor(Date.now() / 1000) + 60)
      .run()

    env.X402_MODE = 'on'
    env.X402_RECEIVER_ADDRESS = '0x' + '77'.repeat(20)

    const res = await app.request(`http://localhost/auctions/${auctionId}/manifest`, {}, env)
    expect(res.status).toBe(402)

    delete env.X402_MODE
    delete env.X402_RECEIVER_ADDRESS
  })

  // Scenario 5: Full lifecycle — create auction with policy via POST → gate enforced
  // → admin PATCHes policy → gate changes.
  it('full lifecycle: create with mode=on, verify 402, PATCH to off, verify 200', async () => {
    const auctionId = randomAuctionId()
    const deadline = Math.floor(Date.now() / 1000) + 60
    const receiverAddr = '0x' + '88'.repeat(20)

    // Platform is off — auction-level override is the only gate
    delete env.X402_MODE
    delete env.X402_RECEIVER_ADDRESS

    // Step 1: Create auction with mode=on via POST /auctions
    const createRes = await app.request(
      'http://localhost/auctions',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          auctionId,
          manifestHash: '0x' + 'a1'.repeat(32),
          reservePrice: '1000000',
          deadline,
          x402Policy: { mode: 'on', priceManifest: '$0.005', receiverAddress: receiverAddr },
        }),
      },
      env,
    )
    expect(createRes.status).toBe(201)
    const createJson = await createRes.json()
    expect(createJson.x402Policy.mode).toBe('on')
    expect(createJson.x402Policy.priceManifest).toBe('$0.005')

    // Step 2: Verify manifest is gated (402)
    const gatedRes = await app.request(
      `http://localhost/auctions/${auctionId}/manifest`,
      {},
      env,
    )
    expect(gatedRes.status).toBe(402)

    // Step 3: Admin PATCHes policy to off
    const patchRes = await app.request(
      `http://localhost/auctions/${auctionId}/x402-policy`,
      {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ mode: 'off' }),
      },
      env,
    )
    expect(patchRes.status).toBe(200)

    // Step 4: Verify manifest is now free (200)
    const freeRes = await app.request(
      `http://localhost/auctions/${auctionId}/manifest`,
      {},
      env,
    )
    expect(freeRes.status).toBe(200)
    const manifestJson = await freeRes.json()
    expect(manifestJson.auctionId).toBe(auctionId)
  })

  // Scenario 6: Receipt dedup works with per-auction override active.
  // A replay of the same payment-signature is rejected with 409 even
  // when the per-auction policy is in effect (not just platform mode).
  it('receipt dedup still rejects replayed payment-signature under per-auction policy', async () => {
    const auctionId = randomAuctionId()
    const receiverAddr = '0x' + '99'.repeat(20)

    await db
      .prepare('INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline, x402_policy_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(
        auctionId,
        '0x' + 'ab'.repeat(32),
        1,
        '1',
        '0',
        Math.floor(Date.now() / 1000) + 60,
        JSON.stringify({ mode: 'on', receiverAddress: receiverAddr }),
      )
      .run()

    delete env.X402_MODE
    delete env.X402_RECEIVER_ADDRESS

    // Pre-insert a receipt to simulate a previously used payment
    const paymentSignature = 'per-auction-payment-sig-' + auctionId.slice(0, 8)
    const receiptHash = await sha256Hex(paymentSignature)
    await db
      .prepare('INSERT INTO x402_receipts (receipt_hash, used_at) VALUES (?, ?)')
      .bind(receiptHash, Math.floor(Date.now() / 1000))
      .run()

    // Replay the same payment → 409
    const res = await app.request(
      `http://localhost/auctions/${auctionId}/manifest`,
      { headers: { 'PAYMENT-SIGNATURE': paymentSignature } },
      env,
    )
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toContain('duplicate PAYMENT-SIGNATURE')
  })

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
})
