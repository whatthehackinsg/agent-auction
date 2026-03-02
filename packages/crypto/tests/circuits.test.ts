/**
 * End-to-end circuit proof generation + verification tests.
 *
 * Tests both RegistryMembership and BidRange Groth16 circuits using:
 * - Real .wasm/.zkey artifacts from circuits/ directory
 * - Disk-based vkeys from circuits/keys/*.json (no engine dependency)
 * - MEMBERSHIP_SIGNALS / BID_RANGE_SIGNALS named constants (no magic numbers)
 *
 * Purpose: Confirms .wasm/.zkey artifacts are consistent with vkeys and
 * that the full generate→verify path works in isolation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { generateMembershipProof, generateBidRangeProof } from "../src/proof-generator.js";
import { buildPoseidonMerkleTree, getMerkleProof, computeLeaf } from "../src/onboarding.js";
import { MEMBERSHIP_SIGNALS, BID_RANGE_SIGNALS } from "../src/signal-indices.js";

// ---- vkey loading from disk ----

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve path to circuits/keys/ from this test file.
 * packages/crypto/tests -> packages/crypto -> packages -> repo root -> circuits/keys
 */
function keysDir(): string {
  return join(__dirname, "..", "..", "..", "circuits", "keys");
}

function loadVKey(filename: string): unknown {
  const vkeyPath = join(keysDir(), filename);
  return JSON.parse(readFileSync(vkeyPath, "utf-8"));
}

// ---- Test suite ----

describe("RegistryMembership circuit", () => {
  it(
    "generates and verifies a real Groth16 proof",
    async () => {
      const snarkjs = await import("snarkjs");

      const agentSecret = 12345678901234567890n;
      const capabilityId = 1n;
      const leafIndex = 0n;
      const auctionId = 1n;
      const salt = 9999n;

      // Build a minimal 1-leaf Poseidon Merkle tree (20 levels, matches circuit)
      const leaf = await computeLeaf(capabilityId, agentSecret, leafIndex);
      const treeResult = await buildPoseidonMerkleTree([leaf], 20);
      const merkleProof = getMerkleProof(0, treeResult.layers, (treeResult as any).zeroHashes);

      const { proof, publicSignals } = await generateMembershipProof({
        agentSecret,
        capabilityId,
        leafIndex,
        pathElements: merkleProof.pathElements,
        pathIndices: merkleProof.pathIndices,
        auctionId,
        salt,
        registryRoot: treeResult.root,
      });

      const vkey = loadVKey("registry_member_vkey.json");
      const verified = await snarkjs.groth16.verify(vkey as any, publicSignals, proof as any);

      expect(verified).toBe(true);

      // Public signal checks using named constants (no magic numbers)
      expect(publicSignals[MEMBERSHIP_SIGNALS.REGISTRY_ROOT]).toBe(treeResult.root.toString());
      expect(publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER]).toBeTruthy();
      expect(publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER]).not.toBe("0");
    },
    60000
  );

  it(
    "rejects tampered public signals (nullifier zeroed)",
    async () => {
      const snarkjs = await import("snarkjs");

      const agentSecret = 12345678901234567890n;
      const capabilityId = 1n;
      const leafIndex = 0n;
      const auctionId = 1n;
      const salt = 9999n;

      const leaf = await computeLeaf(capabilityId, agentSecret, leafIndex);
      const treeResult = await buildPoseidonMerkleTree([leaf], 20);
      const merkleProof = getMerkleProof(0, treeResult.layers, (treeResult as any).zeroHashes);

      const { proof, publicSignals } = await generateMembershipProof({
        agentSecret,
        capabilityId,
        leafIndex,
        pathElements: merkleProof.pathElements,
        pathIndices: merkleProof.pathIndices,
        auctionId,
        salt,
        registryRoot: treeResult.root,
      });

      // Tamper: zero out the nullifier signal
      const tampered = [...publicSignals];
      tampered[MEMBERSHIP_SIGNALS.NULLIFIER] = "0";

      const vkey = loadVKey("registry_member_vkey.json");
      const verified = await snarkjs.groth16.verify(vkey as any, tampered, proof as any);

      expect(verified).toBe(false);
    },
    60000
  );
});

describe("BidRange circuit", () => {
  it(
    "accepts bid in range (bid=500, reservePrice=100, maxBudget=1000)",
    async () => {
      const snarkjs = await import("snarkjs");

      const { proof, publicSignals } = await generateBidRangeProof({
        bid: 500n,
        salt: 42n,
        reservePrice: 100n,
        maxBudget: 1000n,
      });

      const vkey = loadVKey("bid_range_vkey.json");
      const verified = await snarkjs.groth16.verify(vkey as any, publicSignals, proof as any);

      expect(verified).toBe(true);
      expect(publicSignals[BID_RANGE_SIGNALS.RANGE_OK]).toBe("1");
    },
    60000
  );

  it(
    "rejects bid below reservePrice (bid=50, reservePrice=100) — proof generation throws",
    async () => {
      // The Circom circuit enforces bid >= reservePrice via constraints.
      // fullProve will throw (constraint unsatisfied) if bid < reservePrice.
      await expect(
        generateBidRangeProof({
          bid: 50n,
          salt: 42n,
          reservePrice: 100n,
          maxBudget: 1000n,
        })
      ).rejects.toThrow();
    },
    60000
  );
});
