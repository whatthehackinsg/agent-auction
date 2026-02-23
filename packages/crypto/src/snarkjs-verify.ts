/**
 * Off-chain ZK proof verification using snarkjs.
 *
 * Loads verification keys from circuits/keys/ and provides typed
 * wrappers around groth16.verify() for the DO sequencer.
 */
import * as snarkjs from "snarkjs";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

export interface Groth16Proof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: string;
  curve: string;
}

interface VKey {
  protocol: string;
  curve: string;
  nPublic: number;
  vk_alpha_1: string[];
  vk_beta_2: string[][];
  vk_gamma_2: string[][];
  vk_delta_2: string[][];
  vk_alphabeta_12: string[][][];
  IC: string[][];
}

let _membershipVKey: VKey | null = null;
let _bidRangeVKey: VKey | null = null;

/** Resolve path to circuits/keys/ relative to this package */
function keysDir(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // packages/crypto/src -> packages/crypto -> packages -> repo root -> circuits/keys
  return join(__dirname, "..", "..", "..", "circuits", "keys");
}

async function loadVKey(filename: string): Promise<VKey> {
  const path = join(keysDir(), filename);
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw);
}

export async function getMembershipVKey(): Promise<VKey> {
  if (!_membershipVKey) {
    _membershipVKey = await loadVKey("registry_member_vkey.json");
  }
  return _membershipVKey;
}

export async function getBidRangeVKey(): Promise<VKey> {
  if (!_bidRangeVKey) {
    _bidRangeVKey = await loadVKey("bid_range_vkey.json");
  }
  return _bidRangeVKey;
}

/**
 * Verify a RegistryMembership proof.
 *
 * Public signals order (from circuit):
 *   [0] registryRoot
 *   [1] capabilityCommitment
 *   [2] nullifier
 */
export async function verifyMembershipProof(
  proof: Groth16Proof,
  publicSignals: string[]
): Promise<{
  valid: boolean;
  registryRoot: string;
  capabilityCommitment: string;
  nullifier: string;
}> {
  const vkey = await getMembershipVKey();
  const valid = await snarkjs.groth16.verify(
    vkey as any,
    publicSignals,
    proof as any
  );
  return {
    valid,
    registryRoot: publicSignals[0],
    capabilityCommitment: publicSignals[1],
    nullifier: publicSignals[2],
  };
}

/**
 * Verify a BidRange proof.
 *
 * Public signals order (from circuit):
 *   [0] rangeOk (output)
 *   [1] bidCommitment
 *   [2] reservePrice
 *   [3] maxBudget
 */
export async function verifyBidRangeProof(
  proof: Groth16Proof,
  publicSignals: string[]
): Promise<{
  valid: boolean;
  bidCommitment: string;
  rangeOk: boolean;
}> {
  const vkey = await getBidRangeVKey();
  const valid = await snarkjs.groth16.verify(
    vkey as any,
    publicSignals,
    proof as any
  );
  return {
    valid,
    bidCommitment: publicSignals[1],
    rangeOk: publicSignals[0] === "1",
  };
}
