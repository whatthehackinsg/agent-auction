/**
 * Crypto primitives for the auction engine.
 * Delegates to @agent-auction/crypto (real Poseidon, real EIP-712, real nullifiers).
 *
 * EIP-712 signature verification uses viem.verifyTypedData (pure JS, CF Workers compatible).
 * ZK membership proof verification is stubbed — snarkjs vkey loading requires Node fs.
 */
import {
  computeEventHash as _computeEventHash,
  computePayloadHash as _computePayloadHash,
  deriveNullifier as _deriveNullifier,
  type Groth16Proof,
} from '@agent-auction/crypto'
import { verifyTypedData } from 'viem'
import { EIP712_DOMAIN } from './addresses'

// ---- Re-exports (real implementations) ----

export const computeEventHash = _computeEventHash
export const computePayloadHash = _computePayloadHash

// ---- Adapted re-exports ----

/**
 * Derive nullifier for an agent's action in a specific auction.
 * Accepts Uint8Array args (engine convention) - delegates to Poseidon-based nullifier.
 */
export const deriveNullifier = _deriveNullifier

// ---- EIP-712 Typed Data (matching packages/crypto/src/eip712-typed-data.ts) ----

export const AUCTION_EIP712_TYPES = {
  Join: [
    { name: 'auctionId', type: 'uint256' },
    { name: 'nullifier', type: 'uint256' },
    { name: 'depositAmount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  Bid: [
    { name: 'auctionId', type: 'uint256' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  Deliver: [
    { name: 'auctionId', type: 'uint256' },
    { name: 'milestoneId', type: 'uint256' },
    { name: 'deliveryHash', type: 'bytes32' },
    { name: 'executionLogHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export type AuctionSpeechActType = keyof typeof AUCTION_EIP712_TYPES

// ---- Insecure stub gate (test-only) ----

function allowInsecureStubs(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env
  return env?.ENGINE_ALLOW_INSECURE_STUBS === 'true'
}

// ---- EIP-712 Signature Verification (real implementation) ----

/**
 * Verify an EIP-712 typed data signature using viem.verifyTypedData.
 * Recovers the signer from the signature and checks it matches the expected address.
 *
 * When ENGINE_ALLOW_INSECURE_STUBS=true (test-only), bypasses verification.
 */
export async function verifyActionSignature(params: {
  address: `0x${string}`
  primaryType: AuctionSpeechActType
  message: Record<string, unknown>
  signature: `0x${string}`
}): Promise<boolean> {
  if (allowInsecureStubs()) {
    return true
  }
  try {
    return await verifyTypedData({
      address: params.address,
      domain: EIP712_DOMAIN,
      types: { [params.primaryType]: AUCTION_EIP712_TYPES[params.primaryType] },
      primaryType: params.primaryType,
      message: params.message,
      signature: params.signature,
    })
  } catch {
    // viem throws on malformed signatures (e.g. r=0, s=0)
    return false
  }
}

// ---- ZK Membership Proof (stub — CF Workers incompatible) ----

/**
 * Verify ZK membership proof.
 * STUB: snarkjs vkey loading requires Node fs, not available in CF Workers.
 * The CRE workflow handles ZK verification for settlement; the engine
 * only needs this for optional pre-ingestion checks.
 */
export async function verifyMembershipProof(
  proof: unknown,
  signals: unknown
): Promise<{ valid: boolean; registryRoot: string; nullifier: string }> {
  if (allowInsecureStubs()) {
    return { valid: true, registryRoot: '0x00', nullifier: '0x00' }
  }
  return { valid: false, registryRoot: '0x00', nullifier: '0x00' }
}

/** Zero hash constant for chain initialization */
export const ZERO_HASH = new Uint8Array(32)
