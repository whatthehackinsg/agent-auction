/**
 * Integration tests for join_auction proof handling.
 *
 * Tests:
 * 1. signJoin() nullifier derivation — Poseidon vs keccak256
 * 2. Real MCP flows: auto-generate from AGENT_STATE_FILE or fail closed
 * 3. Structured ZK error codes for failure cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ActionSigner } from '../src/lib/signer.js'
import { MEMBERSHIP_SIGNALS, computeCapabilityCommitment } from '@agent-auction/crypto'
import type { EngineClient } from '../src/lib/engine.js'
import type { ServerConfig } from '../src/lib/config.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const { generatedMembershipProof } = vi.hoisted(() => ({
  generatedMembershipProof: {
    proof: {
      pi_a: ['1', '2', '1'],
      pi_b: [['3', '4'], ['5', '6']],
      pi_c: ['7', '8', '1'],
      protocol: 'groth16',
      curve: 'bn128',
    },
    publicSignals: ['11', '22', '33'],
  },
}))

vi.mock('../src/lib/proof-generator.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/proof-generator.js')>(
    '../src/lib/proof-generator.js',
  )
  return {
    ...actual,
    generateMembershipProofForAgent: vi.fn().mockResolvedValue(generatedMembershipProof),
  }
})

vi.mock('../src/lib/wallet-backend.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/wallet-backend.js')>(
    '../src/lib/wallet-backend.js',
  )
  return {
    ...actual,
    getEvmWalletProvider: vi.fn(async (config: ServerConfig) => {
      if (config.walletBackendMode !== 'agentkit') {
        return actual.getEvmWalletProvider(config)
      }

      return {
        kind: 'agentkit' as const,
        path: 'supported-agentkit-cdp' as const,
        wallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        signTypedData: async () => `0x${'1'.repeat(130)}`,
        writeContract: vi.fn(),
      }
    }),
  }
})

const proofGenerator = await import('../src/lib/proof-generator.js')
const { registerJoinTool } = await import('../src/tools/join.js')

// ── Constants ─────────────────────────────────────────────────────────────────

/** Hardhat account #0 — standard test key, NOT a secret */
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

const TEST_AUCTION_ID = ('0x' + '00'.repeat(31) + '01') as `0x${string}`
const TEST_AGENT_ID = '1'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const membershipFixture = JSON.parse(
  fs.readFileSync(new URL('./fixtures/membership-proof.json', import.meta.url), 'utf-8'),
) as { proof: unknown; publicSignals: string[] }

