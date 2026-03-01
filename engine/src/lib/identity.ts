/**
 * Identity resolution via ERC-8004 registry.
 *
 * The engine reads on-chain state only — agents self-register via
 * register(agentURI) and own their agentId as an ERC-721 NFT.
 *
 * Also provides getPrivacyRegistryRoot() for ZK membership verification.
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
  } catch {
    // ownerOf reverts for non-existent tokens (ERC-721 spec)
    return null
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
): Promise<{ verified: boolean; resolvedWallet: string | null }> {
  const resolvedWallet = await resolveAgentWallet(agentId)
  if (!resolvedWallet) {
    return { verified: false, resolvedWallet: null }
  }
  const verified = resolvedWallet.toLowerCase() === wallet.toLowerCase()
  return { verified, resolvedWallet }
}

/**
 * Read the current Merkle root from AgentPrivacyRegistry.
 *
 * Used to cross-check membership proofs against the on-chain state.
 * Returns the root as a hex string, or null on error.
 */
export async function getPrivacyRegistryRoot(): Promise<string | null> {
  try {
    const root = await agentPrivacyRegistry.read.getRoot()
    return root as string
  } catch {
    return null
  }
}
