import { describe, it, expect } from "vitest";
import {
  generateSecret,
  computeLeaf,
  buildPoseidonMerkleTree,
  getMerkleProof,
  prepareOnboarding,
} from "../src/onboarding.js";
import { poseidonHash } from "../src/poseidon-chain.js";
import { generateMembershipProof } from "../src/proof-generator.js";
import { verifyMembershipProof } from "../src/snarkjs-verify.js";

describe("generateSecret", () => {
  it("produces a 256-bit bigint", () => {
    const secret = generateSecret();
    expect(secret).toBeGreaterThan(0n);
    expect(secret.toString(16).length).toBeLessThanOrEqual(64);
  });

  it("produces different values each call", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).not.toBe(b);
  });
});

describe("computeLeaf", () => {
  it("matches Poseidon(capabilityId, agentSecret, leafIndex)", async () => {
    const leaf = await computeLeaf(42n, 12345n, 0n);
    const direct = await poseidonHash([42n, 12345n, 0n]);
    expect(leaf).toBe(direct);
  });
});

describe("buildPoseidonMerkleTree", () => {
  it("builds a tree with correct root for single leaf", async () => {
    const leaf = await computeLeaf(1n, 999n, 0n);
    const { root, layers } = await buildPoseidonMerkleTree([leaf], 3);

    expect(layers.length).toBe(4); // 3 levels + leaf layer
    expect(root).toBeTruthy();
  });

  it("root changes with different leaves", async () => {
    const leaf1 = await computeLeaf(1n, 999n, 0n);
    const leaf2 = await computeLeaf(2n, 999n, 0n);

    const { root: root1 } = await buildPoseidonMerkleTree([leaf1], 3);
    const { root: root2 } = await buildPoseidonMerkleTree([leaf2], 3);

    expect(root1).not.toBe(root2);
  });

  it("handles 20-level tree efficiently", async () => {
    const leaf = await computeLeaf(1n, 999n, 0n);
    const start = Date.now();
    const { root } = await buildPoseidonMerkleTree([leaf], 20);
    const elapsed = Date.now() - start;

    expect(root).toBeTruthy();
    expect(elapsed).toBeLessThan(5000); // should be fast with sparse tree
  });
});

describe("getMerkleProof", () => {
  it("proof path has correct length", async () => {
    const levels = 3;
    const leaf = await computeLeaf(1n, 999n, 0n);
    const result = await buildPoseidonMerkleTree([leaf], levels);
    const proof = getMerkleProof(0, result.layers, (result as any).zeroHashes);

    expect(proof.pathElements.length).toBe(levels);
    expect(proof.pathIndices.length).toBe(levels);
  });

  it("verifies: recomputing root from proof matches", async () => {
    const levels = 3;
    const leaf = await computeLeaf(1n, 999n, 0n);
    const result = await buildPoseidonMerkleTree([leaf], levels);
    const proof = getMerkleProof(0, result.layers, (result as any).zeroHashes);

    let current = leaf;
    for (let i = 0; i < levels; i++) {
      if (proof.pathIndices[i] === 0) {
        current = await poseidonHash([current, proof.pathElements[i]]);
      } else {
        current = await poseidonHash([proof.pathElements[i], current]);
      }
    }
    expect(current).toBe(result.root);
  });
});

describe("prepareOnboarding", () => {
  it("returns complete private state", async () => {
    const state = await prepareOnboarding(1n, [42n]);

    expect(state.agentId).toBe(1n);
    expect(state.agentSecret).toBeGreaterThan(0n);
    expect(state.capabilities.length).toBe(1);
    expect(state.leafHashes.length).toBe(1);
    expect(state.capabilityMerkleRoot).toBeTruthy();
  });
});

describe("E2E: onboarding → proof generation → verification", () => {
  it("onboarded agent can generate and verify a membership proof", async () => {
    const agentId = 1n;
    const capabilityIds = [42n];
    const auctionId = 9999n;

    // Step 1: Onboard
    const state = await prepareOnboarding(agentId, capabilityIds);

    // Step 2: Build Merkle tree and get proof for capability 0
    const result = await buildPoseidonMerkleTree(state.leafHashes, 20);
    const proof = getMerkleProof(0, result.layers, (result as any).zeroHashes);

    // Step 3: Generate ZK proof
    const { proof: zkProof, publicSignals } = await generateMembershipProof({
      agentSecret: state.agentSecret,
      capabilityId: capabilityIds[0],
      leafIndex: 0n,
      pathElements: proof.pathElements,
      pathIndices: proof.pathIndices,
      auctionId,
      registryRoot: result.root,
    });

    // Step 4: Verify
    const verifyResult = await verifyMembershipProof(zkProof, publicSignals);
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.registryRoot).toBe(result.root.toString());
  }, 30000);
});
