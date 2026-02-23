const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const path = require("path");

async function main() {
  console.log("Loading Poseidon...");
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // --- Test 1: Valid bid within range ---
  console.log("\n=== Test 1: Valid bid (500 in range [100, 1000]) ===");
  {
    const bid = BigInt(500);
    const salt = BigInt("77777777");
    const reservePrice = BigInt(100);
    const maxBudget = BigInt(1000);

    const commit = poseidon([bid, salt]);
    const bidCommitment = F.toObject(commit).toString();

    const input = {
      bid: bid.toString(),
      salt: salt.toString(),
      bidCommitment,
      reservePrice: reservePrice.toString(),
      maxBudget: maxBudget.toString(),
    };

    console.log("Generating proof...");
    const startProve = Date.now();
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      path.join(__dirname, "../build/BidRange_js/BidRange.wasm"),
      path.join(__dirname, "../keys/bid_range_final.zkey")
    );
    console.log(`Proof generated in ${Date.now() - startProve}ms`);
    console.log("Public signals:", publicSignals);
    // snarkjs order: outputs first, then public inputs in declaration order
    // [0] rangeOk (output), [1] bidCommitment, [2] reservePrice, [3] maxBudget
    console.log("  [0] rangeOk:", publicSignals[0]);
    console.log("  [1] bidCommitment:", publicSignals[1]);
    console.log("  [2] reservePrice:", publicSignals[2]);
    console.log("  [3] maxBudget:", publicSignals[3]);

    const vkey = require("../keys/bid_range_vkey.json");
    const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    console.log("Proof valid:", valid);

    if (!valid) throw new Error("Test 1 FAILED — valid proof rejected");
    if (publicSignals[0] !== "1") throw new Error("Test 1 FAILED — rangeOk should be 1");
    console.log("✓ Test 1 PASSED");
  }

  // --- Test 2: Bid at exact reserve price (edge case) ---
  console.log("\n=== Test 2: Bid at exact reserve price (100 in [100, 1000]) ===");
  {
    const bid = BigInt(100);
    const salt = BigInt("88888888");
    const reservePrice = BigInt(100);
    const maxBudget = BigInt(1000);

    const commit = poseidon([bid, salt]);
    const bidCommitment = F.toObject(commit).toString();

    const input = {
      bid: bid.toString(),
      salt: salt.toString(),
      bidCommitment,
      reservePrice: reservePrice.toString(),
      maxBudget: maxBudget.toString(),
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      path.join(__dirname, "../build/BidRange_js/BidRange.wasm"),
      path.join(__dirname, "../keys/bid_range_final.zkey")
    );

    const vkey = require("../keys/bid_range_vkey.json");
    const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

    if (!valid) throw new Error("Test 2 FAILED — boundary bid rejected");
    console.log("✓ Test 2 PASSED (boundary: bid == reservePrice)");
  }

  // --- Test 3: Bid at exact max budget (edge case) ---
  console.log("\n=== Test 3: Bid at exact maxBudget (1000 in [100, 1000]) ===");
  {
    const bid = BigInt(1000);
    const salt = BigInt("99999999");
    const reservePrice = BigInt(100);
    const maxBudget = BigInt(1000);

    const commit = poseidon([bid, salt]);
    const bidCommitment = F.toObject(commit).toString();

    const input = {
      bid: bid.toString(),
      salt: salt.toString(),
      bidCommitment,
      reservePrice: reservePrice.toString(),
      maxBudget: maxBudget.toString(),
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      path.join(__dirname, "../build/BidRange_js/BidRange.wasm"),
      path.join(__dirname, "../keys/bid_range_final.zkey")
    );

    const vkey = require("../keys/bid_range_vkey.json");
    const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

    if (!valid) throw new Error("Test 3 FAILED — boundary bid rejected");
    console.log("✓ Test 3 PASSED (boundary: bid == maxBudget)");
  }

  console.log("\n✓ All BidRange tests PASSED");
}

main().catch(err => {
  console.error("ERROR:", err);
  process.exit(1);
});
