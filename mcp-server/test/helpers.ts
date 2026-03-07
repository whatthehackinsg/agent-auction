/**
 * Shared test helpers for MCP tool tests.
 *
 * Extracted from bid.test.ts and join.test.ts to eliminate duplication.
 * All new tool test files should import from this module.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Hex, TransactionReceipt } from 'viem'
import type { EngineClient } from '../src/lib/engine.js'
import type { ServerConfig } from '../src/lib/config.js'
import type { BaseSepoliaClients } from '../src/lib/onchain.js'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Hardhat account #0 — standard test key, NOT a secret */
export const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const

export const TEST_AUCTION_ID = ('0x' + '00'.repeat(31) + '01') as `0x${string}`
export const TEST_AGENT_ID = '1'
export const TEST_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

// ── makeCapturingMcpServer ────────────────────────────────────────────────────

/**
 * Create a mock MCP server that captures the FIRST registered tool handler.
 * Use for tools that register a single handler (discover, details, events, etc.).
 */
export function makeCapturingMcpServer() {
  let capturedHandler: ((params: Record<string, unknown>) => Promise<unknown>) | null = null

  const mockServer = {
    registerTool: (
      _name: string,
      _definition: unknown,
      handler: (params: Record<string, unknown>) => Promise<unknown>,
    ) => {
      capturedHandler = handler
    },
  } as unknown as McpServer

  return {
    mockServer,
    getHandler: () => {
      if (!capturedHandler) throw new Error('registerTool was not called')
      return capturedHandler
    },
  }
}

/**
 * Create a mock MCP server that captures ALL registered tool handlers by name.
 * Use for registration functions that register multiple tools (e.g. registerBondTools).
 */
export function makeCapturingMcpServerMulti() {
  const capturedHandlers = new Map<
    string,
    (params: Record<string, unknown>) => Promise<unknown>
  >()

  const mockServer = {
    registerTool: (
      name: string,
      _definition: unknown,
      handler: (params: Record<string, unknown>) => Promise<unknown>,
    ) => {
      capturedHandlers.set(name, handler)
    },
  } as unknown as McpServer

  return {
    mockServer,
    getHandler: (name: string) => {
      const handler = capturedHandlers.get(name)
      if (!handler) throw new Error(`registerTool was not called for "${name}"`)
      return handler
    },
  }
}

// ── makeMockEngine ────────────────────────────────────────────────────────────

/**
 * Create a mock EngineClient that captures POST body payloads.
 * Accepts optional overrides for GET and POST implementations.
 */
export function makeMockEngine(overrides?: {
  getImpl?: (path: string) => Promise<unknown>
  postImpl?: (path: string, body: unknown) => Promise<unknown>
}) {
  const capturedPayloads: unknown[] = []
  const capturedGetPaths: string[] = []

  const mockEngine = {
    get: async (path: string) => {
      capturedGetPaths.push(path)
      if (overrides?.getImpl) {
        return overrides.getImpl(path)
      }
      return {}
    },
    post: async (path: string, body: unknown) => {
      if (path === '/verify-identity') {
        return {
          verified: true,
          resolvedWallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          privacyRegistered: true,
          poseidonRoot: '0x1234',
        }
      }
      capturedPayloads.push(body)
      if (overrides?.postImpl) {
        return overrides.postImpl(path, body)
      }
      return { seq: 1, eventHash: '0xabc', prevHash: '0x000' }
    },
  } as unknown as EngineClient

  return { mockEngine, capturedPayloads, capturedGetPaths }
}

// ── makeConfig ────────────────────────────────────────────────────────────────

/**
 * Create a full ServerConfig with test defaults.
 * All optional fields default to null.
 */
export function makeConfig(overrides?: Partial<ServerConfig>): ServerConfig {
  return {
    engineUrl: 'http://localhost:8787',
    walletBackendMode: 'auto',
    agentPrivateKey: TEST_PRIVATE_KEY,
    cdp: {
      apiKeyId: null,
      apiKeySecret: null,
      walletSecret: null,
      walletAddress: null,
      networkId: 'base-sepolia',
    },
    agentId: TEST_AGENT_ID,
    port: 3100,
    engineAdminKey: null,
    bondFundingPrivateKey: null,
    agentStateFile: null,
    agentStateDir: null,
    baseSepoliaRpc: null,
    ...overrides,
  }
}

// ── On-chain helpers ──────────────────────────────────────────────────────────

export function makeFakeTxHash(fill: string = 'ab'): Hex {
  return (`0x${fill.repeat(32).slice(0, 64)}`) as Hex
}

export function makeFakeReceipt(
  overrides?: Partial<TransactionReceipt>,
): TransactionReceipt {
  return {
    blockHash: makeFakeTxHash('01'),
    blockNumber: 1n,
    contractAddress: null,
    cumulativeGasUsed: 21_000n,
    effectiveGasPrice: 1n,
    from: TEST_WALLET,
    gasUsed: 21_000n,
    logs: [],
    logsBloom: (`0x${'00'.repeat(256)}`) as Hex,
    root: undefined,
    status: 'success',
    to: TEST_WALLET,
    transactionHash: makeFakeTxHash('02'),
    transactionIndex: 0,
    type: 'eip1559',
    ...overrides,
  } as TransactionReceipt
}

export function makeOnchainClients(overrides?: {
  readContractImpl?: (args: unknown) => Promise<unknown>
  waitForReceiptImpl?: (hash: Hex) => Promise<TransactionReceipt>
  writeContractImpl?: (args: unknown) => Promise<Hex>
}) {
  const readCalls: unknown[] = []
  const waitCalls: Hex[] = []
  const writeCalls: unknown[] = []

  const publicClient = {
    readContract: async (args: unknown) => {
      readCalls.push(args)
      if (overrides?.readContractImpl) {
        return overrides.readContractImpl(args)
      }
      throw new Error('No mock readContract implementation provided')
    },
    waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => {
      waitCalls.push(hash)
      if (overrides?.waitForReceiptImpl) {
        return overrides.waitForReceiptImpl(hash)
      }
      return makeFakeReceipt({ transactionHash: hash })
    },
  }

  const walletClient = {
    writeContract: async (args: unknown) => {
      writeCalls.push(args)
      if (overrides?.writeContractImpl) {
        return overrides.writeContractImpl(args)
      }
      return makeFakeTxHash(String(writeCalls.length).padStart(2, '0'))
    },
  }

  return {
    clients: {
      account: { address: TEST_WALLET },
      publicClient,
      walletClient,
    } as unknown as BaseSepoliaClients,
    readCalls,
    waitCalls,
    writeCalls,
  }
}

export function makeReadinessResponse(overrides?: Partial<{
  verified: boolean
  resolvedWallet: string
  privacyRegistered: boolean
  poseidonRoot: string | null
}>): {
  verified: boolean
  resolvedWallet: string
  privacyRegistered: boolean
  poseidonRoot: string | null
} {
  return {
    verified: true,
    resolvedWallet: TEST_WALLET,
    privacyRegistered: true,
    poseidonRoot: '0x1234',
    ...overrides,
  }
}

// ── Response parsing helpers ──────────────────────────────────────────────────

/**
 * Extract and parse the JSON body from an MCP tool response.
 */
export function parseToolResponse(result: unknown): Record<string, unknown> {
  const r = result as { content: Array<{ text: string }> }
  return JSON.parse(r.content[0].text)
}
