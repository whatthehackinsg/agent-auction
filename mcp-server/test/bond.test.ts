/**
 * Tests for get_bond_status and post_bond tools.
 *
 * Uses makeCapturingMcpServerMulti because registerBondTools registers TWO tools.
 * Covers: bond status check, fallback agentId, missing config, engine errors, bond posting.
 */

import { describe, it, expect } from 'vitest'
import {
  makeCapturingMcpServerMulti,
  makeMockEngine,
  makeConfig,
  parseToolResponse,
  TEST_AUCTION_ID,
} from './helpers.js'
import { registerBondTools } from '../src/tools/bond.js'

// ── Tests: get_bond_status ────────────────────────────────────────────────────

describe('get_bond_status', () => {
  it('returns bond status for agent', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServerMulti()
    const { mockEngine } = makeMockEngine({
      getImpl: async () => ({ status: 'CONFIRMED' }),
    })
    const config = makeConfig()

    registerBondTools(mockServer, mockEngine, config)
    const handler = getHandler('get_bond_status')

    const result = await handler({ auctionId: TEST_AUCTION_ID, agentId: '5' })
    const body = parseToolResponse(result)

    expect(body.auctionId).toBe(TEST_AUCTION_ID)
    expect(body.agentId).toBe('5')
    expect(body.bondStatus).toBe('CONFIRMED')
  })

  it('falls back to config agentId when not provided', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServerMulti()
    const { mockEngine, capturedGetPaths } = makeMockEngine({
      getImpl: async () => ({ status: 'PENDING' }),
    })
    const config = makeConfig({ agentId: '1' })

    registerBondTools(mockServer, mockEngine, config)
    const handler = getHandler('get_bond_status')

    const result = await handler({ auctionId: TEST_AUCTION_ID })
    const body = parseToolResponse(result)

    expect(body.agentId).toBe('1')
    expect(body.bondStatus).toBe('PENDING')
    // Verify path uses config agent ID
    expect(capturedGetPaths[0]).toContain('/bonds/1')
  })

  it('returns MISSING_CONFIG when no agentId available', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServerMulti()
    const { mockEngine } = makeMockEngine()
    const config = makeConfig({ agentId: null })

    registerBondTools(mockServer, mockEngine, config)
    const handler = getHandler('get_bond_status')

    const result = await handler({ auctionId: TEST_AUCTION_ID })
    const body = parseToolResponse(result)

    expect(body.success).toBe(false)
    const error = body.error as { code: string }
    expect(error.code).toBe('MISSING_CONFIG')
  })

  it('returns ENGINE_ERROR on engine failure', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServerMulti()
    const { mockEngine } = makeMockEngine({
      getImpl: async () => {
        throw new Error('Engine GET failed (500): Internal error')
      },
    })
    const config = makeConfig()

    registerBondTools(mockServer, mockEngine, config)
    const handler = getHandler('get_bond_status')

    const result = await handler({ auctionId: TEST_AUCTION_ID, agentId: '1' })
    const body = parseToolResponse(result)

    expect(body.success).toBe(false)
    const error = body.error as { code: string }
    expect(error.code).toBe('ENGINE_ERROR')
  })
})

// ── Tests: post_bond ──────────────────────────────────────────────────────────

describe('post_bond', () => {
  it('submits bond proof to engine', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServerMulti()
    const { mockEngine, capturedPayloads } = makeMockEngine({
      postImpl: async () => ({ status: 'CONFIRMED', txHash: '0xtx123' }),
    })
    const config = makeConfig()

    registerBondTools(mockServer, mockEngine, config)
    const handler = getHandler('post_bond')

    const result = await handler({
      auctionId: TEST_AUCTION_ID,
      amount: '50000000',
      txHash: '0xtx123',
    })
    const body = parseToolResponse(result)

    expect(body.success).toBe(true)
    expect(body.auctionId).toBe(TEST_AUCTION_ID)
    expect(body.agentId).toBe('1')
    expect(body.amount).toBe('50000000')
    expect(body.bondStatus).toBe('CONFIRMED')

    // Verify engine POST payload
    expect(capturedPayloads).toHaveLength(1)
    const payload = capturedPayloads[0] as Record<string, unknown>
    expect(payload.agentId).toBe('1')
    expect(payload.depositor).toBeTruthy()
    expect(payload.amount).toBe('50000000')
    expect(payload.txHash).toBe('0xtx123')
  })

  it('returns MISSING_CONFIG when no private key', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServerMulti()
    const { mockEngine } = makeMockEngine()
    const config = makeConfig({ agentPrivateKey: null })

    registerBondTools(mockServer, mockEngine, config)
    const handler = getHandler('post_bond')

    const result = await handler({
      auctionId: TEST_AUCTION_ID,
      amount: '50000000',
      txHash: '0xtx456',
    })
    const body = parseToolResponse(result)

    expect(body.success).toBe(false)
    const error = body.error as { code: string }
    expect(error.code).toBe('MISSING_CONFIG')
  })
})