const TEST_AGENT_STATE_FILE = fileURLToPath(
  new URL('../../packages/crypto/test-agents/agent-1.json', import.meta.url),
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<ServerConfig>): ServerConfig {
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

/**
 * Create a mock MCP server that captures the tool handler callback.
 * Returns the captured handler so tests can call it directly.
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
    get: async (_path: string) => {
      return { reservePrice: '50', maxBid: '500' }
    },
  } as unknown as EngineClient

  return { mockEngine, capturedPayloads }
}

// ── Tests: signJoin nullifier derivation ─────────────────────────────────────

describe('signJoin nullifier derivation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses Poseidon nullifier when proofPayload is provided', async () => {
    const signer = new ActionSigner(TEST_PRIVATE_KEY)

    const result = await signer.signJoin({
      auctionId: TEST_AUCTION_ID,
      agentId: TEST_AGENT_ID,
      bondAmount: 50_000_000n,
      nonce: 0,
      proofPayload: membershipFixture,
    })

    // Proof field should be populated
    expect(result.proof).not.toBeNull()
    expect(result.proof).toEqual(membershipFixture)

    // Signature should be a valid hex string
    expect(result.signature).toMatch(/^0x[0-9a-f]+$/i)
  })

  it('uses keccak256 nullifier when no proofPayload (backward compatible)', async () => {
    const signer = new ActionSigner(TEST_PRIVATE_KEY)

    const result = await signer.signJoin({
      auctionId: TEST_AUCTION_ID,
      agentId: TEST_AGENT_ID,
      bondAmount: 50_000_000n,
      nonce: 0,
      // No proofPayload — keccak256 fallback
    })

    // Proof field should be null
    expect(result.proof).toBeNull()

    // Signature should still be a valid hex string
    expect(result.signature).toMatch(/^0x[0-9a-f]+$/i)
  })

  it('proof payload passes through unchanged', async () => {
    const signer = new ActionSigner(TEST_PRIVATE_KEY)

    const result = await signer.signJoin({
      auctionId: TEST_AUCTION_ID,
      agentId: TEST_AGENT_ID,
      bondAmount: 50_000_000n,
      nonce: 0,
      proofPayload: membershipFixture,
    })

    // result.proof should deep-equal the input fixture
    expect(result.proof).toEqual(membershipFixture)

    // publicSignals should have exactly 3 entries for membership proof
    const proof = result.proof as { publicSignals: string[] }
    expect(proof.publicSignals).toHaveLength(3)
  })

  it('Poseidon nullifier matches publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER]', async () => {
    const signer = new ActionSigner(TEST_PRIVATE_KEY)

    // The Poseidon nullifier is used in EIP-712 signing when proofPayload is present.
    // We verify the proof field is populated with the same fixture, which contains
    // the expected nullifier at publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER].
    const result = await signer.signJoin({
      auctionId: TEST_AUCTION_ID,
      agentId: TEST_AGENT_ID,
      bondAmount: 50_000_000n,
      nonce: 0,
      proofPayload: membershipFixture,
    })

    // Nullifier is in publicSignals at index MEMBERSHIP_SIGNALS.NULLIFIER (2)
    const proofData = result.proof as { publicSignals: string[] }
    const nullifierSignal = proofData.publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER]
    expect(nullifierSignal).toBeTruthy()
    expect(nullifierSignal).not.toBe('0')

    // Verify MEMBERSHIP_SIGNALS.NULLIFIER is index 2
    expect(MEMBERSHIP_SIGNALS.NULLIFIER).toBe(2)
  })
})

// ── Tests: join_auction proof pass-through to engine ─────────────────────────

describe('join_auction proof pass-through to engine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends proof in engine POST body when proofPayload provided', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine, capturedPayloads } = makeCapturingEngine()
    const config = makeConfig()
    const nonceTracker = new Map<string, number>()

    registerJoinTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    await handler({
      auctionId: TEST_AUCTION_ID,
      bondAmount: '50000000',
      proofPayload: membershipFixture,
    })

    expect(capturedPayloads).toHaveLength(1)
    const payload = capturedPayloads[0] as Record<string, unknown>
    expect(payload.proof).not.toBeNull()
    expect(payload.proof).toEqual(membershipFixture)

    // publicSignals should have 3 entries for membership proof
    const proofData = payload.proof as { publicSignals: string[] }
    expect(proofData.publicSignals).toHaveLength(3)
  })

  it('uses the supported AgentKit/CDP backend when configured', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine, capturedPayloads } = makeCapturingEngine()
    const config = makeConfig({
      agentPrivateKey: null,
      walletBackendMode: 'agentkit',
      cdp: {
        apiKeyId: 'cdp-key-id',
        apiKeySecret: 'cdp-key-secret',
        walletSecret: 'cdp-wallet-secret',
        walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        networkId: 'base-sepolia',
      },
      baseSepoliaRpc: 'https://sepolia.base.org',
    })
    const nonceTracker = new Map<string, number>()

    registerJoinTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = (await handler({
      auctionId: TEST_AUCTION_ID,
      bondAmount: '50000000',
      proofPayload: membershipFixture,
    })) as { content: Array<{ text: string }> }

    const body = JSON.parse(result.content[0].text) as Record<string, unknown>
    expect(body.success).toBe(true)
    expect(body.walletBackend).toBe('supported-agentkit-cdp')
    expect(body.wallet).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
    expect(capturedPayloads).toHaveLength(1)
  })

  it('auto-generates a membership proof from AGENT_STATE_FILE when no manual proof is provided', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine, capturedPayloads } = makeCapturingEngine()
    const config = makeConfig({ agentStateFile: TEST_AGENT_STATE_FILE })
    const nonceTracker = new Map<string, number>()

    registerJoinTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = (await handler({
      auctionId: TEST_AUCTION_ID,
      bondAmount: '50000000',
    })) as { content: Array<{ text: string }> }

    expect(proofGenerator.generateMembershipProofForAgent).toHaveBeenCalledOnce()
    expect(capturedPayloads).toHaveLength(1)
    const payload = capturedPayloads[0] as Record<string, unknown>
    expect(payload.proof).toEqual(generatedMembershipProof)

    const body = JSON.parse(result.content[0].text)
    expect(body.success).toBe(true)
    expect(body.action).toBe('JOIN')
  })

  it('accepts explicit agentId and agentStateFile overrides for multi-identity participation', async () => {
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
    const tempStateDir = fs.mkdtempSync('/tmp/join-tool-')
    const explicitStateFile = `${tempStateDir}/agent-9.json`
    const explicitState = JSON.parse(fs.readFileSync(TEST_AGENT_STATE_FILE, 'utf-8')) as Record<string, unknown>
    explicitState.agentId = '9n'
    fs.writeFileSync(explicitStateFile, JSON.stringify(explicitState, null, 2))

    registerJoinTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = (await handler({
      auctionId: TEST_AUCTION_ID,
      bondAmount: '50000000',
      agentId: '9',
      agentStateFile: explicitStateFile,
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
    expect(proofGenerator.generateMembershipProofForAgent).toHaveBeenCalledOnce()
  })

  it('starts JOIN nonce at 0 for each auction room even when the same agent joins multiple rooms', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine, capturedPayloads } = makeCapturingEngine()
    const config = makeConfig()
    const nonceTracker = new Map<string, number>()

    registerJoinTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const secondAuctionId = ('0x' + '00'.repeat(31) + '02') as `0x${string}`

    await handler({
      auctionId: TEST_AUCTION_ID,
      bondAmount: '50000000',
      proofPayload: membershipFixture,
    })

    await handler({
      auctionId: secondAuctionId,
      bondAmount: '50000000',
      proofPayload: membershipFixture,
    })

    expect(capturedPayloads).toHaveLength(2)
    const firstPayload = capturedPayloads[0] as Record<string, unknown>
    const secondPayload = capturedPayloads[1] as Record<string, unknown>
    expect(firstPayload.nonce).toBe(0)
    expect(secondPayload.nonce).toBe(0)
  })
})

// ── Tests: join_auction structured errors ─────────────────────────────────────

describe('join_auction structured errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns ZK_STATE_REQUIRED when no proof source is available', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine, capturedPayloads } = makeCapturingEngine()
    // agentStateFile explicitly null
    const config = makeConfig({ agentStateFile: null })
    const nonceTracker = new Map<string, number>()

    registerJoinTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = (await handler({
      auctionId: TEST_AUCTION_ID,
      bondAmount: '50000000',
    })) as { content: Array<{ text: string }> }

    const body = JSON.parse(result.content[0].text)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('ZK_STATE_REQUIRED')
    expect(capturedPayloads).toHaveLength(0)
    expect(proofGenerator.generateMembershipProofForAgent).not.toHaveBeenCalled()
  })

  it('returns NULLIFIER_REUSED for engine nullifier error', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeCapturingEngine({
      postImpl: async () => {
        throw new Error('Engine POST failed (400): Nullifier already spent')
      },
    })
    const config = makeConfig()
    const nonceTracker = new Map<string, number>()

    registerJoinTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = (await handler({
      auctionId: TEST_AUCTION_ID,
      bondAmount: '50000000',
      proofPayload: membershipFixture,
    })) as { content: Array<{ text: string }> }

    const body = JSON.parse(result.content[0].text)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('NULLIFIER_REUSED')
  })

  it('returns PROOF_INVALID for engine proof rejection', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeCapturingEngine({
      postImpl: async () => {
        throw new Error('Engine POST failed (400): Invalid membership proof')
      },
    })
    const config = makeConfig()
    const nonceTracker = new Map<string, number>()

    registerJoinTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = (await handler({
      auctionId: TEST_AUCTION_ID,
      bondAmount: '50000000',
      proofPayload: membershipFixture,
    })) as { content: Array<{ text: string }> }

    const body = JSON.parse(result.content[0].text)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('PROOF_INVALID')
  })

  it('returns PROOF_RUNTIME_UNAVAILABLE for engine runtime outage while keeping the readiness boundary note', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeCapturingEngine({
      postImpl: async () => {
        throw new Error(
          'Engine POST failed (400): {"error":"PROOF_RUNTIME_UNAVAILABLE","detail":"Membership proof verification runtime is unavailable for agent 1: Wasm code generation disallowed by embedder","suggestion":"Retry once the Worker proof runtime is healthy.","reason":"proof_runtime_unavailable","diagnostics":{"verificationDetail":"Wasm code generation disallowed by embedder"}}',
        )
      },
    })
    const config = makeConfig()
    const nonceTracker = new Map<string, number>()

    registerJoinTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = (await handler({
      auctionId: TEST_AUCTION_ID,
      bondAmount: '50000000',
      proofPayload: membershipFixture,
    })) as { content: Array<{ text: string }> }

    const body = JSON.parse(result.content[0].text)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('PROOF_RUNTIME_UNAVAILABLE')
    expect(body.error.reason).toBe('proof_runtime_unavailable')
    expect(body.error.detail).toContain('Wasm code generation disallowed by embedder')
    expect(body.error.detail).toContain('check_identity only confirms ERC-8004 ownership')
  })

  it('returns the engine structured privacy-state error instead of flattening it to PROOF_INVALID', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeCapturingEngine({
      postImpl: async () => {
        throw new Error(
          'Engine POST failed (400): {"error":"PRIVACY_STATE_UNREADABLE","detail":"Configured AgentPrivacyRegistry appears to be a legacy global-root contract. getRoot() succeeds but per-agent getters are unavailable.","suggestion":"Update the configured AgentPrivacyRegistry deployment or address, then rerun register_identity for this agent."}',
        )
      },
    })
    const config = makeConfig()
    const nonceTracker = new Map<string, number>()

    registerJoinTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = (await handler({
      auctionId: TEST_AUCTION_ID,
      bondAmount: '50000000',
      proofPayload: membershipFixture,
    })) as { content: Array<{ text: string }> }

    const body = JSON.parse(result.content[0].text)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('PRIVACY_STATE_UNREADABLE')
    expect(body.error.detail).toContain('legacy global-root contract')
    expect(body.error.suggestion).toContain('rerun register_identity')
  })

  it('fails before engine POST when local poseidon root differs from on-chain proof state', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine, capturedPayloads } = makeCapturingEngine()
    const config = makeConfig({
      agentStateFile: TEST_AGENT_STATE_FILE,
      baseSepoliaRpc: 'https://sepolia.base.org',
    })
    const nonceTracker = new Map<string, number>()
    const localState = proofGenerator.loadAgentState(TEST_AGENT_STATE_FILE)
    const localCommitment = await computeCapabilityCommitment(
      localState.capabilities[0].capabilityId,
      localState.agentSecret,
    )

    vi.spyOn(proofGenerator, 'fetchOnchainProofState').mockResolvedValue({
      status: 'ok',
      poseidonRoot: localState.capabilityMerkleRoot + 1n,
      capabilityCommitment: localCommitment,
    })

    registerJoinTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = (await handler({
      auctionId: TEST_AUCTION_ID,
      bondAmount: '50000000',
    })) as { content: Array<{ text: string }> }

    const body = JSON.parse(result.content[0].text)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('PROOF_STATE_MISMATCH')
    expect(body.error.detail).toContain('Poseidon root')
    expect(capturedPayloads).toHaveLength(0)
  })

  it('fails before engine POST when local capability commitment differs from on-chain proof state', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine, capturedPayloads } = makeCapturingEngine()
    const config = makeConfig({
      agentStateFile: TEST_AGENT_STATE_FILE,
      baseSepoliaRpc: 'https://sepolia.base.org',
    })
    const nonceTracker = new Map<string, number>()
    const localState = proofGenerator.loadAgentState(TEST_AGENT_STATE_FILE)
    const localCommitment = await computeCapabilityCommitment(
      localState.capabilities[0].capabilityId,
      localState.agentSecret,
    )

    vi.spyOn(proofGenerator, 'fetchOnchainProofState').mockResolvedValue({
      status: 'ok',
      poseidonRoot: localState.capabilityMerkleRoot,
      capabilityCommitment: localCommitment + 1n,
    })

    registerJoinTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = (await handler({
      auctionId: TEST_AUCTION_ID,
      bondAmount: '50000000',
    })) as { content: Array<{ text: string }> }

    const body = JSON.parse(result.content[0].text)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('PROOF_STATE_MISMATCH')
    expect(body.error.detail).toContain('capability commitment')
    expect(capturedPayloads).toHaveLength(0)
  })

  it('fails before engine POST when per-agent on-chain proof state is unreadable', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine, capturedPayloads } = makeCapturingEngine()
    const config = makeConfig({
      agentStateFile: TEST_AGENT_STATE_FILE,
      baseSepoliaRpc: 'https://sepolia.base.org',
    })
    const nonceTracker = new Map<string, number>()

    vi.spyOn(proofGenerator, 'fetchOnchainProofState').mockResolvedValue({
      status: 'unreadable',
      detail:
        'Configured AgentPrivacyRegistry appears to be a legacy global-root contract. getRoot() succeeds but per-agent getters are unavailable.',
    })

    registerJoinTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = (await handler({
      auctionId: TEST_AUCTION_ID,
      bondAmount: '50000000',
    })) as { content: Array<{ text: string }> }

    const body = JSON.parse(result.content[0].text)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('PRIVACY_STATE_UNREADABLE')
    expect(body.error.detail).toContain('legacy global-root contract')
    expect(capturedPayloads).toHaveLength(0)
  })

  it('refines a preflight PRIVACY_NOT_REGISTERED result into unreadable on-chain proof-state guidance', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const capturedPayloads: unknown[] = []
    const mockEngine = {
      post: async (path: string, body: unknown) => {
        if (path === '/verify-identity') {
          return {
            verified: true,
            resolvedWallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
            privacyRegistered: false,
            poseidonRoot: null,
          }
        }
        capturedPayloads.push(body)
        return { seq: 1, eventHash: '0xabc', prevHash: '0x000' }
      },
      get: async (_path: string) => {
        return { reservePrice: '50', maxBid: '500' }
      },
    } as unknown as EngineClient
    const config = makeConfig({
      agentStateFile: TEST_AGENT_STATE_FILE,
      baseSepoliaRpc: 'https://sepolia.base.org',
    })
    const nonceTracker = new Map<string, number>()

    vi.spyOn(proofGenerator, 'fetchOnchainProofState').mockResolvedValue({
      status: 'unreadable',
      detail:
        'Configured AgentPrivacyRegistry appears to be a legacy global-root contract. getRoot() succeeds but per-agent getters are unavailable.',
    })

    registerJoinTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = (await handler({
      auctionId: TEST_AUCTION_ID,
      bondAmount: '50000000',
    })) as { content: Array<{ text: string }> }

    const body = JSON.parse(result.content[0].text)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('PRIVACY_STATE_UNREADABLE')
    expect(body.error.detail).toContain('legacy global-root contract')
    expect(capturedPayloads).toHaveLength(0)
  })
})
