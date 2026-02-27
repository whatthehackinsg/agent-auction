import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Miniflare } from 'miniflare'
import { AuctionRoom } from '../src/auction-room'
import { ActionType, type ValidatedAction } from '../src/types/engine'
import { applySchema, createTestMiniflare, randomAuctionId, randomWallet } from './setup'
import { ensureAuctionOnChain, recordResultOnChain, signSettlementPacket } from '../src/lib/settlement'

vi.mock('../src/lib/settlement', () => {
  return {
    ensureAuctionOnChain: vi.fn(async () => {}),
    signSettlementPacket: vi.fn(async () => ('0x' + '11'.repeat(65)) as `0x${string}`),
    recordResultOnChain: vi.fn(async () => ('0x' + '22'.repeat(32)) as `0x${string}`),
  }
})

function createMockStorage() {
  const store = new Map<string, unknown>()
  let alarm: number | null = null

  const storage = {
    get: async <T = unknown>(key: string): Promise<T | undefined> => {
      return store.get(key) as T | undefined
    },
    put: async (key: string, value: unknown): Promise<void> => {
      store.set(key, value)
    },
    delete: async (key: string): Promise<boolean> => {
      return store.delete(key)
    },
    list: async (): Promise<Map<string, unknown>> => {
      return new Map(store)
    },
    setAlarm: async (timestamp: number): Promise<void> => {
      alarm = timestamp
    },
    getAlarm: async (): Promise<number | null> => {
      return alarm
    },
    _store: store,
  }

  return storage as unknown as DurableObjectStorage & {
    _store: Map<string, unknown>
  }
}

function createMockWebSocket() {
  const sent: string[] = []
  return {
    ws: {
      send: (msg: string) => sent.push(msg),
      close: () => {},
    } as unknown as WebSocket,
    sent,
  }
}

function createMockState(webSockets: WebSocket[] = []) {
  const storage = createMockStorage()
  const state = {
    storage,
    id: {
      toString: () => 'test-do-id',
      equals: (other: { toString: () => string }) => other.toString() === 'test-do-id',
      name: 'test-auction',
    },
    blockConcurrencyWhile: async <T>(callback: () => Promise<T>): Promise<T> => {
      return callback()
    },
    acceptWebSocket: () => {},
    getWebSockets: () => webSockets,
    waitUntil: () => {},
    _storage: storage,
  }
  return state as unknown as DurableObjectState & { _storage: ReturnType<typeof createMockStorage> }
}

function makeBid(overrides?: Partial<ValidatedAction>): ValidatedAction {
  return {
    type: ActionType.BID,
    agentId: '1',
    wallet: randomWallet(),
    amount: '100',
    nonce: 0,
    signature: '0x' + '00'.repeat(65),
    ...overrides,
  }
}

