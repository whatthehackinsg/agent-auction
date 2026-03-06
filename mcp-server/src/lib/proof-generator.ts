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
  computeCapabilityCommitment,
  getMerkleProof,
  generateSecret,
  type AgentPrivateState,
  type Groth16Proof,
} from '@agent-auction/crypto'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Deployed AgentPrivacyRegistry address on Base Sepolia */
const AGENT_PRIVACY_REGISTRY = '0x5b4f09A5D5188dCe1b1ba0caeDBcEb52CaCD1902'

/** Proof-state TTL: 5 minutes */
const ROOT_CACHE_TTL_MS = 5 * 60 * 1000

// ── Module-level cache ────────────────────────────────────────────────────────

export type OnchainProofState =
  | {
      status: 'ok'
      poseidonRoot: bigint
      capabilityCommitment: bigint
    }
  | {
      status: 'missing'
      poseidonRoot: bigint | null
      capabilityCommitment: bigint | null
      missing: Array<'poseidon_root' | 'capability_commitment'>
    }
  | {
      status: 'unreadable'
      detail: string
    }

let proofStateCache: { state: OnchainProofState; fetchedAt: number; key: string } | null = null

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

export async function computeLocalProofState(agentState: AgentPrivateState): Promise<{
  poseidonRoot: bigint
  capabilityCommitment: bigint
}> {
  const primaryCapability = agentState.capabilities[0]
  if (!primaryCapability) {
    throw new Error('Agent state does not contain any capabilities for proof generation')
  }

  return {
    poseidonRoot: agentState.capabilityMerkleRoot,
    capabilityCommitment: await computeCapabilityCommitment(
      primaryCapability.capabilityId,
      agentState.agentSecret,
    ),
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
  salt?: bigint,
): Promise<{ proof: Groth16Proof; publicSignals: string[] }> {
  // Substitute sentinel for uncapped auctions (maxBid: "0" from engine)
  const effectiveMaxBudget = maxBudget === 0n ? BigInt(2 ** 48) : maxBudget

  // Use provided salt (for sealed-bid commit-reveal) or generate a fresh one
  const bidSalt = salt ?? generateSecret()

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
  const state = await fetchOnchainProofState(rpcUrl, agentId ?? 0n)
  if (state.status === 'ok') {
    return state.poseidonRoot
  }
  if (state.status === 'missing') {
    return 0n
  }
  throw new Error(state.detail)
}

export async function fetchOnchainProofState(
  rpcUrl: string,
  agentId: bigint,
): Promise<OnchainProofState> {
  const cacheKey = `agent:${agentId}`
  const now = Date.now()
  if (
    proofStateCache
    && proofStateCache.key === cacheKey
    && now - proofStateCache.fetchedAt < ROOT_CACHE_TTL_MS
  ) {
    return proofStateCache.state
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const abi = [
    'function getAgentPoseidonRoot(uint256 agentId) external view returns (bytes32)',
    'function getAgentCapabilityCommitment(uint256 agentId) external view returns (bytes32)',
  ]
  const registry = new ethers.Contract(AGENT_PRIVACY_REGISTRY, abi, provider)

  try {
    const [rootHex, commitmentHex] = await Promise.all([
      registry.getAgentPoseidonRoot(agentId),
      registry.getAgentCapabilityCommitment(agentId),
    ])

    const poseidonRoot = BigInt(rootHex)
    const capabilityCommitment = BigInt(commitmentHex)
    const missing: Array<'poseidon_root' | 'capability_commitment'> = []

    if (poseidonRoot === 0n) {
      missing.push('poseidon_root')
    }
    if (capabilityCommitment === 0n) {
      missing.push('capability_commitment')
    }

    const state: OnchainProofState =
      missing.length > 0
        ? {
            status: 'missing',
            poseidonRoot: poseidonRoot === 0n ? null : poseidonRoot,
            capabilityCommitment: capabilityCommitment === 0n ? null : capabilityCommitment,
            missing,
          }
        : {
            status: 'ok',
            poseidonRoot,
            capabilityCommitment,
          }

    proofStateCache = { state, fetchedAt: now, key: cacheKey }
    return state
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    const legacyRegistry = new ethers.Contract(
      AGENT_PRIVACY_REGISTRY,
      ['function getRoot() external view returns (bytes32)'],
      provider,
    )

    try {
      await legacyRegistry.getRoot()
      return {
        status: 'unreadable',
        detail:
          'Configured AgentPrivacyRegistry appears to be a legacy global-root contract. ' +
          `getRoot() succeeds but per-agent getters are unavailable. ${detail}`,
      }
    } catch {
      return {
        status: 'unreadable',
        detail: `Could not read per-agent proof state for agentId ${agentId}: ${detail}`,
      }
    }
  }
}
