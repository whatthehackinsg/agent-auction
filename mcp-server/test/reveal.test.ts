/**
 * Tests for reveal_bid tool.
 *
 * Covers: successful reveal, commitment mismatch, reveal window closed,
 * missing config, nonce incrementation.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  makeCapturingMcpServer,
  makeMockEngine,
  makeConfig,
  parseToolResponse,
  TEST_AUCTION_ID,
  TEST_WALLET,
} from './helpers.js'

vi.mock('../src/lib/wallet-backend.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/wallet-backend.js')>(
    '../src/lib/wallet-backend.js',
  )
  return {
    ...actual,
    getEvmWalletProvider: vi.fn(async (config: import('../src/lib/config.js').ServerConfig) => {
      if (config.walletBackendMode !== 'agentkit') {
        return actual.getEvmWalletProvider(config)
      }

      return {
        kind: 'agentkit' as const,
        path: 'supported-agentkit-cdp' as const,
        wallet: TEST_WALLET,
        signTypedData: async () => `0x${'3'.repeat(130)}`,
        writeContract: vi.fn(),
      }
    }),
  }
})

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

  it('uses the supported AgentKit/CDP backend when configured', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      postImpl: async () => ({ seq: 4, eventHash: '0xreveal', prevHash: '0xprev' }),
    })
    const config = makeConfig({
      agentPrivateKey: null,
      walletBackendMode: 'agentkit',
      cdp: {
        apiKeyId: 'cdp-key-id',
        apiKeySecret: 'cdp-key-secret',
        walletSecret: 'cdp-wallet-secret',
        walletAddress: TEST_WALLET,
        networkId: 'base-sepolia',
      },
      baseSepoliaRpc: 'https://sepolia.base.org',
    })
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
    expect(body.walletBackend).toBe('supported-agentkit-cdp')
    expect(body.wallet).toBe(TEST_WALLET)
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
