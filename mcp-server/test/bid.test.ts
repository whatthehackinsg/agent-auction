/**
 * Integration tests for place_bid proof handling.
 *
 * Tests:
 * 1. Real MCP flows: auto-generate from AGENT_STATE_FILE or fail closed
 * 2. signBid() always returns proof: undefined (BID EIP-712 has no nullifier)
 * 3. Tool attaches proof after signing via object spread
 * 4. Structured ZK error codes for bid failure cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ActionSigner } from '../src/lib/signer.js'
import type { EngineClient } from '../src/lib/engine.js'
import type { ServerConfig } from '../src/lib/config.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const { generatedBidRangeProof } = vi.hoisted(() => ({
  generatedBidRangeProof: {
    proof: {
      pi_a: ['1', '2', '1'],
      pi_b: [['3', '4'], ['5', '6']],
      pi_c: ['7', '8', '1'],
      protocol: 'groth16',
      curve: 'bn128',
    },
    publicSignals: ['101', '202', '303', '404'],
  },
}))

vi.mock('../src/lib/proof-generator.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/proof-generator.js')>(
    '../src/lib/proof-generator.js',
  )
  return {
    ...actual,
    generateBidRangeProofForAgent: vi.fn().mockResolvedValue(generatedBidRangeProof),
  }
})

const proofGenerator = await import('../src/lib/proof-generator.js')
const { registerBidTool } = await import('../src/tools/bid.js')

// ── Constants ─────────────────────────────────────────────────────────────────

/** Hardhat account #0 — standard test key, NOT a secret */
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

const TEST_AUCTION_ID = ('0x' + '00'.repeat(31) + '01') as `0x${string}`
const TEST_AGENT_ID = '1'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const bidrangeFixture = JSON.parse(
  fs.readFileSync(new URL('./fixtures/bidrange-proof.json', import.meta.url), 'utf-8'),
) as { proof: unknown; publicSignals: string[] }

const TEST_AGENT_STATE_FILE = fileURLToPath(
  new URL('../../packages/crypto/test-agents/agent-1.json', import.meta.url),
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<ServerConfig>): ServerConfig {
  return {
    engineUrl: 'http://localhost:8787',
    agentPrivateKey: TEST_PRIVATE_KEY,
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

/**
 * Create a mock MCP server that captures the tool handler callback.
 */
function makeCapturingMcpServer() {
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
 * Create a mock EngineClient that captures POST body payloads.
 */
function makeCapturingEngine(overrides?: {
  postImpl?: (path: string, body: unknown) => Promise<unknown>
  getImpl?: (path: string) => Promise<unknown>
}) {
  const capturedPayloads: unknown[] = []

  const mockEngine = {
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
    get: async (path: string) => {
      if (overrides?.getImpl) {
        return overrides.getImpl(path)
      }
      return { reservePrice: '50', maxBid: '500' }
    },
  } as unknown as EngineClient

  return { mockEngine, capturedPayloads }
}

// ── Tests: place_bid proof pass-through ──────────────────────────────────────

describe('place_bid proof pass-through', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends bid range proof in engine POST body when proofPayload provided', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine, capturedPayloads } = makeCapturingEngine()
    const config = makeConfig()
    const nonceTracker = new Map<string, number>()

    registerBidTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    await handler({
      auctionId: TEST_AUCTION_ID,
      amount: '100000000',
      proofPayload: bidrangeFixture,
      salt: '500',
    })

    expect(capturedPayloads).toHaveLength(1)
    const payload = capturedPayloads[0] as Record<string, unknown>
    expect(payload.proof).not.toBeNull()
    expect(payload.proof).toEqual(bidrangeFixture)

    // publicSignals should have 4 entries for bid range proof
    const proofData = payload.proof as { publicSignals: string[] }
    expect(proofData.publicSignals).toHaveLength(4)
  })

  it('auto-generates a bid proof from AGENT_STATE_FILE when no manual proof is provided', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine, capturedPayloads } = makeCapturingEngine()
    const config = makeConfig({ agentStateFile: TEST_AGENT_STATE_FILE })
    const nonceTracker = new Map<string, number>()

    registerBidTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = (await handler({
      auctionId: TEST_AUCTION_ID,
      amount: '100000000',
    })) as { content: Array<{ text: string }> }

    expect(proofGenerator.generateBidRangeProofForAgent).toHaveBeenCalledWith(
      100000000n,
      50n,
      500n,
      0n,
    )
    expect(capturedPayloads).toHaveLength(1)
    const payload = capturedPayloads[0] as Record<string, unknown>
    expect(payload.proof).toEqual(generatedBidRangeProof)
    expect(payload.revealSalt).toBe('0')

    const body = JSON.parse(result.content[0].text)
    expect(body.success).toBe(true)
    expect(body.action).toBe('BID')
  })

  it('proof attached after signing (not part of BID EIP-712 signature)', async () => {
    const signer = new ActionSigner(TEST_PRIVATE_KEY)

    // signBid() itself does NOT include proof — BID EIP-712 has no nullifier field
    const bidPayload = await signer.signBid({
      auctionId: TEST_AUCTION_ID,
      agentId: TEST_AGENT_ID,
      amount: 100_000_000n,
      nonce: 0,
    })

    // signBid() return type has no proof field — only tool attaches it after
    expect((bidPayload as Record<string, unknown>).proof).toBeUndefined()

    // Tool attaches proof after signing via spread:
    // { ...payload, proof: resolvedProof ?? null }
    // Verify the tool does attach proof to engine payload
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine, capturedPayloads } = makeCapturingEngine()
    const config = makeConfig()
    const nonceTracker = new Map<string, number>()

    registerBidTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    await handler({
      auctionId: TEST_AUCTION_ID,
      amount: '100000000',
      proofPayload: bidrangeFixture,
      salt: '500',
    })

    const enginePayload = capturedPayloads[0] as Record<string, unknown>
    // Engine payload HAS proof (attached after signing)
    expect(enginePayload.proof).toEqual(bidrangeFixture)
    // Engine payload also has the BID EIP-712 fields
    expect(enginePayload.type).toBe('BID')
    expect(enginePayload.signature).toMatch(/^0x[0-9a-f]+$/i)
  })

  it('accepts explicit agentId and agentStateFile overrides for multi-identity bidding', async () => {
    const verifyBodies: unknown[] = []
    const capturedPayloads: unknown[] = []
    const mockEngine = {
      post: async (path: string, body: unknown) => {
        if (path === '/verify-identity') {
          verifyBodies.push(body)
          return {
            verified: true,
            resolvedWallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
            privacyRegistered: true,
            poseidonRoot: '0x1234',
          }
        }
        capturedPayloads.push(body)
        return { seq: 1, eventHash: '0xabc', prevHash: '0x000' }
      },
      get: async (_path: string) => {
        return { reservePrice: '50', maxBid: '500' }
      },
    } as unknown as EngineClient
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const config = makeConfig({ agentStateFile: null })
    const nonceTracker = new Map<string, number>()

    registerBidTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = (await handler({
      auctionId: TEST_AUCTION_ID,
      amount: '100000000',
      agentId: '9',
      agentStateFile: TEST_AGENT_STATE_FILE,
    })) as { content: Array<{ text: string }> }

    const body = JSON.parse(result.content[0].text)
    expect(body.success).toBe(true)
    expect(body.agentId).toBe('9')
    expect(verifyBodies).toEqual([
      {
        agentId: '9',
        wallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      },
    ])
    expect(capturedPayloads).toHaveLength(1)
    const payload = capturedPayloads[0] as Record<string, unknown>
    expect(payload.agentId).toBe('9')
    expect(proofGenerator.generateBidRangeProofForAgent).toHaveBeenCalledOnce()
  })
})

