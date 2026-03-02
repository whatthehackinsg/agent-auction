/**
 * Public signal indices for RegistryMembership circuit.
 * snarkjs groth16.fullProve returns publicSignals[] in this fixed order.
 * nPublic=3 (matches MEMBERSHIP_VKEY.nPublic in engine/src/lib/crypto.ts)
 *
 * NOTE: publicSignals[REGISTRY_ROOT] is the POSEIDON Merkle root from the circuit witness.
 * It does NOT match AgentPrivacyRegistry.getRoot() which uses keccak256 internally.
 * The Groth16 proof itself binds the Poseidon root — no external cross-check is needed.
 */
export const MEMBERSHIP_SIGNALS = {
  REGISTRY_ROOT: 0,
  CAPABILITY_COMMITMENT: 1,
  NULLIFIER: 2,
} as const

/**
 * Public signal indices for BidRange circuit.
 * nPublic=4 (matches BID_RANGE_VKEY.nPublic in engine/src/lib/crypto.ts)
 */
export const BID_RANGE_SIGNALS = {
  RANGE_OK: 0,
  BID_COMMITMENT: 1,
  RESERVE_PRICE: 2,
  MAX_BUDGET: 3,
} as const

export type MembershipSignalKey = keyof typeof MEMBERSHIP_SIGNALS
export type BidRangeSignalKey = keyof typeof BID_RANGE_SIGNALS
