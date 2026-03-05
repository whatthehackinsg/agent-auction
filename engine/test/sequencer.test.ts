/**
 * Tests for AuctionRoom sequencer logic (ingestAction).
 *
 * Verifies monotonic seq assignment, hash chain integrity,
 * DO storage persistence, and D1 persistence.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { AuctionRoom } from '../src/auction-room'
import { ActionType, type ValidatedAction } from '../src/types/engine'

const ZERO_HASH_HEX = '0x' + '00'.repeat(32)

// ─── Mock Helpers ─────────────────────────────────────────────────────

/** In-memory storage mock */
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
    _store: store,
  }
}

/** Create a mock DurableObjectState */
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
  return state as unknown as DurableObjectState & {
    _storage: ReturnType<typeof createMockStorage>
  }
}

/** Track D1 inserts for assertion */
interface D1Insert {
  sql: string
  bindings: unknown[]
}

/** Create a mock Env with D1 that records inserts */
function createMockEnv() {
  const inserts: D1Insert[] = []
  return {
    AUCTION_DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          run: async () => {
            inserts.push({ sql, bindings: args })
            return { success: true }
          },
          all: async () => ({ results: [] }),
        }),
      }),
    } as unknown as D1Database,
    AUCTION_ROOM: {} as DurableObjectNamespace,
    SEQUENCER_PRIVATE_KEY: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    _inserts: inserts,
  }
}

/** Create a valid test action */
function makeAction(overrides?: Partial<ValidatedAction>): ValidatedAction {
  return {
    type: ActionType.BID,
    agentId: '12345',
    wallet: '0x1234567890abcdef1234567890abcdef12345678',
    amount: '1000000',
    nonce: 1,
    signature: '0x00',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('Sequencer (ingestAction)', () => {
  let state: ReturnType<typeof createMockState>
  let env: ReturnType<typeof createMockEnv>
  let room: AuctionRoom

  beforeEach(async () => {
    state = createMockState()
    env = createMockEnv()
    // Set auctionId in storage so ingestAction can use it for D1
    await state._storage.put('auctionId', '0x' + 'aa'.repeat(32))
    room = new AuctionRoom(state, env)
    await new Promise((r) => setTimeout(r, 0))
  })

  // ─── 1. Seq Monotonicity ──────────────────────────────────────────

  it('assigns monotonic sequence numbers 1, 2, 3', async () => {
    const r1 = await room.ingestAction(makeAction({ nonce: 1 }))
    const r2 = await room.ingestAction(makeAction({ nonce: 2 }))
    const r3 = await room.ingestAction(makeAction({ nonce: 3 }))

    expect(r1.seq).toBe(1)
    expect(r2.seq).toBe(2)
    expect(r3.seq).toBe(3)
    expect(room.getSeqCounter()).toBe(3)
  })

  // ─── 2. Hash Chain Integrity ──────────────────────────────────────

  it('chains hashes: prevHash of event N+1 equals eventHash of event N', async () => {
    const r1 = await room.ingestAction(makeAction({ nonce: 1 }))
    const r2 = await room.ingestAction(makeAction({ nonce: 2 }))
    const r3 = await room.ingestAction(makeAction({ nonce: 3 }))

    expect(r2.prevHash).toBe(r1.eventHash)
    expect(r3.prevHash).toBe(r2.eventHash)
  })

  // ─── 3. First Event PrevHash is Zero Hash ─────────────────────────

  it('first event prevHash is the zero hash', async () => {
    const r1 = await room.ingestAction(makeAction())
    expect(r1.prevHash).toBe(ZERO_HASH_HEX)
  })

  // ─── 4. DO Storage Persistence ────────────────────────────────────

  it('persists seqCounter, chainHead, and event to DO storage', async () => {
    const r1 = await room.ingestAction(makeAction())

    const storedSeq = await state._storage.get<number>('seqCounter')
    const storedHead = await state._storage.get<string>('chainHead')
    const storedEvent = await state._storage.get<Record<string, unknown>>('event:1')

    expect(storedSeq).toBe(1)
    expect(storedHead).toBe(r1.eventHash)
    expect(storedEvent).toBeDefined()
    expect(storedEvent!.seq).toBe(1)
    expect(storedEvent!.prevHash).toBe(ZERO_HASH_HEX)
    expect(storedEvent!.eventHash).toBe(r1.eventHash)
    expect(storedEvent!.actionType).toBe(ActionType.BID)
    expect(storedEvent!.agentId).toBe('12345')
    expect(storedEvent!.wallet).toBe('0x1234567890abcdef1234567890abcdef12345678')
    expect(storedEvent!.amount).toBe('1000000')
  })

  // ─── 5. D1 Persistence ────────────────────────────────────────────

  it('inserts event into D1 with correct bindings', async () => {
    const r1 = await room.ingestAction(makeAction())

    expect(env._inserts).toHaveLength(1)
    const insert = env._inserts[0]
    expect(insert.sql).toContain('INSERT INTO events')
    expect(insert.bindings).toEqual([
      '0x' + 'aa'.repeat(32),  // auction_id
      1,                        // seq
      ZERO_HASH_HEX,           // prev_hash
      r1.eventHash,            // event_hash
      expect.stringMatching(/^0x[0-9a-f]+$/), // payload_hash
      'BID',                   // action_type
      '12345',                 // agent_id
      '0x1234567890abcdef1234567890abcdef12345678', // wallet
      '1000000',               // amount
      null,                    // zk_nullifier
    ])
  })

  // ─── 6. Different Inputs → Different Hashes ───────────────────────

  it('different bid amounts produce different eventHashes', async () => {
    // Create two separate rooms to get seq=1 for both
    const state2 = createMockState()
    const env2 = createMockEnv()
    await state2._storage.put('auctionId', '0x' + 'aa'.repeat(32))
    const room2 = new AuctionRoom(state2, env2)
    await new Promise((r) => setTimeout(r, 0))

    const r1 = await room.ingestAction(makeAction({ amount: '1000000' }))
    const r2 = await room2.ingestAction(makeAction({ amount: '2000000' }))

    expect(r1.eventHash).not.toBe(r2.eventHash)
  })

  // ─── 7. ChainHead Updates ─────────────────────────────────────────

  it('updates chainHead after each ingest', async () => {
    expect(room.getChainHead()).toBe(ZERO_HASH_HEX)

    const r1 = await room.ingestAction(makeAction({ nonce: 1 }))
    expect(room.getChainHead()).toBe(r1.eventHash)

    const r2 = await room.ingestAction(makeAction({ nonce: 2 }))
    expect(room.getChainHead()).toBe(r2.eventHash)
    expect(room.getChainHead()).not.toBe(r1.eventHash)
  })

  // ─── 8. All Event Hashes Are Unique ───────────────────────────────

  it('all event hashes in a chain are unique', async () => {
    const results = []
    for (let i = 0; i < 5; i++) {
      results.push(await room.ingestAction(makeAction({ nonce: i })))
    }
    const hashes = results.map((r) => r.eventHash)
    const uniqueHashes = new Set(hashes)
    expect(uniqueHashes.size).toBe(5)
  })

  // ─── 9. Event Hash Format ─────────────────────────────────────────

  it('returns 0x-prefixed hex strings for eventHash and prevHash', async () => {
    const r1 = await room.ingestAction(makeAction())
    expect(r1.eventHash).toMatch(/^0x[0-9a-f]{64}$/)
    expect(r1.prevHash).toMatch(/^0x[0-9a-f]{64}$/)
  })
})
