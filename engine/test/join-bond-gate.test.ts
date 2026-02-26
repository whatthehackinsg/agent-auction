import { describe, it, expect, beforeEach } from 'vitest'
import { Miniflare } from 'miniflare'
import { ActionType } from '../src/types/engine'
import { AuctionRoom } from '../src/auction-room'
import { applySchema, createTestMiniflare, randomAuctionId, randomWallet } from './setup'

function createMockStorage() {
  const store = new Map<string, unknown>()
  return {
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
    setAlarm: async (_timestamp: number): Promise<void> => {},
    _store: store,
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

describe('JOIN bond gate (Task 16)', () => {
  let mf: Miniflare
  let db: D1Database

  beforeEach(async () => {
    mf = createTestMiniflare()
    db = await mf.getD1Database('AUCTION_DB')
    await applySchema(db)
  })

  it('rejects JOIN while bond observation is pending and times out after 60s', { timeout: 15000 }, async () => {
    const auctionId = randomAuctionId()
    const wallet = randomWallet()

    await db
      .prepare(
        'INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(auctionId, '0x' + 'aa'.repeat(32), 1, '100', '500000', Math.floor(Date.now() / 1000) + 3600)
      .run()

    const state = createMockState()
    const env = {
      AUCTION_DB: db,
      AUCTION_ROOM: {} as DurableObjectNamespace,
      SEQUENCER_PRIVATE_KEY: (process.env.SEQUENCER_PRIVATE_KEY ?? '0x' + '11'.repeat(32)) as `0x${string}`,
    }

    const room = new AuctionRoom(state, env)
    await new Promise((r) => setTimeout(r, 0))

    const makeJoinRequest = () =>
      new Request(`https://room/action?auctionId=${auctionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: ActionType.JOIN,
          agentId: '777',
          wallet,
          amount: '0',
          nonce: 0,
          signature: '0x' + '00'.repeat(65),
        }),
      })

    const pendingRes = await room.fetch(makeJoinRequest())
    expect(pendingRes.status).toBe(400)
    const pendingBody = await pendingRes.json()
    expect((pendingBody as { error: string }).error).toContain('bond pending')

    // Force pending request into timeout window.
    await db
      .prepare(
        "UPDATE bond_observations SET requested_at = ?, status = 'PENDING' WHERE auction_id = ? AND agent_id = ?",
      )
      .bind(Math.floor(Date.now() / 1000) - 120, auctionId, '777')
      .run()

    const timeoutRes = await room.fetch(makeJoinRequest())
    expect(timeoutRes.status).toBe(400)
    const timeoutBody = await timeoutRes.json()
    expect((timeoutBody as { error: string }).error).toContain('timeout')

    await mf.dispose()
  })
})
