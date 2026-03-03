/**
 * ZK privacy registration for agents.
 *
 * Uses AgentPrivacyRegistry to register a Poseidon commitment on-chain.
 * The agent generates agentSecret + salt locally (NEVER shared),
 * builds a capability tree, and stores private state for ZK proof
 * generation at JOIN time.
 *
 * Uses @agent-auction/crypto Poseidon primitives for all commitment
 * computation — replaces the previous keccak256 path.
 */

import type { Hex } from 'viem'
import {
  generateSecret as generatePoseidonSecret,
  computeRegistrationCommit as poseidonCommit,
  buildPoseidonMerkleTree,
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
      { name: 'commit', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'getRoot',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
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
 * Generates secrets, builds capability Merkle tree, computes the
 * Poseidon-based on-chain commitment, but does NOT send any transaction.
 * The caller must register on-chain separately via registerPrivacy().
 *
 * Commitment = Poseidon(agentSecret, capabilityMerkleRoot, salt)
 * This matches the RegistryMembership circuit's expected commitment.
 */
export async function preparePrivacyState(
  agentId: bigint,
  capabilityIds: bigint[] = [1n],
): Promise<AgentPrivateState> {
  const agentSecret = generatePoseidonSecret()
  const salt = generatePoseidonSecret()

  // Build the Poseidon Merkle tree from capability leaf hashes
  // Each leaf = Poseidon(capabilityId) — computed internally by buildPoseidonMerkleTree
  // For a single capability, the tree root equals the leaf hash
  const leafHashes = capabilityIds.map((id) => id) // initial: capabilityId as placeholder
  const treeResult = await buildPoseidonMerkleTree(leafHashes)
  const capabilityMerkleRoot = treeResult.root

  // Commitment: solidityPackedKeccak256(agentSecret, capabilityMerkleRoot, salt)
  // computeRegistrationCommit returns a 0x-prefixed hex string
  const registrationCommit = poseidonCommit(agentSecret, capabilityMerkleRoot, salt) as Hex

  return {
    agentId,
    agentSecret,
    salt,
    capabilities: capabilityIds.map((id) => ({ capabilityId: id })),
    leafHashes,
    capabilityMerkleRoot,
    registrationCommit,
  }
}

/**
 * Register an agent's privacy commitment on-chain via AgentPrivacyRegistry.
 *
 * @param walletClient - Wallet client with account for signing
 * @param privateState - Privacy state from preparePrivacyState()
 */
export async function registerPrivacy(
  walletClient: ReturnType<typeof createWalletForPrivateKey>['walletClient'],
  privateState: AgentPrivateState,
): Promise<void> {
  logStep('privacy', `registering commitment for agentId=${privateState.agentId.toString()}`)

  try {
    const txHash = await walletClient.writeContract({
      address: ADDRESSES.agentPrivacyRegistry,
      abi: privacyRegistryAbi,
      functionName: 'register',
      args: [privateState.agentId, privateState.registrationCommit as Hex],
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

/**
 * Read the current registry root from AgentPrivacyRegistry.
 */
export async function readRegistryRoot(): Promise<Hex> {
  const root = await publicClient.readContract({
    address: ADDRESSES.agentPrivacyRegistry,
    abi: privacyRegistryAbi,
    functionName: 'getRoot',
  })
  return root as Hex
}
