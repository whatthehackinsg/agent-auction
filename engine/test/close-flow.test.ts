import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Miniflare } from 'miniflare'
import { AuctionRoom } from '../src/auction-room'
import { ActionType, type ValidatedAction } from '../src/types/engine'
import { applySchema, createTestMiniflare, randomAuctionId, randomWallet } from './setup'
import { recordResultOnChain, signSettlementPacket } from '../src/lib/settlement'

vi.mock('../src/lib/settlement', () => {
  return {
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

function createMockState() {
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
    getWebSockets: () => [] as unknown[],
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

describe('Auction close flow (Task 13)', () => {
  let mf: Miniflare
  let db: D1Database

  beforeEach(async () => {
    mf = createTestMiniflare()
    db = await mf.getD1Database('AUCTION_DB')
    await applySchema(db)
  })

  it('determines winner as the highest BID and rejects post-close bids', async () => {
    const auctionId = randomAuctionId()
    const manifestHash = '0x' + 'aa'.repeat(32)
    const deadline = Math.floor(Date.now() / 1000) + 60

    await db
      .prepare(
        'INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(auctionId, manifestHash, 1, '0', '0', deadline)
      .run()

    const state = createMockState()
    await state._storage.put('auctionId', auctionId)

    const env = {
      AUCTION_DB: db,
      AUCTION_ROOM: {} as DurableObjectNamespace,
      SEQUENCER_PRIVATE_KEY: ('0x' + '11'.repeat(32)) as `0x${string}`,
    }

    const room = new AuctionRoom(state, env)
    await new Promise((r) => setTimeout(r, 0))

    await room.ingestAction(makeBid({ agentId: '1', wallet: randomWallet(), amount: '100' }))
    await room.ingestAction(makeBid({ agentId: '2', wallet: randomWallet(), amount: '150' }))
    await room.ingestAction(makeBid({ agentId: '3', wallet: randomWallet(), amount: '120' }))

    await room.closeAuction(auctionId)

    expect(signSettlementPacket).toHaveBeenCalledTimes(1)
    expect(recordResultOnChain).toHaveBeenCalledTimes(1)

    const [packetArg] = (recordResultOnChain as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
    const packet = packetArg as Record<string, unknown>
    expect(packet.auctionId).toBe(auctionId)
    expect(packet.manifestHash).toBe(manifestHash)
    expect(packet.finalLogHash).toBe(room.getChainHead())
    expect(packet.winnerAgentId).toBe(2n)
    expect(packet.winningBidAmount).toBe(150n)

    const row = await db
      .prepare('SELECT status FROM auctions WHERE auction_id = ?')
      .bind(auctionId)
      .first<{ status: number }>()
    expect(row).not.toBeNull()
    expect(row!.status).toBe(2)

    const res = await room.fetch(
      new Request(`https://room/action?auctionId=${auctionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: ActionType.BID,
          agentId: '4',
          wallet: randomWallet(),
          amount: '200',
          nonce: 0,
          signature: '0x' + '00'.repeat(65),
        }),
      }),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect((body as { error: string }).error).toContain('closed')

    await mf.dispose()
  })

  it('alarm triggers closeAuction', async () => {
    const auctionId = randomAuctionId()
    const manifestHash = '0x' + 'bb'.repeat(32)
    const deadline = Math.floor(Date.now() / 1000) + 1

    await db
      .prepare(
        'INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(auctionId, manifestHash, 1, '0', '0', deadline)
      .run()

    const state = createMockState()
    await state._storage.put('auctionId', auctionId)

    const env = {
      AUCTION_DB: db,
      AUCTION_ROOM: {} as DurableObjectNamespace,
      SEQUENCER_PRIVATE_KEY: ('0x' + '11'.repeat(32)) as `0x${string}`,
    }

    const room = new AuctionRoom(state, env)
    await new Promise((r) => setTimeout(r, 0))

    // Ensure at least one bid exists
    await room.ingestAction(makeBid({ agentId: '9', wallet: randomWallet(), amount: '1' }))

    await room.alarm()

    expect(recordResultOnChain).toHaveBeenCalled()
    await mf.dispose()
  })
})
