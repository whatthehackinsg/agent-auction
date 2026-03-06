/**
 * Identity resolution via ERC-8004 registry.
 *
 * The engine reads on-chain state only — agents self-register via
 * register(agentURI) and own their agentId as an ERC-721 NFT.
 *
 * Also provides per-agent Poseidon root and capability commitment reads
 * from AgentPrivacyRegistry for ZK membership verification.
 */

import { identityRegistry, agentPrivacyRegistry, publicClient } from './chain-client'

/**
 * Resolve the wallet address for a given agentId by reading the
 * ERC-8004 registry on-chain.
 *
 * Tries ownerOf(agentId) first (standard ERC-721).
 * Returns null if the agentId is not registered.
 */
export async function resolveAgentWallet(
  agentId: string,
): Promise<`0x${string}` | null> {
  try {
    const owner = await identityRegistry.read.ownerOf([BigInt(agentId)])
    if (!owner || owner === '0x0000000000000000000000000000000000000000') {
      return null
    }
    return owner as `0x${string}`
  } catch (err) {
    // ownerOf reverts for non-existent tokens (ERC-721 spec)
    const message = err instanceof Error ? err.message : String(err)
    const looksLikeMissingToken =
      message.includes('ERC721') ||
      message.includes('nonexistent') ||
      message.includes('invalid token')

    if (looksLikeMissingToken) {
      return null
    }

    // Other errors are likely RPC/network issues and should fail closed upstream.
    throw err
  }
}

/**
 * Verify that the given wallet address matches the on-chain owner
 * for the given agentId.
 *
 * Returns { verified: true, resolvedWallet } on match,
 * or { verified: false, resolvedWallet } on mismatch.
 */
export async function verifyAgentWallet(
  agentId: string,
  wallet: string,
): Promise<{
  verified: boolean
  resolvedWallet: string | null
  reason?: 'not_registered' | 'mismatch' | 'verified'
}> {
  const resolvedWallet = await resolveAgentWallet(agentId)
  if (!resolvedWallet) {
    return { verified: false, resolvedWallet: null, reason: 'not_registered' }
  }
  const verified = resolvedWallet.toLowerCase() === wallet.toLowerCase()
  if (!verified) {
    return { verified: false, resolvedWallet, reason: 'mismatch' }
  }
  return { verified: true, resolvedWallet, reason: 'verified' }
}

const ZERO_BYTES32 = '0x' + '0'.repeat(64)
const legacyGlobalRootAbi = [
  {
    name: 'getRoot',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const

type PrivacyStateField = 'poseidon_root' | 'capability_commitment'

export type AgentPrivacyState =
  | {
      status: 'ok'
      poseidonRoot: string
      capabilityCommitment: string
    }
  | {
      status: 'missing'
      poseidonRoot: string | null
      capabilityCommitment: string | null
      missing: PrivacyStateField[]
    }
  | {
      status: 'unreadable'
      detail: string
    }

function normalizeBytes32(value: string | null | undefined): string | null {
  if (!value || value === ZERO_BYTES32) {
    return null
  }
  return value
}

async function detectLegacyGlobalRootContract(): Promise<boolean> {
  try {
    await publicClient.readContract({
      address: agentPrivacyRegistry.address,
      abi: legacyGlobalRootAbi,
      functionName: 'getRoot',
    })
    return true
  } catch {
    return false
  }
}

/**
 * Read the on-chain per-agent privacy proof state needed for JOIN verification.
 *
 * Distinguishes between:
 * - `missing`: the contract is readable but the agent has zero/unset proof state
 * - `unreadable`: RPC failure or legacy contract shape prevents reading per-agent proof state
 */
export async function readAgentPrivacyState(agentId: string): Promise<AgentPrivacyState> {
  try {
    const [root, commitment] = await Promise.all([
      agentPrivacyRegistry.read.getAgentPoseidonRoot([BigInt(agentId)]),
      agentPrivacyRegistry.read.getAgentCapabilityCommitment([BigInt(agentId)]),
    ])

    const poseidonRoot = normalizeBytes32(root as string)
    const capabilityCommitment = normalizeBytes32(commitment as string)
    const missing: PrivacyStateField[] = []

    if (!poseidonRoot) {
      missing.push('poseidon_root')
    }
    if (!capabilityCommitment) {
      missing.push('capability_commitment')
    }

    if (missing.length > 0) {
      return {
        status: 'missing',
        poseidonRoot,
        capabilityCommitment,
        missing,
      }
    }

    return {
      status: 'ok',
      poseidonRoot: poseidonRoot!,
      capabilityCommitment: capabilityCommitment!,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const legacyGlobalRoot = await detectLegacyGlobalRootContract()
    return {
      status: 'unreadable',
      detail: legacyGlobalRoot
        ? `Configured AgentPrivacyRegistry appears to be a legacy global-root contract. getRoot() succeeds but per-agent getters are unavailable. ${message}`
        : `Could not read per-agent privacy state for agentId ${agentId}: ${message}`,
    }
  }
}

/**
 * Read the per-agent Poseidon Merkle root from AgentPrivacyRegistry.
 *
 * Returns the root as a 0x-prefixed hex string, or null if not registered / unreadable.
 */
export async function getAgentPoseidonRoot(agentId: string): Promise<string | null> {
  const state = await readAgentPrivacyState(agentId)
  if (state.status === 'ok' || state.status === 'missing') {
    return state.poseidonRoot
  }
  return null
}

/**
 * Read the per-agent capability commitment from AgentPrivacyRegistry.
 *
 * Returns Poseidon(capabilityId, agentSecret) stored during registration,
 * or null if not registered / unreadable.
 */
export async function getAgentCapabilityCommitment(agentId: string): Promise<string | null> {
  const state = await readAgentPrivacyState(agentId)
  if (state.status === 'ok' || state.status === 'missing') {
    return state.capabilityCommitment
  }
  return null
}
