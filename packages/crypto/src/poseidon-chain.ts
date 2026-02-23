/**
 * Poseidon-based event hash chaining for the append-only auction log.
 *
 * eventHash = Poseidon([to_fr(seq), to_fr(prevHash), to_fr(payloadHash)])
 * payloadHash = keccak256(abi.encode(uint8 actionType, uint256 agentId, address wallet, uint256 amount))
 */
import { buildPoseidon, type Poseidon } from "circomlibjs";
import { ethers } from "ethers";

// BN254 scalar field modulus
const F_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

let _poseidon: Poseidon | null = null;

export async function getPoseidon(): Promise<Poseidon> {
  if (!_poseidon) {
    _poseidon = await buildPoseidon();
  }
  return _poseidon;
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

/** Poseidon hash over bigints, returning a bigint in Fr */
export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const poseidon = await getPoseidon();
  const hash = poseidon(inputs.map((x) => toFr(x)));
  return poseidon.F.toObject(hash) as bigint;
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
