/**
 * ZK privacy registration for agents.
 *
 * Uses AgentPrivacyRegistry to register a Poseidon commitment on-chain.
 * The agent generates agentSecret + salt locally (NEVER shared),
 * builds a capability tree, and stores private state for ZK proof
 * generation at JOIN time.
 *
 * This module re-implements the crypto primitives using viem
 * to avoid pulling in ethers as a dependency.
 */

import {
  type Hex,
  encodeAbiParameters,
  keccak256,
} from 'viem'
import { ADDRESSES, publicClient, type createWalletForPrivateKey } from './config'
import { logStep } from './utils'

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

// ─── Types ────────────────────────────────────────────────────────────

export interface AgentPrivateState {
  agentId: bigint
  agentSecret: bigint
  salt: bigint
  capabilityIds: bigint[]
  registrationCommit: Hex
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Generate a cryptographically random 256-bit secret */
function generateSecret(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let result = 0n
  for (const b of bytes) {
    result = (result << 8n) | BigInt(b)
  }
  return result
}

/**
 * Compute the on-chain registration commitment.
 * registrationCommit = keccak256(abi.encodePacked(agentSecret, capabilityMerkleRoot, salt))
 *
 * For simplicity in the demo, we use capabilityId directly as the "root"
 * when there's only one capability. For multi-capability agents, use
 * the full Poseidon Merkle tree from @agent-auction/crypto.
 */
function computeRegistrationCommit(
  agentSecret: bigint,
  capabilityRoot: bigint,
  salt: bigint,
): Hex {
  const encoded = encodeAbiParameters(
    [
      { name: 'agentSecret', type: 'uint256' },
      { name: 'capabilityRoot', type: 'uint256' },
      { name: 'salt', type: 'uint256' },
    ],
    [agentSecret, capabilityRoot, salt],
  )
  return keccak256(encoded)
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Prepare ZK privacy state for an agent.
 *
 * Generates secrets, computes the on-chain commitment, but does NOT
 * send any transaction. The caller must register on-chain separately.
 */
export function preparePrivacyState(
  agentId: bigint,
  capabilityIds: bigint[] = [1n],
): AgentPrivateState {
  const agentSecret = generateSecret()
  const salt = generateSecret()

  // For single capability, use capabilityId as root directly.
  // For multi-capability, use Poseidon Merkle tree (via @agent-auction/crypto).
  const capabilityRoot = capabilityIds[0]

  const registrationCommit = computeRegistrationCommit(
    agentSecret,
    capabilityRoot,
    salt,
  )

  return {
    agentId,
    agentSecret,
    salt,
    capabilityIds,
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
      args: [privateState.agentId, privateState.registrationCommit],
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
