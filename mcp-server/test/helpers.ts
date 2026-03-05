/**
 * Shared test helpers for MCP tool tests.
 *
 * Extracted from bid.test.ts and join.test.ts to eliminate duplication.
 * All new tool test files should import from this module.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { EngineClient } from '../src/lib/engine.js'
import type { ServerConfig } from '../src/lib/config.js'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Hardhat account #0 — standard test key, NOT a secret */
export const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const

export const TEST_AUCTION_ID = ('0x' + '00'.repeat(31) + '01') as `0x${string}`
export const TEST_AGENT_ID = '1'

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
    agentPrivateKey: TEST_PRIVATE_KEY,
    agentId: TEST_AGENT_ID,
    port: 3100,
    engineAdminKey: null,
    agentStateFile: null,
    baseSepoliaRpc: null,
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
