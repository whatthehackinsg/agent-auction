/**
 * Tests for action validation handlers.
 *
 * Verifies nonce tracking, nullifier checking, bid validation,
 * and the validateAction dispatcher.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ActionType, type ActionRequest } from '../src/types/engine'
import {
  checkNonce,
  checkNullifier,
  commitValidationMutation,
  handleJoin,
  handleBid,
  handleDeliver,
  validateAction,
} from '../src/handlers/actions'

// ─── Mock Helpers ─────────────────────────────────────────────────────

/** In-memory storage mock (same pattern as sequencer.test.ts) */
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
  } as unknown as DurableObjectStorage & { _store: Map<string, unknown> }
}

const TEST_AUCTION_ID = '0x' + 'aa'.repeat(32)
const TEST_WALLET = '0x1234567890abcdef1234567890abcdef12345678'
const TEST_AGENT = '12345'

/** Create a valid test action request */
function makeAction(overrides?: Partial<ActionRequest>): ActionRequest {
  return {
    type: ActionType.JOIN,
    agentId: TEST_AGENT,
    wallet: TEST_WALLET,
    amount: '0',
    nonce: 0,
    signature: '0x' + '00'.repeat(65),
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('checkNonce', () => {
  let storage: ReturnType<typeof createMockStorage>

  beforeEach(() => {
    storage = createMockStorage()
    process.env.ENGINE_ALLOW_INSECURE_STUBS = 'true'
  })

  afterEach(() => {
    delete process.env.ENGINE_ALLOW_INSECURE_STUBS
  })

  it('accepts nonce 0 for first action', async () => {
    await expect(
      checkNonce(TEST_AGENT, ActionType.JOIN, 0, storage),
    ).resolves.toBeUndefined()

    expect(storage._store.get(`nonce:${TEST_AGENT}:JOIN`)).toBeUndefined()
  })

  it('rejects non-zero nonce for first action', async () => {
    await expect(
      checkNonce(TEST_AGENT, ActionType.JOIN, 1, storage),
    ).rejects.toThrow('expected 0')
  })

  it('accepts sequential nonces 0, 1, 2', async () => {
    await checkNonce(TEST_AGENT, ActionType.BID, 0, storage)
    await commitValidationMutation(
      { agentId: TEST_AGENT, actionType: ActionType.BID, nonce: 0 },
      storage,
    )
    await checkNonce(TEST_AGENT, ActionType.BID, 1, storage)
    await commitValidationMutation(
      { agentId: TEST_AGENT, actionType: ActionType.BID, nonce: 1 },
      storage,
    )
    await checkNonce(TEST_AGENT, ActionType.BID, 2, storage)
    await commitValidationMutation(
      { agentId: TEST_AGENT, actionType: ActionType.BID, nonce: 2 },
      storage,
    )

    expect(storage._store.get(`nonce:${TEST_AGENT}:BID`)).toBe(2)
  })

  it('rejects duplicate nonce', async () => {
    await commitValidationMutation(
      { agentId: TEST_AGENT, actionType: ActionType.BID, nonce: 0 },
      storage,
    )
    await expect(
      checkNonce(TEST_AGENT, ActionType.BID, 0, storage),
    ).rejects.toThrow('expected 1')
  })
})

describe('checkNullifier', () => {
  let storage: ReturnType<typeof createMockStorage>

  beforeEach(() => {
    storage = createMockStorage()
    process.env.ENGINE_ALLOW_INSECURE_STUBS = 'true'
  })

  afterEach(() => {
    delete process.env.ENGINE_ALLOW_INSECURE_STUBS
  })

  it('accepts fresh nullifier', async () => {
    await expect(
      checkNullifier('0xdeadbeef', storage),
    ).resolves.toBeUndefined()
    expect(storage._store.has('nullifier:0xdeadbeef')).toBe(false)
  })

  it('rejects double-spent nullifier', async () => {
    await commitValidationMutation(
      {
        agentId: TEST_AGENT,
        actionType: ActionType.JOIN,
        nonce: 0,
        nullifierHash: '0xdeadbeef',
      },
      storage,
    )
    await expect(
      checkNullifier('0xdeadbeef', storage),
    ).rejects.toThrow('Nullifier already spent')
  })
})

describe('handleJoin', () => {
  let storage: ReturnType<typeof createMockStorage>

  beforeEach(() => {
    storage = createMockStorage()
    process.env.ENGINE_ALLOW_INSECURE_STUBS = 'true'
  })

  afterEach(() => {
    delete process.env.ENGINE_ALLOW_INSECURE_STUBS
  })

  it('valid join with nonce 0 succeeds', async () => {
    const action = makeAction({ type: ActionType.JOIN, nonce: 0 })
    const result = await handleJoin(action, storage, TEST_AUCTION_ID)

    expect(result.action.type).toBe(ActionType.JOIN)
    expect(result.action.agentId).toBe(TEST_AGENT)
    expect(result.action.wallet).toBe(TEST_WALLET)
    expect(result.mutation.nullifierHash).toMatch(/^0x[0-9a-f]+$/)
    expect(storage._store.size).toBe(0)
  })

  it('join with wrong nonce (1 instead of 0) fails', async () => {
    const action = makeAction({ type: ActionType.JOIN, nonce: 1 })
    await expect(
      handleJoin(action, storage, TEST_AUCTION_ID),
    ).rejects.toThrow('expected 0')
    expect(storage._store.size).toBe(0)
  })

  it('double-join from same wallet fails (nullifier)', async () => {
    const action = makeAction({ type: ActionType.JOIN, nonce: 0 })
    const first = await handleJoin(action, storage, TEST_AUCTION_ID)
    await commitValidationMutation(first.mutation, storage)

    // Second join from same wallet — nullifier already spent
    const action2 = makeAction({ type: ActionType.JOIN, nonce: 1 })
    await expect(
      handleJoin(action2, storage, TEST_AUCTION_ID),
    ).rejects.toThrow('Nullifier already spent')
  })
})

describe('handleBid', () => {
  let storage: ReturnType<typeof createMockStorage>

  beforeEach(() => {
    storage = createMockStorage()
    process.env.ENGINE_ALLOW_INSECURE_STUBS = 'true'
  })

  afterEach(() => {
    delete process.env.ENGINE_ALLOW_INSECURE_STUBS
  })

  it('valid bid with amount > highestBid succeeds', async () => {
    const action = makeAction({
      type: ActionType.BID,
      nonce: 0,
      amount: '2000000',
    })
    const result = await handleBid(action, storage, TEST_AUCTION_ID, '1000000', '0')

    expect(result.action.type).toBe(ActionType.BID)
    expect(result.action.amount).toBe('2000000')
    expect(storage._store.size).toBe(0)
  })

  it('bid with amount <= highestBid fails', async () => {
    const action = makeAction({
      type: ActionType.BID,
      nonce: 0,
      amount: '500000',
    })
    await expect(
      handleBid(action, storage, TEST_AUCTION_ID, '1000000', '0'),
    ).rejects.toThrow('must exceed current highest bid')
  })

  it('bid with amount equal to highestBid fails', async () => {
    const action = makeAction({
      type: ActionType.BID,
      nonce: 0,
      amount: '1000000',
    })
    await expect(
      handleBid(action, storage, TEST_AUCTION_ID, '1000000', '0'),
    ).rejects.toThrow('must exceed current highest bid')
  })

  it('bid with amount 0 fails', async () => {
    const action = makeAction({
      type: ActionType.BID,
      nonce: 0,
      amount: '0',
    })
    await expect(
      handleBid(action, storage, TEST_AUCTION_ID, '0', '0'),
    ).rejects.toThrow('must be greater than 0')
  })

  it('bid with amount > maxBid fails when cap is set', async () => {
    const action = makeAction({
      type: ActionType.BID,
      nonce: 0,
      amount: '3000001',
    })
    await expect(
      handleBid(action, storage, TEST_AUCTION_ID, '1000000', '3000000'),
    ).rejects.toThrow('exceeds max bid cap')
  })
})

describe('handleDeliver', () => {
  let storage: ReturnType<typeof createMockStorage>

  beforeEach(() => {
    storage = createMockStorage()
    process.env.ENGINE_ALLOW_INSECURE_STUBS = 'true'
  })

  afterEach(() => {
    delete process.env.ENGINE_ALLOW_INSECURE_STUBS
  })

  it('valid deliver succeeds', async () => {
    const action = makeAction({
      type: ActionType.DELIVER,
      nonce: 0,
      amount: '0',
    })
    const result = await handleDeliver(action, storage, TEST_AUCTION_ID)

    expect(result.action.type).toBe(ActionType.DELIVER)
    expect(result.action.agentId).toBe(TEST_AGENT)
  })
})

describe('validateAction (dispatcher)', () => {
  let storage: ReturnType<typeof createMockStorage>

  beforeEach(() => {
    storage = createMockStorage()
    process.env.ENGINE_ALLOW_INSECURE_STUBS = 'true'
  })

  afterEach(() => {
    delete process.env.ENGINE_ALLOW_INSECURE_STUBS
  })

  it('routes JOIN to handleJoin', async () => {
    const action = makeAction({ type: ActionType.JOIN, nonce: 0 })
    const result = await validateAction(action, storage, TEST_AUCTION_ID, '0', '0')
    expect(result.action.type).toBe(ActionType.JOIN)
  })

  it('routes BID to handleBid', async () => {
    const action = makeAction({
      type: ActionType.BID,
      nonce: 0,
      amount: '1000000',
    })
    const result = await validateAction(action, storage, TEST_AUCTION_ID, '0', '0')
    expect(result.action.type).toBe(ActionType.BID)
    expect(result.action.amount).toBe('1000000')
  })

  it('routes DELIVER to handleDeliver', async () => {
    const action = makeAction({ type: ActionType.DELIVER, nonce: 0 })
    const result = await validateAction(action, storage, TEST_AUCTION_ID, '0', '0')
    expect(result.action.type).toBe(ActionType.DELIVER)
  })

  it('rejects unsupported action type', async () => {
    const action = makeAction({ type: 'INVALID' as ActionType, nonce: 0 })
    await expect(
      validateAction(action, storage, TEST_AUCTION_ID, '0', '0'),
    ).rejects.toThrow('Unsupported action type')
  })
})

describe('fail-closed validation', () => {
  let storage: ReturnType<typeof createMockStorage>

  beforeEach(() => {
    storage = createMockStorage()
    delete process.env.ENGINE_ALLOW_INSECURE_STUBS
  })

  it('rejects action signatures when insecure stubs are disabled', async () => {
    const action = makeAction({ type: ActionType.JOIN, nonce: 0 })
    await expect(handleJoin(action, storage, TEST_AUCTION_ID)).rejects.toThrow(
      'Invalid EIP-712 signature',
    )
  })
})