// ── Tests: place_bid structured errors ───────────────────────────────────────

describe('place_bid structured errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns PROOF_INVALID for engine bid range rejection', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeCapturingEngine({
      postImpl: async () => {
        throw new Error('Engine POST failed (400): Invalid bid range proof')
      },
    })
    const config = makeConfig()
    const nonceTracker = new Map<string, number>()

    registerBidTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = (await handler({
      auctionId: TEST_AUCTION_ID,
      amount: '100000000',
      proofPayload: bidrangeFixture,
      salt: '500',
    })) as { content: Array<{ text: string }> }

    const body = JSON.parse(result.content[0].text)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('PROOF_INVALID')
  })

  it('returns PROOF_RUNTIME_UNAVAILABLE for engine verifier runtime outages', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeCapturingEngine({
      postImpl: async () => {
        throw new Error(
          'Engine POST failed (400): {"error":"PROOF_RUNTIME_UNAVAILABLE","detail":"Bid range proof verification runtime is unavailable for agent 1: Wasm code generation disallowed by embedder","suggestion":"Retry once the Worker proof runtime is healthy.","reason":"proof_runtime_unavailable","diagnostics":{"verificationDetail":"Wasm code generation disallowed by embedder"}}',
        )
      },
    })
    const config = makeConfig()
    const nonceTracker = new Map<string, number>()

    registerBidTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = (await handler({
      auctionId: TEST_AUCTION_ID,
      amount: '100000000',
      proofPayload: bidrangeFixture,
      salt: '500',
    })) as { content: Array<{ text: string }> }

    const body = JSON.parse(result.content[0].text)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('PROOF_RUNTIME_UNAVAILABLE')
    expect(body.error.reason).toBe('proof_runtime_unavailable')
    expect(body.error.detail).toContain('Wasm code generation disallowed by embedder')
  })

  it('returns ZK_STATE_REQUIRED when no proof source is available', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine, capturedPayloads } = makeCapturingEngine()
    // agentStateFile explicitly null
    const config = makeConfig({ agentStateFile: null })
    const nonceTracker = new Map<string, number>()

    registerBidTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = (await handler({
      auctionId: TEST_AUCTION_ID,
      amount: '100000000',
    })) as { content: Array<{ text: string }> }

    const body = JSON.parse(result.content[0].text)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('ZK_STATE_REQUIRED')
    expect(capturedPayloads).toHaveLength(0)
    expect(proofGenerator.generateBidRangeProofForAgent).not.toHaveBeenCalled()
  })
})
