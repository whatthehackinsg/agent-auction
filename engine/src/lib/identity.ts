/**
 * Identity resolution via ERC-8004 registry.
 *
 * The engine reads on-chain state only — agents self-register via
 * register(agentURI) and own their agentId as an ERC-721 NFT.
 *
 * Also provides per-agent Poseidon root and capability commitment reads
 * from AgentPrivacyRegistry for ZK membership verification.
 */

import { identityRegistry, agentPrivacyRegistry } from './chain-client'

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

/**
 * Read the per-agent Poseidon Merkle root from AgentPrivacyRegistry.
 *
 * This is the Poseidon root stored on-chain during registration, matching the
 * circuit's registryRoot public signal. Used to cross-check ZK membership proofs.
 *
 * Returns the root as a 0x-prefixed hex string, or null if not registered / zero root.
 */
export async function getAgentPoseidonRoot(
  agentId: string,
): Promise<string | null> {
  try {
    const root = await agentPrivacyRegistry.read.getAgentPoseidonRoot([BigInt(agentId)])
    // Zero bytes32 means not registered or root not stored
    if (!root || root === ('0x' + '0'.repeat(64))) {
      return null
    }
    return root as string
  } catch {
    return null
  }
}

/**
 * Read the per-agent capability commitment from AgentPrivacyRegistry.
 *
 * Returns Poseidon(capabilityId, agentSecret) stored during registration,
 * or null if not registered / zero.
 */
export async function getAgentCapabilityCommitment(
  agentId: string,
): Promise<string | null> {
  try {
    const commitment = await agentPrivacyRegistry.read.getAgentCapabilityCommitment([BigInt(agentId)])
    if (!commitment || commitment === ('0x' + '0'.repeat(64))) {
      return null
    }
    return commitment as string
  } catch {
    return null
  }
}
