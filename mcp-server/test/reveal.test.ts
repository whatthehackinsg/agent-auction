/**
 * Tests for reveal_bid tool.
 *
 * Covers: successful reveal, commitment mismatch, reveal window closed,
 * missing config, nonce incrementation.
 */

import { describe, it, expect } from 'vitest'
import {
  makeCapturingMcpServer,
  makeMockEngine,
  makeConfig,
  parseToolResponse,
  TEST_AUCTION_ID,
} from './helpers.js'
import { registerRevealTool } from '../src/tools/reveal.js'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('reveal_bid', () => {
  it('reveals sealed bid successfully', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      postImpl: async () => ({ seq: 3, eventHash: '0xreveal', prevHash: '0xprev' }),
    })
    const config = makeConfig()
    const nonceTracker = new Map<string, number>()

    registerRevealTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = await handler({
      auctionId: TEST_AUCTION_ID,
      bid: '100000000',
      salt: '12345678901234567890',
    })
    const body = parseToolResponse(result)

    expect(body.success).toBe(true)
    expect(body.action).toBe('REVEAL')
    expect(body.bid).toBe('100000000')
    expect(body.seq).toBe(3)
    expect(body.agentId).toBe('1')
    expect(body.wallet).toBeTruthy()
    expect(body.nonce).toBe(0)
  })

  it('returns REVEAL_MISMATCH on commitment mismatch', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      postImpl: async () => {
        throw new Error('Engine POST failed (400): commitment mismatch')
      },
    })
    const config = makeConfig()
    const nonceTracker = new Map<string, number>()

    registerRevealTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = await handler({
      auctionId: TEST_AUCTION_ID,
      bid: '100000000',
      salt: '99999999999999999999',
    })
    const body = parseToolResponse(result)

    expect(body.success).toBe(false)
    const error = body.error as { code: string; suggestion: string }
    expect(error.code).toBe('REVEAL_MISMATCH')
    expect(error.suggestion).toContain('revealSalt')
  })

  it('returns REVEAL_WINDOW_CLOSED when window not open', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      postImpl: async () => {
        throw new Error('Engine POST failed (400): reveal window is not open')
      },
    })
    const config = makeConfig()
    const nonceTracker = new Map<string, number>()

    registerRevealTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = await handler({
      auctionId: TEST_AUCTION_ID,
      bid: '100000000',
      salt: '12345678901234567890',
    })
    const body = parseToolResponse(result)

    expect(body.success).toBe(false)
    const error = body.error as { code: string; suggestion: string }
    expect(error.code).toBe('REVEAL_WINDOW_CLOSED')
    expect(error.suggestion).toContain('get_auction_details')
  })

  it('returns MISSING_CONFIG when no private key', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine()
    const config = makeConfig({ agentPrivateKey: null })
    const nonceTracker = new Map<string, number>()

    registerRevealTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = await handler({
      auctionId: TEST_AUCTION_ID,
      bid: '100000000',
      salt: '12345678901234567890',
    })
    const body = parseToolResponse(result)

    expect(body.success).toBe(false)
    const error = body.error as { code: string }
    expect(error.code).toBe('MISSING_CONFIG')
  })

  it('increments nonce after successful reveal', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      postImpl: async () => ({ seq: 1, eventHash: '0xabc', prevHash: '0x000' }),
    })
    const config = makeConfig()
    const nonceTracker = new Map<string, number>()

    registerRevealTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    // First reveal: nonce should be 0
    const result1 = await handler({
      auctionId: TEST_AUCTION_ID,
      bid: '100000000',
      salt: '12345678901234567890',
    })
    const body1 = parseToolResponse(result1)
    expect(body1.nonce).toBe(0)

    // Second reveal: nonce should be 1
    const result2 = await handler({
      auctionId: TEST_AUCTION_ID,
      bid: '200000000',
      salt: '98765432109876543210',
    })
    const body2 = parseToolResponse(result2)
    expect(body2.nonce).toBe(1)
  })
})
