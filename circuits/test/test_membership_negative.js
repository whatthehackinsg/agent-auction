const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const path = require("path");

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const wasmPath = path.join(__dirname, "../build/RegistryMembership_js/RegistryMembership.wasm");
  const zkeyPath = path.join(__dirname, "../keys/registry_member_final.zkey");
  const vkey = require("../keys/registry_member_vkey.json");

  let passed = 0;
  let failed = 0;

  // Helper: build valid input for a single-leaf 20-level tree
  function buildValidInput() {
    const agentSecret = BigInt("12345678901234567890");
    const capabilityId = BigInt(42);
    const leafIndex = BigInt(0);
    const auctionId = BigInt("0xabc123");

    const leafHash = poseidon([capabilityId, agentSecret, leafIndex]);
    const pathElements = new Array(20).fill("0");
    const pathIndices = new Array(20).fill(0);

    let currentHash = leafHash;
    for (let i = 0; i < 20; i++) {
      currentHash = poseidon([currentHash, BigInt(0)]);
    }
    const registryRoot = F.toObject(currentHash).toString();
    const capCommit = poseidon([capabilityId, agentSecret]);
    const capabilityCommitment = F.toObject(capCommit).toString();
    const nullHash = poseidon([agentSecret, auctionId, BigInt(1)]);
    const nullifier = F.toObject(nullHash).toString();

    return {
      agentSecret: agentSecret.toString(),
      capabilityId: capabilityId.toString(),
      leafIndex: leafIndex.toString(),
      pathElements, pathIndices,
      auctionId: auctionId.toString(),
      salt: "999",
      registryRoot, capabilityCommitment, nullifier,
    };
  }

  // --- Test: Wrong agentSecret — MUST fail ---
  console.log("\n=== Negative Test 1: wrong agentSecret ===");
  try {
    const input = buildValidInput();
    input.agentSecret = "99999999999999999999"; // wrong secret
    await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
    console.error("FAIL — should have thrown (wrong secret)");
    failed++;
  } catch (e) {
    console.log("✓ Correctly rejected wrong agentSecret");
    passed++;
  }

  // --- Test: Wrong capabilityId — MUST fail ---
  console.log("\n=== Negative Test 2: wrong capabilityId ===");
  try {
    const input = buildValidInput();
    input.capabilityId = "99"; // wrong capability
    await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
    console.error("FAIL — should have thrown (wrong capability)");
    failed++;
  } catch (e) {
    console.log("✓ Correctly rejected wrong capabilityId");
    passed++;
  }

  // --- Test: Wrong registryRoot — MUST fail ---
  console.log("\n=== Negative Test 3: wrong registryRoot ===");
  try {
    const input = buildValidInput();
    input.registryRoot = "123456789"; // wrong root
    await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
    console.error("FAIL — should have thrown (wrong root)");
    failed++;
  } catch (e) {
    console.log("✓ Correctly rejected wrong registryRoot");
    passed++;
  }

  // --- Test: Wrong nullifier — MUST fail ---
  console.log("\n=== Negative Test 4: wrong nullifier ===");
  try {
    const input = buildValidInput();
    input.nullifier = "123456789"; // wrong nullifier
    await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
    console.error("FAIL — should have thrown (wrong nullifier)");
    failed++;
  } catch (e) {
    console.log("✓ Correctly rejected wrong nullifier");
    passed++;
  }

  // --- Test: Tampered Merkle path — MUST fail ---
  console.log("\n=== Negative Test 5: tampered Merkle path ===");
  try {
    const input = buildValidInput();
    input.pathElements[0] = "999999"; // corrupt sibling
    await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
    console.error("FAIL — should have thrown (tampered path)");
    failed++;
  } catch (e) {
    console.log("✓ Correctly rejected tampered Merkle path");
    passed++;
  }

  // --- Test: Tampered proof fails verification ---
  console.log("\n=== Negative Test 6: tampered proof ===");
  {
    const input = buildValidInput();
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);

    const tampered = JSON.parse(JSON.stringify(proof));
    tampered.pi_a[0] = "12345678901234567890";

    const valid = await snarkjs.groth16.verify(vkey, publicSignals, tampered);
    if (!valid) {
      console.log("✓ Correctly rejected tampered proof");
      passed++;
    } else {
      console.error("FAIL — tampered proof accepted!");
      failed++;
    }
  }

  // --- Test: Wrong capabilityCommitment — MUST fail ---
  console.log("\n=== Negative Test 7: wrong capabilityCommitment ===");
  try {
    const input = buildValidInput();
    input.capabilityCommitment = "123456789"; // wrong commitment
    await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
    console.error("FAIL — should have thrown (wrong commitment)");
    failed++;
  } catch (e) {
    console.log("✓ Correctly rejected wrong capabilityCommitment");
    passed++;
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
  console.log("✓ All RegistryMembership negative tests PASSED");
}

main().catch(err => { console.error("ERROR:", err); process.exit(1); });
