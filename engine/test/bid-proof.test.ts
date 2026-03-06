import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ActionType } from '../src/types/engine'
import { AuctionRoom } from '../src/auction-room'
import { generateTestBidRangeProof, setupTestProofs } from '../src/test-helpers/proof-fixtures'

const TEST_AUCTION_ID = '0x' + 'cd'.repeat(32)
const TEST_WALLET = '0x1234567890abcdef1234567890abcdef12345678'
const TEST_AGENT = '12345'

function createMockStorage() {
  const store = new Map<string, unknown>()
  return {
    get: async <T = unknown>(key: string): Promise<T | undefined> => store.get(key) as T | undefined,
    put: async (key: string, value: unknown): Promise<void> => {
      store.set(key, value)
    },
    delete: async (key: string): Promise<boolean> => store.delete(key),
    list: async (): Promise<Map<string, unknown>> => new Map(store),
    setAlarm: async (_timestamp: number): Promise<void> => {},
    getAlarm: async (): Promise<number | null> => null,
    _store: store,
  }
}

function createMockState() {
  const storage = createMockStorage()
  return {
    storage,
    id: {
      toString: () => 'bid-proof-room',
      equals: (other: { toString: () => string }) => other.toString() === 'bid-proof-room',
      name: 'bid-proof-room',
    },
    blockConcurrencyWhile: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    acceptWebSocket: () => {},
    getWebSockets: () => [] as unknown[],
    waitUntil: () => {},
    _storage: storage,
  } as unknown as DurableObjectState & { _storage: ReturnType<typeof createMockStorage> }
}

function createMockDb(maxBid = '3000000') {
  return {
    prepare: (sql: string) => ({
      bind: (..._args: unknown[]) => ({
        first: async () => {
          if (sql.includes('SELECT max_bid')) {
            return { max_bid: maxBid }
          }
          return null
        },
        all: async () => ({ results: [] }),
        run: async () => ({ success: true }),
      }),
    }),
  } as unknown as D1Database
}

function createEnv(db: D1Database) {
  return {
    AUCTION_DB: db,
    AUCTION_ROOM: {} as DurableObjectNamespace,
    SEQUENCER_PRIVATE_KEY: '0x' + '11'.repeat(32),
    ENGINE_VERIFY_WALLET: 'false',
  }
}

function makeBidRequest(proof?: unknown): Request {
  return new Request(`https://room/action?auctionId=${TEST_AUCTION_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: ActionType.BID,
      agentId: TEST_AGENT,
      wallet: TEST_WALLET,
      amount: '2000000',
      nonce: 0,
      signature: '0x' + '00'.repeat(65),
      ...(proof === undefined ? {} : { proof }),
    }),
  })
}

describe('BID proof enforcement (Node-style room coverage)', () => {
  let state: ReturnType<typeof createMockState>
  let room: AuctionRoom

  beforeAll(async () => {
    await setupTestProofs()
  }, 120000)

  beforeEach(async () => {
    state = createMockState()
    await state._storage.put('auctionId', TEST_AUCTION_ID)
    await state._storage.put('highestBid', '1000000')
    room = new AuctionRoom(state, createEnv(createMockDb()))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it('rejects BID without proof when ENGINE_REQUIRE_PROOFS is unset', async () => {
    const response = await room.fetch(makeBidRequest())

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'PROOF_REQUIRED',
      detail: 'ZK proof is mandatory for this action',
    })
  })

  it('accepts BID with a valid Groth16 bid range proof', async () => {
    const proofPayload = await generateTestBidRangeProof(BigInt(TEST_AGENT), 2_000_000n, 1_000_000n, 3_000_000n)
    const response = await room.fetch(makeBidRequest(proofPayload))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect((body as { seq: number }).seq).toBe(1)
    expect(await state._storage.get('nonce:12345:BID')).toBe(0)
  }, 120000)
})
