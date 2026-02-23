import { describe, it, expect } from "vitest";
import {
  generateBidRangeProof,
  generateMembershipProof,
  computeBidCommitment,
  computeCapabilityCommitment,
  computeLeafHash,
} from "../src/proof-generator.js";
import { verifyBidRangeProof, verifyMembershipProof } from "../src/snarkjs-verify.js";
import { poseidonHash } from "../src/poseidon-chain.js";
import { buildPoseidon } from "circomlibjs";

describe("proof-generator: BidRange", () => {
  it("generates and verifies a valid bid range proof", async () => {
    const bid = 500n;
    const salt = 77777777n;
    const reservePrice = 100n;
    const maxBudget = 1000n;

    const { proof, publicSignals } = await generateBidRangeProof({
      bid,
      salt,
      reservePrice,
      maxBudget,
    });

    // Verify the proof
    const result = await verifyBidRangeProof(proof, publicSignals);
    expect(result.valid).toBe(true);
    expect(result.rangeOk).toBe(true);

    // Check bid commitment matches
    const expectedCommitment = await computeBidCommitment(bid, salt);
    expect(result.bidCommitment).toBe(expectedCommitment.toString());
  });

  it("generates proof at boundary: bid == reservePrice", async () => {
    const { proof, publicSignals } = await generateBidRangeProof({
      bid: 100n,
      salt: 12345n,
      reservePrice: 100n,
      maxBudget: 1000n,
    });
    const result = await verifyBidRangeProof(proof, publicSignals);
    expect(result.valid).toBe(true);
    expect(result.rangeOk).toBe(true);
  });
});

describe("proof-generator: RegistryMembership", () => {
  it("generates and verifies a membership proof", async () => {
    const poseidon = await buildPoseidon();
    const F = poseidon.F;

    const agentSecret = 12345678901234567890n;
    const capabilityId = 42n;
    const leafIndex = 0n;
    const auctionId = 11256099n;
    const salt = 99999n;

    // Build a simple Merkle tree with one real leaf
    const leafHash = await poseidonHash([capabilityId, agentSecret, leafIndex]);

    // Build 20-level tree: leaf at index 0, all siblings are 0
    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    let currentHash = leafHash;

    for (let i = 0; i < 20; i++) {
      pathElements.push(0n); // sibling is 0
      pathIndices.push(0); // our node is on the left

      // Hash(currentHash, 0) to go up the tree
      currentHash = await poseidonHash([currentHash, 0n]);
    }

    const registryRoot = currentHash;

    const { proof, publicSignals } = await generateMembershipProof({
      agentSecret,
      capabilityId,
      leafIndex,
      pathElements,
      pathIndices,
      auctionId,
      salt,
      registryRoot,
    });

    const result = await verifyMembershipProof(proof, publicSignals);
    expect(result.valid).toBe(true);
    expect(result.registryRoot).toBe(registryRoot.toString());

    // Check nullifier matches
    const expectedNullifier = await poseidonHash([agentSecret, auctionId, 1n]);
    expect(result.nullifier).toBe(expectedNullifier.toString());

    // Check capability commitment
    const expectedCapCommit = await poseidonHash([capabilityId, agentSecret]);
    expect(result.capabilityCommitment).toBe(expectedCapCommit.toString());
  });
});

describe("commitment helpers", () => {
  it("computeBidCommitment matches poseidonHash([bid, salt])", async () => {
    const bid = 500n;
    const salt = 77777777n;
    const commit = await computeBidCommitment(bid, salt);
    const direct = await poseidonHash([bid, salt]);
    expect(commit).toBe(direct);
  });

  it("computeCapabilityCommitment matches poseidonHash([capId, secret])", async () => {
    const capId = 42n;
    const secret = 12345678901234567890n;
    const commit = await computeCapabilityCommitment(capId, secret);
    const direct = await poseidonHash([capId, secret]);
    expect(commit).toBe(direct);
  });

  it("computeLeafHash matches poseidonHash([capId, secret, index])", async () => {
    const hash = await computeLeafHash(42n, 12345n, 0n);
    const direct = await poseidonHash([42n, 12345n, 0n]);
    expect(hash).toBe(direct);
  });
});
