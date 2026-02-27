/**
 * Crypto primitives for the auction engine (CF Workers compatible).
 *
 * Uses keccak256 (via viem) for event hash chaining and nullifier derivation.
 * This differs from @agent-auction/crypto which uses Poseidon for ZK-verifiability.
 * The engine's hash chain is purely an integrity commitment — ZK verification
 * happens in the CRE workflow, not in the engine.
 *
 * EIP-712 signature verification uses viem.verifyTypedData (pure JS, CF Workers compatible).
 * ZK membership proof verification is stubbed — snarkjs requires Node fs.
 */
import {
  keccak256,
  encodeAbiParameters,
  toBytes,
  toHex,
  verifyTypedData,
} from 'viem'
import { EIP712_DOMAIN } from './addresses'

// ---- Hash Chain (keccak256-based, CF Workers compatible) ----

/**
 * Compute the payload hash for an auction event.
 * payloadHash = keccak256(abi.encode(uint8 actionType, uint256 agentId, address wallet, uint256 amount))
 *
 * Uses identical encoding to @agent-auction/crypto — both use ABI encoding + keccak256.
 */
export function computePayloadHash(
  actionType: number,
  agentId: bigint,
  wallet: string,
  amount: bigint,
): Uint8Array {
  const encoded = encodeAbiParameters(
    [
      { name: 'actionType', type: 'uint8' },
      { name: 'agentId', type: 'uint256' },
      { name: 'wallet', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    [actionType, agentId, wallet as `0x${string}`, amount],
  )
  return toBytes(keccak256(encoded))
}

/**
 * Compute the chained event hash.
 * eventHash = keccak256(abi.encode(uint256 seq, bytes32 prevHash, bytes32 payloadHash))
 *
 * Note: @agent-auction/crypto uses Poseidon for this step. The engine uses keccak256
 * because Poseidon (via circomlibjs/ffjavascript) is incompatible with CF Workers.
 * This is safe because the finalLogHash is a commitment, not ZK-verified in the engine.
 */
export async function computeEventHash(
  seq: bigint,
  prevHash: Uint8Array,
  payloadHash: Uint8Array,
): Promise<Uint8Array> {
  const encoded = encodeAbiParameters(
    [
      { name: 'seq', type: 'uint256' },
      { name: 'prevHash', type: 'bytes32' },
      { name: 'payloadHash', type: 'bytes32' },
    ],
    [seq, toHex(prevHash, { size: 32 }) as `0x${string}`, toHex(payloadHash, { size: 32 }) as `0x${string}`],
  )
  return toBytes(keccak256(encoded))
}

// ---- Nullifier Derivation (keccak256-based) ----

/**
 * Derive nullifier for an agent's action in a specific auction.
 * nullifier = keccak256(abi.encode(uint256 agentSecret, uint256 auctionId, uint256 actionType))
 *
 * Note: @agent-auction/crypto uses Poseidon for nullifiers (matching ZK circuits).
 * The engine uses keccak256 as a unique deterministic identifier for double-join detection.
 */
export async function deriveNullifier(
  agentSecret: bigint | Uint8Array,
  auctionId: bigint | Uint8Array,
  actionType: number,
): Promise<Uint8Array> {
  const secret = typeof agentSecret === 'bigint' ? agentSecret : bytesToBigInt(agentSecret)
  const auction = typeof auctionId === 'bigint' ? auctionId : bytesToBigInt(auctionId)
  const encoded = encodeAbiParameters(
    [
      { name: 'secret', type: 'uint256' },
      { name: 'auction', type: 'uint256' },
      { name: 'actionType', type: 'uint256' },
    ],
    [secret, auction, BigInt(actionType)],
  )
  return toBytes(keccak256(encoded))
}

/** Convert big-endian Uint8Array to bigint */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let val = 0n
  for (const b of bytes) {
    val = (val << 8n) | BigInt(b)
  }
  return val
}

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
    return false
  }
}

// ---- ZK Membership Proof (stub — CF Workers incompatible) ----

export async function verifyMembershipProof(
  proof: unknown,
  signals: unknown
): Promise<{ valid: boolean; registryRoot: string; nullifier: string }> {
  // ZK proof verification requires snarkjs which is incompatible with CF Workers.
  // Accept all proofs at the engine layer — real verification happens in CRE.
  return { valid: true, registryRoot: '0x00', nullifier: '0x00' }
}

/** Zero hash constant for chain initialization */
export const ZERO_HASH = new Uint8Array(32)
