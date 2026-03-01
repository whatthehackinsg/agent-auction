/**
 * Poseidon-based event hash chaining for the append-only auction log.
 *
 * eventHash = Poseidon([to_fr(seq), to_fr(prevHash), to_fr(payloadHash)])
 * payloadHash = keccak256(abi.encode(uint8 actionType, uint256 agentId, address wallet, uint256 amount))
 *
 * Uses poseidon-lite (zero-dependency, pure BigInt, MIT) instead of circomlibjs.
 * Same BN254 curve, same round constants, same outputs — but CF Workers compatible.
 */
import { poseidon1, poseidon2, poseidon3, poseidon4, poseidon5, poseidon6 } from "poseidon-lite";
import { ethers } from "ethers";

// BN254 scalar field modulus
const F_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * @deprecated No-op retained for backward compatibility. poseidon-lite is synchronous.
 */
export async function getPoseidon(): Promise<null> {
  return null;
}

/** Reduce a bigint into the BN254 scalar field */
export function toFr(x: bigint): bigint {
  const r = ((x % F_MODULUS) + F_MODULUS) % F_MODULUS;
  return r;
}

/** Convert a Uint8Array (big-endian) to a bigint, then reduce mod F */
export function bytesToFr(bytes: Uint8Array): bigint {
  let val = 0n;
  for (const b of bytes) {
    val = (val << 8n) | BigInt(b);
  }
  return toFr(val);
}

/** Convert a bigint to a 32-byte big-endian Uint8Array */
export function frToBytes(val: bigint): Uint8Array {
  const hex = val.toString(16).padStart(64, "0");
  return new Uint8Array(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
}

/** Dispatch to the correct poseidon-lite arity function */
function poseidonN(inputs: bigint[]): bigint {
  switch (inputs.length) {
    case 1: return poseidon1(inputs);
    case 2: return poseidon2(inputs);
    case 3: return poseidon3(inputs);
    case 4: return poseidon4(inputs);
    case 5: return poseidon5(inputs);
    case 6: return poseidon6(inputs);
    default: throw new Error(`Unsupported Poseidon arity: ${inputs.length} (max 6)`);
  }
}

/** Poseidon hash over bigints, returning a bigint in Fr */
export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  return poseidonN(inputs.map((x) => toFr(x)));
}

/**
 * Compute the payload hash for an auction event.
 * payloadHash = keccak256(abi.encode(uint8 actionType, uint256 agentId, address wallet, uint256 amount))
 */
export function computePayloadHash(
  actionType: number,
  agentId: bigint,
  wallet: string,
  amount: bigint
): Uint8Array {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint8", "uint256", "address", "uint256"],
    [actionType, agentId, wallet, amount]
  );
  const hash = ethers.keccak256(encoded);
  return ethers.getBytes(hash);
}

/**
 * Compute the chained event hash.
 * eventHash = Poseidon([to_fr(seq), to_fr(prevHash), to_fr(payloadHash)])
 */
export async function computeEventHash(
  seq: bigint,
  prevHash: Uint8Array,
  payloadHash: Uint8Array
): Promise<Uint8Array> {
  const hash = await poseidonHash([
    toFr(seq),
    bytesToFr(prevHash),
    bytesToFr(payloadHash),
  ]);
  return frToBytes(hash);
}

export { F_MODULUS };
