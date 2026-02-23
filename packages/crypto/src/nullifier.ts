/**
 * Nullifier derivation for anti-double-spend in sealed-bid auctions.
 *
 * nullifier = Poseidon(to_fr(agentSecret), to_fr(auctionId), to_fr(actionType))
 *
 * Must match the circuit logic in RegistryMembership.circom line 67-71.
 */
import { poseidonHash, bytesToFr, frToBytes } from "./poseidon-chain.js";

/** Action types matching circuit constants */
export const ActionType = {
  JOIN: 1,
  BID: 2,
  REVEAL: 3,
} as const;

export type ActionTypeValue = (typeof ActionType)[keyof typeof ActionType];

/**
 * Derive a nullifier from an agent's secret, auction ID, and action type.
 * This is deterministic — same inputs always produce the same nullifier,
 * allowing the DO sequencer to detect double-joins / double-bids.
 */
export async function deriveNullifier(
  agentSecret: bigint | Uint8Array,
  auctionId: bigint | Uint8Array,
  actionType: number
): Promise<Uint8Array> {
  const secret =
    typeof agentSecret === "bigint" ? agentSecret : bytesToFr(agentSecret);
  const auction =
    typeof auctionId === "bigint" ? auctionId : bytesToFr(auctionId);
  const hash = await poseidonHash([secret, auction, BigInt(actionType)]);
  return frToBytes(hash);
}

/**
 * Derive nullifier returning a bigint (for use in circuit signal comparison).
 */
export async function deriveNullifierBigInt(
  agentSecret: bigint,
  auctionId: bigint,
  actionType: number
): Promise<bigint> {
  return poseidonHash([agentSecret, auctionId, BigInt(actionType)]);
}
