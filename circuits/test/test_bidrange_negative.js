const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const path = require("path");

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const wasmPath = path.join(__dirname, "../build/BidRange_js/BidRange.wasm");
  const zkeyPath = path.join(__dirname, "../keys/bid_range_final.zkey");
  const vkey = require("../keys/bid_range_vkey.json");

  let passed = 0;
  let failed = 0;

  // --- Test: Bid BELOW reserve price (99 < 100) — MUST fail ---
  console.log("\n=== Negative Test 1: bid below reserve (99 < 100) ===");
  try {
    const bid = BigInt(99);
    const salt = BigInt("11111111");
    const reservePrice = BigInt(100);
    const maxBudget = BigInt(1000);

    const commit = poseidon([bid, salt]);
    const bidCommitment = F.toObject(commit).toString();

    await snarkjs.groth16.fullProve(
      { bid: bid.toString(), salt: salt.toString(), bidCommitment, reservePrice: reservePrice.toString(), maxBudget: maxBudget.toString() },
      wasmPath, zkeyPath
    );
    console.error("FAIL — should have thrown (bid below reserve)");
    failed++;
  } catch (e) {
    console.log("✓ Correctly rejected bid below reserve price");
    passed++;
  }

  // --- Test: Bid ABOVE maxBudget (1001 > 1000) — MUST fail ---
  console.log("\n=== Negative Test 2: bid above maxBudget (1001 > 1000) ===");
  try {
    const bid = BigInt(1001);
    const salt = BigInt("22222222");
    const reservePrice = BigInt(100);
    const maxBudget = BigInt(1000);

    const commit = poseidon([bid, salt]);
    const bidCommitment = F.toObject(commit).toString();

    await snarkjs.groth16.fullProve(
      { bid: bid.toString(), salt: salt.toString(), bidCommitment, reservePrice: reservePrice.toString(), maxBudget: maxBudget.toString() },
      wasmPath, zkeyPath
    );
    console.error("FAIL — should have thrown (bid above max)");
    failed++;
  } catch (e) {
    console.log("✓ Correctly rejected bid above maxBudget");
    passed++;
  }

  // --- Test: Wrong commitment (bid=500, but commitment computed with bid=600) — MUST fail ---
  console.log("\n=== Negative Test 3: wrong bid commitment ===");
  try {
    const realBid = BigInt(500);
    const fakeBid = BigInt(600);
    const salt = BigInt("33333333");
    const reservePrice = BigInt(100);
    const maxBudget = BigInt(1000);

    // Commitment for fake bid, but private input is real bid
    const fakeCommit = poseidon([fakeBid, salt]);
    const bidCommitment = F.toObject(fakeCommit).toString();

    await snarkjs.groth16.fullProve(
      { bid: realBid.toString(), salt: salt.toString(), bidCommitment, reservePrice: reservePrice.toString(), maxBudget: maxBudget.toString() },
      wasmPath, zkeyPath
    );
    console.error("FAIL — should have thrown (wrong commitment)");
    failed++;
  } catch (e) {
    console.log("✓ Correctly rejected mismatched bid commitment");
    passed++;
  }

  // --- Test: Tampered proof should fail verification ---
  console.log("\n=== Negative Test 4: tampered proof fails verification ===");
  {
    const bid = BigInt(500);
    const salt = BigInt("44444444");
    const reservePrice = BigInt(100);
    const maxBudget = BigInt(1000);

    const commit = poseidon([bid, salt]);
    const bidCommitment = F.toObject(commit).toString();

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      { bid: bid.toString(), salt: salt.toString(), bidCommitment, reservePrice: reservePrice.toString(), maxBudget: maxBudget.toString() },
      wasmPath, zkeyPath
    );

    // Tamper with proof
    const tampered = JSON.parse(JSON.stringify(proof));
    tampered.pi_a[0] = "12345678901234567890"; // corrupt pi_a

    const valid = await snarkjs.groth16.verify(vkey, publicSignals, tampered);
    if (!valid) {
      console.log("✓ Correctly rejected tampered proof");
      passed++;
    } else {
      console.error("FAIL — tampered proof was accepted!");
      failed++;
    }
  }

  // --- Test: Tampered public signals should fail ---
  console.log("\n=== Negative Test 5: tampered public signals fails verification ===");
  {
    const bid = BigInt(500);
    const salt = BigInt("55555555");
    const reservePrice = BigInt(100);
    const maxBudget = BigInt(1000);

    const commit = poseidon([bid, salt]);
    const bidCommitment = F.toObject(commit).toString();

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      { bid: bid.toString(), salt: salt.toString(), bidCommitment, reservePrice: reservePrice.toString(), maxBudget: maxBudget.toString() },
      wasmPath, zkeyPath
    );

    // Tamper with public signals (change reservePrice)
    const tampered = [...publicSignals];
    tampered[2] = "50"; // change reservePrice from 100 to 50

    const valid = await snarkjs.groth16.verify(vkey, tampered, proof);
    if (!valid) {
      console.log("✓ Correctly rejected tampered public signals");
      passed++;
    } else {
      console.error("FAIL — tampered signals were accepted!");
      failed++;
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
  console.log("✓ All BidRange negative tests PASSED");
}

main().catch(err => { console.error("ERROR:", err); process.exit(1); });
