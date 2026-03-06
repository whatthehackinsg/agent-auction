import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { toHex } from 'viem'
import { ActionType } from '../src/types/engine'
import { AuctionRoom } from '../src/auction-room'
import { generateTestMembershipProof, setupTestProofs } from '../src/test-helpers/proof-fixtures'
import * as identityLib from '../src/lib/identity'

const TEST_AUCTION_ID = '0x' + 'ab'.repeat(32)
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
      toString: () => 'join-proof-room',
      equals: (other: { toString: () => string }) => other.toString() === 'join-proof-room',
      name: 'join-proof-room',
    },
    blockConcurrencyWhile: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    acceptWebSocket: () => {},
    getWebSockets: () => [] as unknown[],
    waitUntil: () => {},
    _storage: storage,
  } as unknown as DurableObjectState & { _storage: ReturnType<typeof createMockStorage> }
}

function createMockDb() {
  return {
    prepare: (sql: string) => ({
      bind: (..._args: unknown[]) => ({
        first: async () => {
          if (sql.includes('SELECT deposit_amount')) {
            return { deposit_amount: '0' }
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

function makeJoinRequest(proof?: unknown): Request {
  return new Request(`https://room/action?auctionId=${TEST_AUCTION_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: ActionType.JOIN,
      agentId: TEST_AGENT,
      wallet: TEST_WALLET,
      amount: '0',
      nonce: 0,
      signature: '0x' + '00'.repeat(65),
      ...(proof === undefined ? {} : { proof }),
    }),
  })
}

describe('JOIN proof enforcement', () => {
  let state: ReturnType<typeof createMockState>
  let room: AuctionRoom

  beforeAll(async () => {
    await setupTestProofs()
  }, 120000)

  beforeEach(async () => {
    state = createMockState()
    room = new AuctionRoom(state, createEnv(createMockDb()))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects JOIN without proof when ENGINE_REQUIRE_PROOFS is unset', async () => {
    const response = await room.fetch(makeJoinRequest())

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'PROOF_REQUIRED',
      detail: 'ZK proof is mandatory for this action',
    })
  })

  it('accepts JOIN with a valid Groth16 membership proof', async () => {
    const proofPayload = await generateTestMembershipProof(BigInt(TEST_AGENT), 0)
    vi.spyOn(identityLib, 'getAgentPoseidonRoot').mockResolvedValue(
      toHex(BigInt(proofPayload.publicSignals[0]), { size: 32 }),
    )

    const response = await room.fetch(makeJoinRequest(proofPayload))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect((body as { seq: number }).seq).toBe(1)
    expect(await state._storage.get(`joined:${TEST_AGENT}:${TEST_AUCTION_ID}`)).toBe(true)
    expect(await state._storage.get(`nullifier:${proofPayload.publicSignals[2]}`)).toBe(true)
  }, 120000)
})
