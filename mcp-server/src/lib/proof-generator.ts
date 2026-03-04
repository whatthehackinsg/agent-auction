/**
 * Server-side ZK proof generation for MCP tools.
 *
 * Loads agent private state from a JSON file (agent-N.json format),
 * rebuilds the Poseidon Merkle tree witness, and generates Groth16
 * proofs for RegistryMembership and BidRange circuits.
 *
 * Used by MCP tool handlers (join, bid) when AGENT_STATE_FILE is set.
 */

import fs from 'node:fs'
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

// ── Constants ─────────────────────────────────────────────────────────────────

/** Deployed AgentPrivacyRegistry address on Base Sepolia */
const AGENT_PRIVACY_REGISTRY = '0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff'

/** Registry root TTL: 5 minutes */
const ROOT_CACHE_TTL_MS = 5 * 60 * 1000

// ── Module-level cache ────────────────────────────────────────────────────────

let registryRootCache: { root: bigint; fetchedAt: number; key: string } | null = null

// ── Helpers ──────────────────────────────────────────────────────────────────

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
 */
export function loadAgentState(filePath: string): AgentPrivateState {
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
  }
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
): Promise<{ proof: Groth16Proof; publicSignals: string[] }> {
  // Substitute sentinel for uncapped auctions (maxBid: "0" from engine)
  const effectiveMaxBudget = maxBudget === 0n ? BigInt(2 ** 48) : maxBudget

  // Generate a fresh random salt for each bid proof
  const bidSalt = generateSecret()

  return generateBidRangeProof({
    bid: bidAmount,
    salt: bidSalt,
    reservePrice,
    maxBudget: effectiveMaxBudget,
  })
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
