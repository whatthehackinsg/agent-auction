/**
 * ZK proof generation for the agent-client.
 *
 * Mirrors mcp-server/src/lib/proof-generator.ts with additional features:
 * - usedNullifiers tracking per agent (prevents double-spend)
 * - persistNullifier() writes back to state file after successful engine call
 * - Structured error classes (ZkProofError, NullifierReusedError, BidOutOfRangeError)
 * - validateBidRange() pre-validates bids before wasting ~2s on fullProve
 * - getAgentStateFiles() helper for multi-agent demo
 * - fetchRegistryRoot() with 5-min TTL cache
 */

import fs from 'node:fs'
import path from 'node:path'
import { ethers } from 'ethers'
import {
  generateMembershipProof,
  generateBidRangeProof,
  buildPoseidonMerkleTree,
  getMerkleProof,
  generateSecret,
  type AgentPrivateState,
  type Groth16Proof,
} from '@agent-auction/crypto'
import { AGENT_STATE_DIR } from './config.js'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Deployed AgentPrivacyRegistry address on Base Sepolia */
const AGENT_PRIVACY_REGISTRY = '0x5b4f09A5D5188dCe1b1ba0caeDBcEb52CaCD1902'

/** Registry root TTL: 5 minutes */
const ROOT_CACHE_TTL_MS = 5 * 60 * 1000

// ── Module-level cache ────────────────────────────────────────────────────────

let registryRootCache: { root: bigint; fetchedAt: number; key: string } | null = null

// ── Error classes ─────────────────────────────────────────────────────────────

export class ZkProofError extends Error {
  readonly code: string
  readonly detail: string
  readonly suggestion: string

  constructor(code: string, detail: string, suggestion: string) {
    super(detail)
    this.name = 'ZkProofError'
    this.code = code
    this.detail = detail
    this.suggestion = suggestion
  }
}

export class NullifierReusedError extends ZkProofError {
  constructor(nullifier: string, auctionId: string) {
    super(
      'NULLIFIER_REUSED',
      `Nullifier ${nullifier} already spent for auction ${auctionId}`,
      'This agent has already joined this auction. Each agent can only join once per auction.',
    )
    this.name = 'NullifierReusedError'
  }
}

