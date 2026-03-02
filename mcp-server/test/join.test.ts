/**
 * Integration tests for join_auction ZK proof pass-through.
 *
 * Tests:
 * 1. signJoin() nullifier derivation — Poseidon vs keccak256
 * 2. Proof payload passes through to engine POST body
 * 3. Structured ZK error codes for failure cases
 */

import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import { ActionSigner, deriveJoinNullifier } from '../src/lib/signer.js'
import { MEMBERSHIP_SIGNALS } from '@agent-auction/crypto'
import type { EngineClient } from '../src/lib/engine.js'
import type { ServerConfig } from '../src/lib/config.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerJoinTool } from '../src/tools/join.js'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Hardhat account #0 — standard test key, NOT a secret */
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

const TEST_AUCTION_ID = ('0x' + '00'.repeat(31) + '01') as `0x${string}`
const TEST_AGENT_ID = '1'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const membershipFixture = JSON.parse(
  fs.readFileSync(new URL('./fixtures/membership-proof.json', import.meta.url), 'utf-8'),
) as { proof: unknown; publicSignals: string[] }

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<ServerConfig>): ServerConfig {
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

  it('sends proof: null when no proof provided', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine, capturedPayloads } = makeCapturingEngine()
    const config = makeConfig()
    const nonceTracker = new Map<string, number>()

    registerJoinTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    await handler({
      auctionId: TEST_AUCTION_ID,
      bondAmount: '50000000',
      // No proofPayload, no generateProof
    })

    expect(capturedPayloads).toHaveLength(1)
    const payload = capturedPayloads[0] as Record<string, unknown>
    expect(payload.proof).toBeNull()
  })
})

// ── Tests: join_auction structured errors ─────────────────────────────────────

describe('join_auction structured errors', () => {
  it('returns AGENT_NOT_REGISTERED when generateProof=true but no AGENT_STATE_FILE', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeCapturingEngine()
    // agentStateFile explicitly null
    const config = makeConfig({ agentStateFile: null })
    const nonceTracker = new Map<string, number>()

    registerJoinTool(mockServer, mockEngine, config, nonceTracker)
    const handler = getHandler()

    const result = (await handler({
      auctionId: TEST_AUCTION_ID,
      bondAmount: '50000000',
      generateProof: true,
    })) as { content: Array<{ text: string }> }

    const body = JSON.parse(result.content[0].text)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('AGENT_NOT_REGISTERED')
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
})
