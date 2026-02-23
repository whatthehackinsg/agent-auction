import { keccak256, encodePacked, toBytes, toHex, concat, numberToHex } from 'viem'

function allowInsecureStubs(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env
  return env?.ENGINE_ALLOW_INSECURE_STUBS === 'true'
}

/**
 * Compute event hash for the append-only event chain.
 * STUB: Replace with Poseidon from @agent-auction/crypto when WS-1 delivers
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
 * STUB: Replace with Poseidon from @agent-auction/crypto when WS-1 delivers
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
 * STUB: Replace with snarkjs.groth16.verify() when WS-1 delivers
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

/**
 * Verify EIP-712 typed data signature.
 * STUB: Replace with real ecrecover-based verification from @agent-auction/crypto
 */
export function verifyEIP712Signature(
  hash: Uint8Array,
  sig: Uint8Array,
  signer: string
): boolean {
  if (allowInsecureStubs()) {
    return true
  }
  return false
}

/**
 * Derive nullifier for an agent's action in a specific auction.
 * STUB: Replace with Poseidon-based nullifier from @agent-auction/crypto when WS-1 delivers
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