export class BidOutOfRangeError extends ZkProofError {
  constructor(bid: bigint, reservePrice: bigint, maxBudget: bigint) {
    const constraint =
      bid < reservePrice
        ? `bid ${bid} < reservePrice ${reservePrice}`
        : `bid ${bid} > maxBudget ${maxBudget}`
    super(
      'BID_OUT_OF_RANGE',
      `Bid violates range constraint: ${constraint}`,
      `Bid must satisfy reservePrice (${reservePrice}) <= bid <= maxBudget (${maxBudget})`,
    )
    this.name = 'BidOutOfRangeError'
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentStateWithNullifiers extends AgentPrivateState {
  usedNullifiers: string[]
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Deserialize a bigint field from JSON.
 *
 * The agent-N.json format uses trailing "n" convention for bigint fields:
 * e.g. "48522356...n" → strip "n" and pass to BigInt().
 */
function deserializeBigInt(value: string): bigint {
  const str = value.endsWith('n') ? value.slice(0, -1) : value
  return BigInt(str)
}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Load and deserialize agent private state from a JSON file.
 *
 * Handles the trailing "n" bigint serialization format used in
 * packages/crypto/test-agents/agent-N.json.
 *
 * Adds usedNullifiers tracking — defaults to [] if not present in file.
 */
export function loadAgentState(filePath: string): AgentStateWithNullifiers {
  const raw = fs.readFileSync(filePath, 'utf-8')
  const parsed = JSON.parse(raw)

  return {
    agentId: deserializeBigInt(parsed.agentId),
    agentSecret: deserializeBigInt(parsed.agentSecret),
    capabilities: (parsed.capabilities as Array<{ capabilityId: string }>).map((c) => ({
      capabilityId: deserializeBigInt(c.capabilityId),
    })),
    leafHashes: (parsed.leafHashes as string[]).map(deserializeBigInt),
    capabilityMerkleRoot: deserializeBigInt(parsed.capabilityMerkleRoot),
    // Default to empty array if not yet present in state file
    usedNullifiers: (parsed.usedNullifiers as string[] | undefined) ?? [],
  }
}

/**
 * Persist a used nullifier back to the agent state file.
 *
 * MUST be called only AFTER a successful engine response — never before.
 * This prevents marking a nullifier as spent if the engine rejects the join.
 */
export function persistNullifier(filePath: string, nullifier: string): void {
  const raw = fs.readFileSync(filePath, 'utf-8')
  const state = JSON.parse(raw)

  if (!Array.isArray(state.usedNullifiers)) {
    state.usedNullifiers = []
  }

  if (!state.usedNullifiers.includes(nullifier)) {
    state.usedNullifiers.push(nullifier)
  }

  fs.writeFileSync(filePath, JSON.stringify(state, null, 2))
}

/**
 * Return file paths for N agent state files.
 *
 * Resolves agent-1.json through agent-N.json from AGENT_STATE_DIR.
 */
export function getAgentStateFiles(count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    path.resolve(AGENT_STATE_DIR, `agent-${i + 1}.json`),
  )
}

/**
 * Read the per-agent Poseidon root from AgentPrivacyRegistry on Base Sepolia.
 *
 * Returns the root as a bigint. Caches per agentId for up to 5 minutes
 * to avoid repeated RPC calls during a session.
 */
export async function fetchRegistryRoot(rpcUrl: string, agentId?: bigint): Promise<bigint> {
  // Cache key includes agentId for per-agent caching
  const cacheKey = agentId ? `agent:${agentId}` : 'global'
  const now = Date.now()
  if (registryRootCache && registryRootCache.key === cacheKey && now - registryRootCache.fetchedAt < ROOT_CACHE_TTL_MS) {
    return registryRootCache.root
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const abi = ['function getAgentPoseidonRoot(uint256 agentId) external view returns (bytes32)']
  const registry = new ethers.Contract(AGENT_PRIVACY_REGISTRY, abi, provider)

  const rootHex = await registry.getAgentPoseidonRoot(agentId ?? 0n)
  const root = BigInt(rootHex)

  registryRootCache = { root, fetchedAt: now, key: cacheKey }
  return root
}

/**
 * Generate a RegistryMembership proof for an agent.
 *
 * Rebuilds the Poseidon Merkle tree from stored leaf hashes to produce
 * a fresh Merkle witness for the first capability (index 0).
 */
export async function generateMembershipProofForAgent(
  agentState: AgentPrivateState,
  auctionId: bigint,
  registryRoot: bigint,
): Promise<{ proof: Groth16Proof; publicSignals: string[] }> {
  // Rebuild the sparse Poseidon Merkle tree from stored leaf hashes
  const treeResult = await buildPoseidonMerkleTree(agentState.leafHashes)

  // Get the Merkle witness for leaf index 0 (first capability)
  // zeroHashes is present on the returned object (cast as any per established pattern)
  const merkleProof = getMerkleProof(0, treeResult.layers, (treeResult as any).zeroHashes)

  return generateMembershipProof({
    agentSecret: agentState.agentSecret,
    capabilityId: agentState.capabilities[0].capabilityId,
    leafIndex: 0n,
    pathElements: merkleProof.pathElements,
    pathIndices: merkleProof.pathIndices,
    auctionId,
    registryRoot,
  })
}

/**
 * Generate a BidRange proof.
 *
 * Proves that the hidden bid is within [reservePrice, maxBudget].
 * Uses a fresh random salt for each proof.
 *
 * When maxBudget is 0 (uncapped auction), substitutes 2^48 as sentinel
 * to satisfy the circuit constraint (reservePrice <= bid <= maxBudget).
 */
export async function generateBidRangeProofForAgent(
  bidAmount: bigint,
  reservePrice: bigint,
  maxBudget: bigint,
  salt?: bigint,
): Promise<{ proof: Groth16Proof; publicSignals: string[] }> {
  // Substitute sentinel for uncapped auctions (maxBid: "0" from engine)
  const effectiveMaxBudget = maxBudget === 0n ? BigInt(2 ** 48) : maxBudget

  // Use provided salt when the caller needs deterministic commitment binding.
  const bidSalt = salt ?? generateSecret()

  return generateBidRangeProof({
    bid: bidAmount,
    salt: bidSalt,
    reservePrice,
    maxBudget: effectiveMaxBudget,
  })
}

/**
 * Validate bid range before proof generation.
 *
 * Throws BidOutOfRangeError if the bid is outside [reservePrice, maxBudget].
 * Call this BEFORE generateBidRangeProofForAgent to avoid wasting ~2s on fullProve.
 */
export function validateBidRange(bid: bigint, reservePrice: bigint, maxBudget: bigint): void {
  if (bid < reservePrice) {
    throw new BidOutOfRangeError(bid, reservePrice, maxBudget)
  }

  const effective = maxBudget === 0n ? BigInt(2 ** 48) : maxBudget
  if (bid > effective) {
    throw new BidOutOfRangeError(bid, reservePrice, effective)
  }
}
