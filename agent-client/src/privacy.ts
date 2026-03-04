/**
 * ZK privacy registration for agents.
 *
 * Uses AgentPrivacyRegistry to register Poseidon commitments on-chain.
 * The agent generates agentSecret locally (NEVER shared), builds a
 * capability tree, and stores private state for ZK proof generation
 * at JOIN time.
 *
 * All-Poseidon: no keccak256 registration commits.
 */

import { pad, toHex } from 'viem'
import {
  generateSecret as generatePoseidonSecret,
  buildPoseidonMerkleTree,
  computeCapabilityCommitment,
  computeLeaf,
  type AgentPrivateState,
} from '@agent-auction/crypto'
import { ADDRESSES, publicClient, type createWalletForPrivateKey } from './config.js'
import { logStep } from './utils.js'

// ─── ABI ──────────────────────────────────────────────────────────────

const privacyRegistryAbi = [
  {
    name: 'register',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'poseidonRoot', type: 'bytes32' },
      { name: 'capCommitment', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const

// ─── Re-export AgentPrivateState from @agent-auction/crypto ───────────
// This replaces the local definition and ensures the type is compatible
// with @agent-auction/crypto's proof generation functions.
export type { AgentPrivateState }

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Prepare ZK privacy state for an agent using Poseidon primitives.
 *
 * Generates agentSecret, builds capability Merkle tree, but does NOT
 * send any transaction. The caller must register on-chain separately
 * via registerPrivacy().
 */
export async function preparePrivacyState(
  agentId: bigint,
  capabilityIds: bigint[] = [1n],
): Promise<AgentPrivateState> {
  const agentSecret = generatePoseidonSecret()

  // Build the Poseidon Merkle tree from capability leaf hashes
  // Each leaf = Poseidon(capabilityId, agentSecret, leafIndex)
  const leafHashes: bigint[] = []
  for (let i = 0; i < capabilityIds.length; i++) {
    const leaf = await computeLeaf(capabilityIds[i], agentSecret, BigInt(i))
    leafHashes.push(leaf)
  }
  const treeResult = await buildPoseidonMerkleTree(leafHashes)
  const capabilityMerkleRoot = treeResult.root

  return {
    agentId,
    agentSecret,
    capabilities: capabilityIds.map((id) => ({ capabilityId: id })),
    leafHashes,
    capabilityMerkleRoot,
  }
}

/**
 * Register an agent's Poseidon privacy commitment on-chain via AgentPrivacyRegistry.
 *
 * Passes the Poseidon capability tree root and capability commitment
 * so the engine can cross-check ZK membership proof public signals.
 *
 * @param walletClient - Wallet client with account for signing
 * @param privateState - Privacy state from preparePrivacyState()
 */
export async function registerPrivacy(
  walletClient: ReturnType<typeof createWalletForPrivateKey>['walletClient'],
  privateState: AgentPrivateState,
): Promise<void> {
  logStep('privacy', `registering commitment for agentId=${privateState.agentId.toString()}`)

  // Convert Poseidon root (bigint) to bytes32 hex
  const poseidonRootHex = pad(toHex(privateState.capabilityMerkleRoot), { size: 32 })

  // Compute capabilityCommitment = Poseidon(capabilityId, agentSecret)
  const capCommitmentBig = await computeCapabilityCommitment(
    privateState.capabilities[0].capabilityId,
    privateState.agentSecret,
  )
  const capCommitmentHex = pad(toHex(capCommitmentBig), { size: 32 })

  try {
    const txHash = await walletClient.writeContract({
      address: ADDRESSES.agentPrivacyRegistry,
      abi: privacyRegistryAbi,
      functionName: 'register',
      args: [privateState.agentId, poseidonRootHex, capCommitmentHex],
    })
    await publicClient.waitForTransactionReceipt({ hash: txHash })
    logStep('privacy', `registered successfully`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('Already registered') || message.includes('already registered')) {
      logStep('privacy', `agentId=${privateState.agentId.toString()} already registered, continuing`)
      return
    }
    throw err
  }
}
