import { describe, it, expect, beforeEach } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { AuctionRoom } from '../src/auction-room'
import { ActionType, type ValidatedAction } from '../src/types/engine'
import {
  buildInclusionReceiptDigest,
  signInclusionReceipt,
  verifyInclusionReceipt,
} from '../src/lib/inclusion-receipt'

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

function createMockEnv(privateKey: `0x${string}`) {
  return {
    AUCTION_DB: {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          run: async () => ({ success: true }),
          all: async () => ({ results: [] }),
        }),
      }),
    } as unknown as D1Database,
    AUCTION_ROOM: {} as DurableObjectNamespace,
    SEQUENCER_PRIVATE_KEY: privateKey,
  }
}

function makeBid(overrides?: Partial<ValidatedAction>): ValidatedAction {
  return {
    type: ActionType.BID,
    agentId: '123',
    wallet: '0x' + '11'.repeat(20),
    amount: '1000000',
    nonce: 0,
    signature: '0x' + '00'.repeat(65),
    ...overrides,
  }
}

describe('Inclusion receipt signing (Task 15)', () => {
  const privateKey = ('0x' + '12'.repeat(32)) as `0x${string}`
  const account = privateKeyToAccount(privateKey)

  it('signInclusionReceipt produces a signature verifiable by sequencer address', async () => {
    const receipt = await signInclusionReceipt(
      {
        auctionId: ('0x' + 'aa'.repeat(32)) as `0x${string}`,
        seq: 1,
        eventHash: ('0x' + 'bb'.repeat(32)) as `0x${string}`,
        prevHash: ('0x' + '00'.repeat(32)) as `0x${string}`,
        actionType: ActionType.BID,
        receivedAt: 1700000000,
      },
      privateKey,
    )

    expect(receipt.sequencerSig).toMatch(/^0x[0-9a-f]{130}$/)
    const ok = await verifyInclusionReceipt(receipt, account.address)
    expect(ok).toBe(true)
  })

  it('ingestAction response includes sequencerSig for inclusion proof', async () => {
    const state = createMockState()
    await state._storage.put('auctionId', '0x' + 'aa'.repeat(32))
    const env = createMockEnv(privateKey)
    const room = new AuctionRoom(state, env)
    await new Promise((r) => setTimeout(r, 0))

    const result = await room.ingestAction(makeBid())
    expect(result.sequencerSig).toMatch(/^0x[0-9a-f]{130}$/)

    const digest = buildInclusionReceiptDigest(
      ('0x' + 'aa'.repeat(32)) as `0x${string}`,
      result.seq,
      result.eventHash as `0x${string}`,
    )
    const receiptOk = await verifyInclusionReceipt(
      {
        auctionId: ('0x' + 'aa'.repeat(32)) as `0x${string}`,
        seq: result.seq,
        eventHash: result.eventHash,
        prevHash: result.prevHash,
        actionType: ActionType.BID,
        receivedAt: 0,
        sequencerSig: result.sequencerSig,
      },
      account.address,
    )

    expect(digest).toMatch(/^0x[0-9a-f]{64}$/)
    expect(receiptOk).toBe(true)
  })
})
