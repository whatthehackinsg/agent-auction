/**
 * Agent-side ZK proof generation SDK.
 *
 * Loads proving keys (.zkey + .wasm) and generates Groth16 proofs
 * for RegistryMembership and BidRange circuits.
 */
import * as snarkjs from "snarkjs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Groth16Proof } from "./snarkjs-verify.js";
import { poseidonHash, toFr } from "./poseidon-chain.js";

/** Resolve path to circuits/ directory relative to this package */
function circuitsDir(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return join(__dirname, "..", "..", "..", "circuits");
}

function wasmPath(circuitName: string): string {
  return join(circuitsDir(), `${circuitName}_js`, `${circuitName}.wasm`);
}

function zkeyPath(circuitName: string): string {
  return join(circuitsDir(), "keys", `${circuitName}_final.zkey`);
}

/**
 * Generate a RegistryMembership proof.
 *
 * Proves: "I am a registered agent with capability X without revealing who I am."
 *
 * Public signals output order: [registryRoot, capabilityCommitment, nullifier]
 */
export async function generateMembershipProof(input: {
  agentSecret: bigint;
  capabilityId: bigint;
  leafIndex: bigint;
  pathElements: bigint[];
  pathIndices: number[];
  auctionId: bigint;
  registryRoot: bigint;
}): Promise<{ proof: Groth16Proof; publicSignals: string[] }> {
  // Pre-compute expected public signals for validation
  const capabilityCommitment = await poseidonHash([
    input.capabilityId,
    input.agentSecret,
  ]);
  const nullifier = await poseidonHash([
    input.agentSecret,
    input.auctionId,
    1n, // JOIN action type
  ]);

  const circuitInput = {
    // Private
    agentSecret: input.agentSecret.toString(),
    capabilityId: input.capabilityId.toString(),
    leafIndex: input.leafIndex.toString(),
    pathElements: input.pathElements.map((x) => x.toString()),
    pathIndices: input.pathIndices,
    auctionId: input.auctionId.toString(),
    // Public
    registryRoot: input.registryRoot.toString(),
    capabilityCommitment: capabilityCommitment.toString(),
    nullifier: nullifier.toString(),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    wasmPath("RegistryMembership"),
    zkeyPath("registry_member")
  );

  return { proof: proof as Groth16Proof, publicSignals };
}

/**
 * Generate a BidRange proof.
 *
 * Proves: "My hidden bid is within [reservePrice, maxBudget]."
 *
 * Public signals output order: [rangeOk, bidCommitment, reservePrice, maxBudget]
 */
export async function generateBidRangeProof(input: {
  bid: bigint;
  salt: bigint;
  reservePrice: bigint;
  maxBudget: bigint;
}): Promise<{ proof: Groth16Proof; publicSignals: string[] }> {
  // Pre-compute bid commitment
  const bidCommitment = await poseidonHash([input.bid, input.salt]);

  const circuitInput = {
    // Private
    bid: input.bid.toString(),
    salt: input.salt.toString(),
    // Public
    bidCommitment: bidCommitment.toString(),
    reservePrice: input.reservePrice.toString(),
    maxBudget: input.maxBudget.toString(),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    wasmPath("BidRange"),
    zkeyPath("bid_range")
  );

  return { proof: proof as Groth16Proof, publicSignals };
}

/**
 * Compute a bid commitment: Poseidon(bid, salt)
 */
export async function computeBidCommitment(
  bid: bigint,
  salt: bigint
): Promise<bigint> {
  return poseidonHash([bid, salt]);
}

/**
 * Compute a capability commitment: Poseidon(capabilityId, agentSecret)
 */
export async function computeCapabilityCommitment(
  capabilityId: bigint,
  agentSecret: bigint
): Promise<bigint> {
  return poseidonHash([capabilityId, agentSecret]);
}

/**
 * Compute a leaf hash: Poseidon(capabilityId, agentSecret, leafIndex)
 */
export async function computeLeafHash(
  capabilityId: bigint,
  agentSecret: bigint,
  leafIndex: bigint
): Promise<bigint> {
  return poseidonHash([capabilityId, agentSecret, leafIndex]);
}