describe('Auction mechanics (Task 4c2)', () => {
  let mf: Miniflare
  let db: D1Database

  beforeEach(async () => {
    vi.clearAllMocks()
    mf = createTestMiniflare()
    db = await mf.getD1Database('AUCTION_DB')
    await applySchema(db)
  })

  it('extends deadline in snipe window and reschedules alarm', async () => {
    const auctionId = randomAuctionId()
    const now = Math.floor(Date.now() / 1000)
    const initialDeadline = now + 20

    await db
      .prepare(
        `INSERT INTO auctions
         (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline, auction_type, max_bid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(auctionId, '0x' + 'aa'.repeat(32), 1, '0', '0', initialDeadline, 'english', null)
      .run()

    const socket = createMockWebSocket()
    const state = createMockState([socket.ws])
    await state._storage.put('auctionId', auctionId)

    const env = {
      AUCTION_DB: db,
      AUCTION_ROOM: {} as DurableObjectNamespace,
      SEQUENCER_PRIVATE_KEY: (process.env.SEQUENCER_PRIVATE_KEY ?? '0x' + '11'.repeat(32)) as `0x${string}`,
    }
    const room = new AuctionRoom(state, env)
    await new Promise((r) => setTimeout(r, 0))

    await room.fetch(new Request(`https://room/init?auctionId=${auctionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startedAt: now - 60,
        deadline: initialDeadline,
        roomConfig: {
          engine: {
            snipeWindowSec: 60,
            extensionSec: 17,
            maxExtensions: 2,
          },
          future: {
            mode: 'agent-friendly',
          },
        },
      }),
    }))

    await room.ingestAction(makeBid({ agentId: '7', amount: '123' }))

    const snapshotRes = await room.fetch(new Request(`https://room/snapshot?auctionId=${auctionId}`))
    const snapshot = (await snapshotRes.json()) as Record<string, unknown>
    expect(snapshot.deadline).toBe(initialDeadline + 17)
    expect(snapshot.extensionCount).toBe(1)

    const alarm = await state._storage.getAlarm()
    expect(alarm).toBe((initialDeadline + 17) * 1000)

    const messages = socket.sent.map((msg) => JSON.parse(msg) as Record<string, unknown>)
    expect(messages.some((msg) => msg.actionType === 'DEADLINE_EXTENDED')).toBe(true)

    await mf.dispose()
  })

  it('does not extend deadline beyond maxExtensions', async () => {
    const auctionId = randomAuctionId()
    const now = Math.floor(Date.now() / 1000)
    const initialDeadline = now + 10

    await db
      .prepare(
        `INSERT INTO auctions
         (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline, auction_type, max_bid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(auctionId, '0x' + 'ab'.repeat(32), 1, '0', '0', initialDeadline, 'english', null)
      .run()

    const socket = createMockWebSocket()
    const state = createMockState([socket.ws])
    await state._storage.put('auctionId', auctionId)

    const env = {
      AUCTION_DB: db,
      AUCTION_ROOM: {} as DurableObjectNamespace,
      SEQUENCER_PRIVATE_KEY: (process.env.SEQUENCER_PRIVATE_KEY ?? '0x' + '11'.repeat(32)) as `0x${string}`,
    }
    const room = new AuctionRoom(state, env)
    await new Promise((r) => setTimeout(r, 0))

    await room.fetch(new Request(`https://room/init?auctionId=${auctionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startedAt: now - 60,
        deadline: initialDeadline,
        roomConfig: {
          engine: {
            snipeWindowSec: 60,
            extensionSec: 13,
            maxExtensions: 1,
          },
          future: {
            cohort: 'beta',
          },
        },
      }),
    }))

    await room.ingestAction(makeBid({ agentId: '1', amount: '101' }))
    await room.ingestAction(makeBid({ agentId: '2', amount: '102' }))

    const snapshotRes = await room.fetch(new Request(`https://room/snapshot?auctionId=${auctionId}`))
    const snapshot = (await snapshotRes.json()) as Record<string, unknown>
    expect(snapshot.deadline).toBe(initialDeadline + 13)
    expect(snapshot.extensionCount).toBe(1)

    const messages = socket.sent.map((msg) => JSON.parse(msg) as Record<string, unknown>)
    const extensionMessages = messages.filter((msg) => msg.actionType === 'DEADLINE_EXTENDED')
    expect(extensionMessages).toHaveLength(1)

    await mf.dispose()
  })

  it('auto-cancels no-bid auctions and broadcasts CANCEL', async () => {
    const auctionId = randomAuctionId()
    const deadline = Math.floor(Date.now() / 1000) + 60

    await db
      .prepare(
        `INSERT INTO auctions
         (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline, auction_type, max_bid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(auctionId, '0x' + 'cc'.repeat(32), 1, '0', '0', deadline, 'english', null)
      .run()

    const socket = createMockWebSocket()
    const state = createMockState([socket.ws])
    await state._storage.put('auctionId', auctionId)

    const env = {
      AUCTION_DB: db,
      AUCTION_ROOM: {} as DurableObjectNamespace,
      SEQUENCER_PRIVATE_KEY: (process.env.SEQUENCER_PRIVATE_KEY ?? '0x' + '11'.repeat(32)) as `0x${string}`,
    }

    const room = new AuctionRoom(state, env)
    await new Promise((r) => setTimeout(r, 0))
    await room.closeAuction(auctionId)

    expect(recordResultOnChain).not.toHaveBeenCalled()
    expect(signSettlementPacket).not.toHaveBeenCalled()
    expect(ensureAuctionOnChain).not.toHaveBeenCalled()

    const row = await db
      .prepare('SELECT status FROM auctions WHERE auction_id = ?')
      .bind(auctionId)
      .first<{ status: number }>()
    expect(row?.status).toBe(4)

    const messages = socket.sent.map((msg) => JSON.parse(msg) as Record<string, unknown>)
    const cancelMessage = messages.find((msg) => msg.actionType === 'CANCEL')
    expect(cancelMessage).toBeTruthy()

    const snapshotRes = await room.fetch(new Request(`https://room/snapshot?auctionId=${auctionId}`))
    const snapshot = (await snapshotRes.json()) as Record<string, unknown>
    expect(snapshot.status).toBe(4)
    expect(snapshot.terminalType).toBe('CANCEL')

    await mf.dispose()
  })

  it('broadcasts CLOSE with winner info after successful close', async () => {
    const auctionId = randomAuctionId()
    const deadline = Math.floor(Date.now() / 1000) + 60

    await db
      .prepare(
        `INSERT INTO auctions
         (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline, auction_type, max_bid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(auctionId, '0x' + 'dd'.repeat(32), 1, '0', '0', deadline, 'english', null)
      .run()

    const winnerWallet = randomWallet()
    const socket = createMockWebSocket()
    const state = createMockState([socket.ws])
    await state._storage.put('auctionId', auctionId)

    const env = {
      AUCTION_DB: db,
      AUCTION_ROOM: {} as DurableObjectNamespace,
      SEQUENCER_PRIVATE_KEY: (process.env.SEQUENCER_PRIVATE_KEY ?? '0x' + '11'.repeat(32)) as `0x${string}`,
    }
    const room = new AuctionRoom(state, env)
    await new Promise((r) => setTimeout(r, 0))

    await room.ingestAction(makeBid({ agentId: '1', wallet: randomWallet(), amount: '100' }))
    await room.ingestAction(makeBid({ agentId: '2', wallet: winnerWallet, amount: '150' }))
    await room.closeAuction(auctionId)

    expect(recordResultOnChain).toHaveBeenCalledTimes(1)
    const messages = socket.sent.map((msg) => JSON.parse(msg) as Record<string, unknown>)
    const closeMessage = messages.find((msg) => msg.actionType === 'CLOSE')
    expect(closeMessage).toBeTruthy()
    expect(closeMessage?.agentId).toBe('2')
    expect(closeMessage?.wallet).toBe(winnerWallet)
    expect(closeMessage?.amount).toBe('150')

    const snapshotRes = await room.fetch(new Request(`https://room/snapshot?auctionId=${auctionId}`))
    const snapshot = (await snapshotRes.json()) as Record<string, unknown>
    expect(snapshot.status).toBe(2)
    expect(snapshot.terminalType).toBe('CLOSE')
    expect(snapshot.winnerAgentId).toBe('2')
    expect(snapshot.winningBidAmount).toBe('150')

    await mf.dispose()
  })

  it('POST /cancel enforces 72-hour timeout before cancellation', async () => {
    const auctionId = randomAuctionId()
    const now = Math.floor(Date.now() / 1000)
    const deadline = now - 3600

    await db
      .prepare(
        `INSERT INTO auctions
         (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline, auction_type, max_bid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(auctionId, '0x' + 'ee'.repeat(32), 1, '0', '0', deadline, 'english', null)
      .run()

    const state = createMockState()
    await state._storage.put('auctionId', auctionId)
    const env = {
      AUCTION_DB: db,
      AUCTION_ROOM: {} as DurableObjectNamespace,
      SEQUENCER_PRIVATE_KEY: (process.env.SEQUENCER_PRIVATE_KEY ?? '0x' + '11'.repeat(32)) as `0x${string}`,
    }

    const room = new AuctionRoom(state, env)
    await new Promise((r) => setTimeout(r, 0))

    const tooEarly = await room.fetch(new Request(`https://room/cancel?auctionId=${auctionId}`, { method: 'POST' }))
    expect(tooEarly.status).toBe(400)

    await db
      .prepare('UPDATE auctions SET deadline = ? WHERE auction_id = ?')
      .bind(now - (72 * 3600 + 1), auctionId)
      .run()

    const ok = await room.fetch(new Request(`https://room/cancel?auctionId=${auctionId}`, { method: 'POST' }))
    expect(ok.status).toBe(200)

    const row = await db
      .prepare('SELECT status FROM auctions WHERE auction_id = ?')
      .bind(auctionId)
      .first<{ status: number }>()
    expect(row?.status).toBe(4)

    await mf.dispose()
  })
})
