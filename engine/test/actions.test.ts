/**
 * Tests for action validation handlers.
 *
 * Verifies nonce tracking, nullifier checking, bid validation,
 * and the validateAction dispatcher.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
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
import * as identityLib from '../src/lib/identity'
import * as cryptoLib from '../src/lib/crypto'
import { generateTestBidRangeProof, generateTestMembershipProof, setupTestProofs } from '../src/test-helpers/proof-fixtures'
import { toHex } from 'viem'

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

beforeAll(async () => {
  await setupTestProofs()
}, 120000)

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
    vi.restoreAllMocks()
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

    // Second join from same wallet — blocked by canonical join marker (path-independent)
    const action2 = makeAction({ type: ActionType.JOIN, nonce: 1 })
    await expect(
      handleJoin(action2, storage, TEST_AUCTION_ID),
    ).rejects.toThrow('already joined')
  })

  it('rejects join when requireProofs=true and no proof provided', async () => {
    const action = makeAction({ type: ActionType.JOIN, nonce: 0 })
    await expect(
      handleJoin(action, storage, TEST_AUCTION_ID, { requireProofs: true }),
    ).rejects.toMatchObject({
      name: 'StructuredActionError',
      payload: expect.objectContaining({
        error: 'PROOF_REQUIRED',
      }),
    })
  })

  it('accepts join when requireProofs=true and valid membership proof provided', async () => {
    const proofPayload = await generateTestMembershipProof(BigInt(TEST_AGENT), 0)
    vi.spyOn(identityLib, 'getAgentPoseidonRoot').mockResolvedValue(
      toHex(BigInt(proofPayload.publicSignals[0]), { size: 32 }),
    )
    const action = makeAction({
      type: ActionType.JOIN,
      nonce: 0,
      proof: proofPayload,
    })

    const result = await handleJoin(action, storage, TEST_AUCTION_ID, { requireProofs: true })
    expect(result.action.type).toBe(ActionType.JOIN)
    expect(result.mutation.zkNullifier).toBeDefined()
    expect(result.mutation.zkNullifier).not.toBe('0x00')
  })

  it('returns zkNullifier=undefined when no proof provided', async () => {
    const action = makeAction({ type: ActionType.JOIN, nonce: 0 })
    const result = await handleJoin(action, storage, TEST_AUCTION_ID)
    // No proof → keccak fallback, no zkNullifier
    expect(result.mutation.zkNullifier).toBeUndefined()
    // But nullifierHash is still set (keccak fallback)
    expect(result.mutation.nullifierHash).toMatch(/^0x[0-9a-f]+$/)
  })
})

describe('handleJoin wallet verification', () => {
  let storage: ReturnType<typeof createMockStorage>

  beforeEach(() => {
    storage = createMockStorage()
    process.env.ENGINE_ALLOW_INSECURE_STUBS = 'true'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.ENGINE_ALLOW_INSECURE_STUBS
  })

  it('throws AGENT_NOT_REGISTERED when agent is missing on ERC-8004', async () => {
    vi.spyOn(identityLib, 'verifyAgentWallet').mockResolvedValue({
      verified: false,
      resolvedWallet: null,
      reason: 'not_registered',
    })

    const action = makeAction({ type: ActionType.JOIN, nonce: 0 })
    await expect(
      handleJoin(action, storage, TEST_AUCTION_ID, { verifyWallet: true }),
    ).rejects.toThrow('AGENT_NOT_REGISTERED')
  })

  it('throws WALLET_MISMATCH and includes resolved wallet', async () => {
    vi.spyOn(identityLib, 'verifyAgentWallet').mockResolvedValue({
      verified: false,
      resolvedWallet: '0x1111111111111111111111111111111111111111',
      reason: 'mismatch',
    })

    const action = makeAction({ type: ActionType.JOIN, nonce: 0 })
    await expect(
      handleJoin(action, storage, TEST_AUCTION_ID, { verifyWallet: true }),
    ).rejects.toThrow('WALLET_MISMATCH')
    await expect(
      handleJoin(action, storage, TEST_AUCTION_ID, { verifyWallet: true }),
    ).rejects.toThrow('0x1111111111111111111111111111111111111111')
  })

  it('throws IDENTITY_RPC_FAILURE when identity RPC fails', async () => {
    vi.spyOn(identityLib, 'verifyAgentWallet').mockRejectedValue(new Error('fetch failed'))

    const action = makeAction({ type: ActionType.JOIN, nonce: 0 })
    await expect(
      handleJoin(action, storage, TEST_AUCTION_ID, { verifyWallet: true }),
    ).rejects.toThrow('IDENTITY_RPC_FAILURE')
  })

  it('succeeds when verifyWallet returns verified=true', async () => {
    vi.spyOn(identityLib, 'verifyAgentWallet').mockResolvedValue({
      verified: true,
      resolvedWallet: TEST_WALLET,
      reason: 'verified',
    })

    const action = makeAction({ type: ActionType.JOIN, nonce: 0 })
    await expect(
      handleJoin(action, storage, TEST_AUCTION_ID, { verifyWallet: true }),
    ).resolves.toBeDefined()
  })

  it('does not read or write walletVerified:/poseidonRoot: cache keys', async () => {
    vi.spyOn(cryptoLib, 'verifyMembershipProof').mockResolvedValue({
      valid: true,
      registryRoot: '0x' + '11'.repeat(32),
      nullifier: '0x' + '22'.repeat(32),
    })
    vi.spyOn(identityLib, 'verifyAgentWallet').mockResolvedValue({
      verified: true,
      resolvedWallet: TEST_WALLET,
      reason: 'verified',
    })
    vi.spyOn(identityLib, 'getAgentPoseidonRoot').mockResolvedValue(null)

    const getSpy = vi.spyOn(storage, 'get')
    const putSpy = vi.spyOn(storage, 'put')
    const action = makeAction({ type: ActionType.JOIN, nonce: 0, proof: { mocked: true } })

    await expect(
      handleJoin(action, storage, TEST_AUCTION_ID, { verifyWallet: true, requireProofs: true }),
    ).resolves.toBeDefined()

    const watchedCalls = [
      ...getSpy.mock.calls.map(([key]) => String(key)),
      ...putSpy.mock.calls.map(([key]) => String(key)),
    ]
    expect(watchedCalls.some((key) => key.startsWith('walletVerified:'))).toBe(false)
    expect(watchedCalls.some((key) => key.startsWith('poseidonRoot:'))).toBe(false)
  })
})

describe('verifyWallet defaults', () => {
  it('defaults to true when ENGINE_VERIFY_WALLET is unset', () => {
    // Inline test of the !== 'false' pattern used in auction-room.ts
    const resolve = (val?: string) => val !== 'false'
    expect(resolve(undefined)).toBe(true)
    expect(resolve('true')).toBe(true)
    expect(resolve('false')).toBe(false)
  })
})

describe('handleBid', () => {
  let storage: ReturnType<typeof createMockStorage>

  beforeEach(() => {
    storage = createMockStorage()
    process.env.ENGINE_ALLOW_INSECURE_STUBS = 'true'
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  it('bid with no proof succeeds (backward compat)', async () => {
    const action = makeAction({
      type: ActionType.BID,
      nonce: 0,
      amount: '2000000',
    })
    // No proof field — should pass without error
    delete (action as Record<string, unknown>).proof
    const result = await handleBid(action, storage, TEST_AUCTION_ID, '1000000', '0')
    expect(result.action.type).toBe(ActionType.BID)
    expect(result.action.amount).toBe('2000000')
  })

  it('rejects bid when requireProofs=true and no proof provided', async () => {
    const action = makeAction({
      type: ActionType.BID,
      nonce: 0,
      amount: '2000000',
    })
    await expect(
      handleBid(action, storage, TEST_AUCTION_ID, '1000000', '0', { requireProofs: true }),
    ).rejects.toMatchObject({
      name: 'StructuredActionError',
      payload: expect.objectContaining({
        error: 'PROOF_REQUIRED',
      }),
    })
  })

  it('accepts bid when requireProofs=true and valid bid range proof provided', async () => {
    const proofPayload = await generateTestBidRangeProof(BigInt(TEST_AGENT), 2_000_000n, 1_000_000n, 3_000_000n)
    const action = makeAction({
      type: ActionType.BID,
      nonce: 0,
      amount: '2000000',
      proof: proofPayload,
    })
    const result = await handleBid(action, storage, TEST_AUCTION_ID, '1000000', '0', {
      requireProofs: true,
    })
    expect(result.action.type).toBe(ActionType.BID)
    expect(result.action.proof).toBeDefined()
  })

  it('rejects bid with malformed proof', async () => {
    const action = makeAction({
      type: ActionType.BID,
      nonce: 0,
      amount: '2000000',
      proof: { garbage: true },
    })
    await expect(
      handleBid(action, storage, TEST_AUCTION_ID, '1000000', '0'),
    ).rejects.toThrow('Invalid bid range proof')
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
