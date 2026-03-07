/**
 * Tests for get_bond_status and post_bond tools.
 *
 * Uses makeCapturingMcpServerMulti because registerBondTools registers TWO tools.
 * Covers: bond status check, fallback agentId, missing config, engine errors, bond posting.
 */

import { describe, it, expect, vi } from 'vitest'
import type { BaseSepoliaClients } from '../src/lib/onchain.js'
import {
  makeCapturingMcpServerMulti,
  makeMockEngine,
  makeConfig,
  makeFakeReceipt,
  makeFakeTxHash,
  makeOnchainClients,
  parseToolResponse,
  TEST_AUCTION_ID,
  TEST_WALLET,
} from './helpers.js'
import { registerBondTools } from '../src/tools/bond.js'

const agentKitConfig = {
  agentPrivateKey: null,
  cdp: {
    apiKeyId: 'cdp-key-id',
    apiKeySecret: 'cdp-key-secret',
    walletSecret: 'cdp-wallet-secret',
    walletAddress: TEST_WALLET,
    networkId: 'base-sepolia',
  },
  baseSepoliaRpc: 'https://base-sepolia.example',
} as const

function withSupportedBackend(clients: BaseSepoliaClients): BaseSepoliaClients {
  ;(clients as BaseSepoliaClients & Record<string, unknown>).wallet = TEST_WALLET
  ;(clients as BaseSepoliaClients & Record<string, unknown>).backend = {
    kind: 'agentkit',
    path: 'supported-agentkit-cdp',
    configured: true,
    supportLevel: 'supported',
    selectionSource: 'auto-default',
    wallet: TEST_WALLET,
    networkId: 'base-sepolia',
  }
  return clients
}

function makeBondFlowEngine(options?: {
  bondStatuses?: Array<'NONE' | 'PENDING' | 'CONFIRMED' | 'TIMEOUT'>
  depositAmount?: string
  postResult?: { status: string; txHash: string }
}) {
  const capturedGetPaths: string[] = []
  const capturedPosts: Array<{ path: string; body: unknown }> = []
  const statuses = [...(options?.bondStatuses ?? ['NONE', 'CONFIRMED'])]
  let lastStatus = statuses[statuses.length - 1] ?? 'NONE'

  const mockEngine = {
    get: async (path: string) => {
      capturedGetPaths.push(path)
      if (path === `/auctions/${TEST_AUCTION_ID}`) {
        return {
          auction: {
            deposit_amount: options?.depositAmount ?? '50000000',
          },
        }
      }
      if (path.includes('/bonds/')) {
        const status = statuses.shift() ?? lastStatus
        lastStatus = status
        return { status }
      }
      throw new Error(`Unexpected GET ${path}`)
    },
    post: async (path: string, body: unknown) => {
      capturedPosts.push({ path, body })
      if (path === `/auctions/${TEST_AUCTION_ID}/bonds`) {
        const txHash = (body as { txHash: string }).txHash
        return options?.postResult ?? { status: 'CONFIRMED', txHash }
      }
      throw new Error(`Unexpected POST ${path}`)
    },
  }

  return { mockEngine, capturedGetPaths, capturedPosts }
}

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
      agentId: '5',
      amount: '50000000',
      txHash: '0xtx123',
    })
    const body = parseToolResponse(result)

    expect(body.success).toBe(true)
    expect(body.auctionId).toBe(TEST_AUCTION_ID)
    expect(body.agentId).toBe('5')
    expect(body.amount).toBe('50000000')
    expect(body.bondStatus).toBe('CONFIRMED')

    // Verify engine POST payload
    expect(capturedPayloads).toHaveLength(1)
    const payload = capturedPayloads[0] as Record<string, unknown>
    expect(payload.agentId).toBe('5')
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

