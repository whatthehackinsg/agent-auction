const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const path = require("path");

async function main() {
  console.log("Loading Poseidon...");
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // --- Setup test data ---
  const agentSecret = BigInt("12345678901234567890");
  const capabilityId = BigInt(42);
  const leafIndex = BigInt(0);
  const auctionId = BigInt("0xabc123");

  // Compute leaf = Poseidon(capabilityId, agentSecret, leafIndex)
  const leafHash = poseidon([capabilityId, agentSecret, leafIndex]);
  console.log("Leaf hash:", F.toObject(leafHash).toString());

  // Build minimal 20-level Merkle tree (1 leaf, rest empty)
  // All siblings are 0 (empty), leaf is at index 0 (leftmost path)
  const pathElements = new Array(20).fill("0");
  const pathIndices = new Array(20).fill(0);

  // Walk the tree up to compute the root
  let currentHash = leafHash;
  for (let i = 0; i < 20; i++) {
    // our node is left child (index 0), sibling is 0
    currentHash = poseidon([currentHash, BigInt(0)]);
  }
  const registryRoot = F.toObject(currentHash).toString();
  console.log("Registry root:", registryRoot);

  // Capability commitment = Poseidon(capabilityId, agentSecret)
  const capCommit = poseidon([capabilityId, agentSecret]);
  const capabilityCommitment = F.toObject(capCommit).toString();

  // Nullifier = Poseidon(agentSecret, auctionId, 1)
  const nullHash = poseidon([agentSecret, auctionId, BigInt(1)]);
  const nullifier = F.toObject(nullHash).toString();

  const input = {
    agentSecret: agentSecret.toString(),
    capabilityId: capabilityId.toString(),
    leafIndex: leafIndex.toString(),
    pathElements,
    pathIndices,
    auctionId: auctionId.toString(),
    salt: "999",
    registryRoot,
    capabilityCommitment,
    nullifier,
  };

  // --- Generate proof ---
  console.log("\nGenerating proof (this takes a few seconds)...");
  const startProve = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    path.join(__dirname, "../build/RegistryMembership_js/RegistryMembership.wasm"),
    path.join(__dirname, "../keys/registry_member_final.zkey")
  );
  console.log(`Proof generated in ${Date.now() - startProve}ms`);
  console.log("Public signals:", publicSignals);
  console.log("  [0] registryRoot:", publicSignals[0]);
  console.log("  [1] capabilityCommitment:", publicSignals[1]);
  console.log("  [2] nullifier:", publicSignals[2]);

  // --- Verify proof ---
  console.log("\nVerifying proof...");
  const vkey = require("../keys/registry_member_vkey.json");
  const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  console.log("Proof valid:", valid);

  if (!valid) {
    console.error("FAIL — proof verification failed!");
    process.exit(1);
  }
  console.log("\n✓ RegistryMembership: prove + verify PASSED");
}

main().catch(err => {
  console.error("ERROR:", err);
  process.exit(1);
});
