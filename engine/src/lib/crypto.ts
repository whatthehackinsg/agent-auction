import { keccak256, encodePacked, toBytes, toHex, concat, numberToHex } from 'viem'

/**
 * Compute event hash for the append-only event chain.
 * STUB: Replace with Poseidon from WS-1 crypto package when available.
 * Swap target:
 *   import { computeEventHash as ws1ComputeEventHash } from '@agent-auction/crypto/poseidon-chain'
 *   export function computeEventHash(...) { return ws1ComputeEventHash(...) }
 */
export function computeEventHash(
  seq: bigint,
  prevHash: Uint8Array,
  payloadHash: Uint8Array
): Uint8Array {
  const seqBytes = toBytes(numberToHex(seq, { size: 32 }))
  const concatenated = concat([seqBytes, prevHash, payloadHash])
  return toBytes(keccak256(concatenated))
}

/**
 * Compute payload hash from action fields.
 * STUB: Replace with Poseidon-based payload hash from WS-1.
 * Swap target:
 *   import { computePayloadHash as ws1ComputePayloadHash } from '@agent-auction/crypto/poseidon-chain'
 *   export function computePayloadHash(...) { return ws1ComputePayloadHash(...) }
 */
export function computePayloadHash(
  actionType: number,
  agentId: bigint,
  wallet: string,
  amount: bigint
): Uint8Array {
  const encoded = encodePacked(
    ['uint8', 'uint256', 'address', 'uint256'],
    [actionType, agentId, wallet as `0x${string}`, amount]
  )
  return toBytes(keccak256(encoded))
}

/**
 * Verify ZK membership proof.
 * STUB: Replace with real Groth16 verification from WS-1.
 * Swap target:
 *   import { verifyMembershipProof as ws1VerifyMembershipProof } from '@agent-auction/crypto/snarkjs-verify'
 *   export async function verifyMembershipProof(...) { return ws1VerifyMembershipProof(...) }
 */
export async function verifyMembershipProof(
  proof: unknown,
  signals: unknown
): Promise<{ valid: boolean; registryRoot: string; nullifier: string }> {
  // STUB: Always returns valid — real implementation uses Groth16 verification
  return { valid: true, registryRoot: '0x00', nullifier: '0x00' }
}

/**
 * Verify EIP-712 typed data signature.
 * STUB: Replace with real EIP-712 signature verification from WS-1.
 * Swap target:
 *   import { verifyEIP712Signature as ws1VerifyEIP712Signature } from '@agent-auction/crypto/eip712-typed-data'
 *   export function verifyEIP712Signature(...) { return ws1VerifyEIP712Signature(...) }
 */
export function verifyEIP712Signature(
  hash: Uint8Array,
  sig: Uint8Array,
  signer: string
): boolean {
  // STUB: Always returns true — real implementation uses ecrecover
  return true
}

/**
 * Derive nullifier for an agent's action in a specific auction.
 * STUB: Replace with Poseidon-based nullifier from WS-1.
 * Swap target:
 *   import { deriveNullifier as ws1DeriveNullifier } from '@agent-auction/crypto/nullifier'
 *   export function deriveNullifier(...) { return ws1DeriveNullifier(...) }
 */
export function deriveNullifier(
  agentSecret: Uint8Array,
  auctionId: Uint8Array,
  actionType: number
): Uint8Array {
  const actionBytes = toBytes(numberToHex(actionType, { size: 1 }))
  const concatenated = concat([agentSecret, auctionId, actionBytes])
  return toBytes(keccak256(concatenated))
}

/** Zero hash constant for chain initialization */
export const ZERO_HASH = new Uint8Array(32)