describe('deposit_bond', () => {
  it('uses the supported AgentKit backend for bond deposits and reports walletBackend', async () => {
    const txHash = makeFakeTxHash('90')
    const { clients } = makeOnchainClients({
      readContractImpl: async () => TEST_WALLET,
      writeContractImpl: async () => txHash,
      waitForReceiptImpl: async (hash) => makeFakeReceipt({ transactionHash: hash }),
    })
    const { mockEngine, capturedPosts } = makeBondFlowEngine()
    const { mockServer, getHandler } = makeCapturingMcpServerMulti()

    registerBondTools(
      mockServer,
      mockEngine as any,
      makeConfig({
        ...agentKitConfig,
        agentId: '5',
      }),
      {
        createClients: async () => withSupportedBackend(clients),
        smartWaitAttempts: 1,
        pollDelayMs: 0,
      } as any,
    )
    const handler = getHandler('deposit_bond')

    const result = await handler({
      auctionId: TEST_AUCTION_ID,
      agentId: '5',
    })
    const body = parseToolResponse(result)

    expect(body.success).toBe(true)
    expect(body.bondStatus).toBe('CONFIRMED')
    expect(body.depositor).toBe(TEST_WALLET)
    expect(body.walletBackend).toBe('supported-agentkit-cdp')
    expect(capturedPosts[0]?.body).toMatchObject({
      depositor: TEST_WALLET,
      txHash,
    })
  })

  it('keeps owner-wallet authorization on the supported backend', async () => {
    const { clients, writeCalls } = makeOnchainClients({
      readContractImpl: async () => '0x0000000000000000000000000000000000000005',
    })
    const { mockEngine } = makeBondFlowEngine({
      bondStatuses: ['NONE'],
    })
    const { mockServer, getHandler } = makeCapturingMcpServerMulti()

    registerBondTools(
      mockServer,
      mockEngine as any,
      makeConfig({
        ...agentKitConfig,
        agentId: '5',
      }),
      {
        createClients: async () => withSupportedBackend(clients),
        smartWaitAttempts: 1,
        pollDelayMs: 0,
      } as any,
    )
    const handler = getHandler('deposit_bond')

    const result = await handler({
      auctionId: TEST_AUCTION_ID,
      agentId: '5',
    })
    const body = parseToolResponse(result)

    expect(body.success).toBe(false)
    expect(body.error).toMatchObject({
      code: 'FUNDING_WALLET_MISMATCH',
    })
    expect(writeCalls).toHaveLength(0)
  })

  it('auto-loads depositAmount, transfers USDC to escrow, and records a confirmed bond', async () => {
    const txHash = makeFakeTxHash('44')
    const { clients, writeCalls } = makeOnchainClients({
      readContractImpl: async () => TEST_WALLET,
      writeContractImpl: async () => txHash,
      waitForReceiptImpl: async (hash) => makeFakeReceipt({ transactionHash: hash }),
    })
    const { mockEngine, capturedGetPaths, capturedPosts } = makeBondFlowEngine()
    const { mockServer, getHandler } = makeCapturingMcpServerMulti()

    registerBondTools(
      mockServer,
      mockEngine as any,
      makeConfig({
        agentId: '1',
        baseSepoliaRpc: 'https://base-sepolia.example',
      }),
      {
        createClients: () => clients,
        smartWaitAttempts: 1,
        pollDelayMs: 0,
      },
    )
    const handler = getHandler('deposit_bond')

    const result = await handler({
      auctionId: TEST_AUCTION_ID,
      agentId: '5',
    })
    const body = parseToolResponse(result)

    expect(body.success).toBe(true)
    expect(body.agentId).toBe('5')
    expect(body.amount).toBe('50000000')
    expect(body.bondStatus).toBe('CONFIRMED')
    expect(body.txHash).toBe(txHash)
    expect(body.nextAction).toBe('join_auction')

    expect(writeCalls).toHaveLength(1)
    const transferCall = writeCalls[0] as {
      functionName: string
      args: [string, bigint]
    }
    expect(transferCall.functionName).toBe('transfer')
    expect(transferCall.args[1]).toBe(50000000n)

    expect(capturedPosts).toHaveLength(1)
    expect(capturedPosts[0]?.path).toBe(`/auctions/${TEST_AUCTION_ID}/bonds`)
    expect(capturedPosts[0]?.body).toMatchObject({
      agentId: '5',
      depositor: TEST_WALLET,
      amount: '50000000',
      txHash,
    })
    expect(capturedGetPaths).toContain(`/auctions/${TEST_AUCTION_ID}`)
    expect(capturedGetPaths.some((path) => path.endsWith('/bonds/5'))).toBe(true)
  })

  it.each(['PENDING', 'CONFIRMED'] as const)(
    'returns existing %s bond state without sending another transfer',
    async (status) => {
      const { clients, writeCalls } = makeOnchainClients({
        readContractImpl: async () => TEST_WALLET,
      })
      const createClients = vi.fn(() => clients)
      const { mockEngine, capturedPosts } = makeBondFlowEngine({
        bondStatuses: [status],
      })
      const { mockServer, getHandler } = makeCapturingMcpServerMulti()

      registerBondTools(
        mockServer,
        mockEngine as any,
        makeConfig({
          baseSepoliaRpc: 'https://base-sepolia.example',
        }),
        {
          createClients,
          smartWaitAttempts: 1,
          pollDelayMs: 0,
        },
      )
      const handler = getHandler('deposit_bond')

      const result = await handler({
        auctionId: TEST_AUCTION_ID,
        agentId: '5',
      })
      const body = parseToolResponse(result)

      expect(body.success).toBe(true)
      expect(body.bondStatus).toBe(status)
      expect(body.idempotent).toBe(true)
      expect(writeCalls).toHaveLength(0)
      expect(capturedPosts).toHaveLength(0)
      expect(createClients).not.toHaveBeenCalled()
    },
  )

  it('returns PENDING with next-step guidance when observation is still in flight', async () => {
    const txHash = makeFakeTxHash('55')
    const { clients, writeCalls } = makeOnchainClients({
      readContractImpl: async () => TEST_WALLET,
      writeContractImpl: async () => txHash,
      waitForReceiptImpl: async (hash) => makeFakeReceipt({ transactionHash: hash }),
    })
    const { mockEngine, capturedPosts } = makeBondFlowEngine({
      bondStatuses: ['NONE', 'PENDING'],
      postResult: { status: 'PENDING', txHash },
    })
    const { mockServer, getHandler } = makeCapturingMcpServerMulti()

    registerBondTools(
      mockServer,
      mockEngine as any,
      makeConfig({
        baseSepoliaRpc: 'https://base-sepolia.example',
      }),
      {
        createClients: () => clients,
        smartWaitAttempts: 1,
        pollDelayMs: 0,
      },
    )
    const handler = getHandler('deposit_bond')

    const result = await handler({
      auctionId: TEST_AUCTION_ID,
      agentId: '5',
    })
    const body = parseToolResponse(result)

    expect(body.success).toBe(true)
    expect(body.bondStatus).toBe('PENDING')
    expect(body.txHash).toBe(txHash)
    expect(body.nextAction).toBe('get_bond_status')
    expect(writeCalls).toHaveLength(1)
    expect(capturedPosts).toHaveLength(1)
  })
})
