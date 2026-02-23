pragma circom 2.1.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

// Prove "my hidden bid is within [reservePrice, maxBudget]"
// without revealing the actual bid amount.
//
// Private inputs: bid, salt
// Public inputs:  bidCommitment, reservePrice, maxBudget
// Public output:  rangeOk (always 1 if constraints pass)
//
// Constraints: ~5K (two 64-bit range checks + Poseidon)
template BidRange(BITS) {
    // --- Private inputs ---
    signal input bid;
    signal input salt;

    // --- Public inputs ---
    signal input bidCommitment;
    signal input reservePrice;
    signal input maxBudget;

    // --- Public output ---
    signal output rangeOk;

    // Step 1: Assert bidCommitment == Poseidon(bid, salt)
    component commitHasher = Poseidon(2);
    commitHasher.inputs[0] <== bid;
    commitHasher.inputs[1] <== salt;
    commitHasher.out === bidCommitment;

    // Step 2: Range check — bid >= reservePrice
    // If (bid - reservePrice) is negative, Num2Bits will fail
    // because it can't represent a negative number in BITS bits
    signal diffLow <== bid - reservePrice;
    component lowBits = Num2Bits(BITS);
    lowBits.in <== diffLow;

    // Step 3: Range check — bid <= maxBudget
    signal diffHigh <== maxBudget - bid;
    component highBits = Num2Bits(BITS);
    highBits.in <== diffHigh;

    // Step 4: If we got here, both range checks passed
    rangeOk <== 1;
}

// 64-bit range checks (bids up to ~1.8 × 10^19)
component main {public [bidCommitment, reservePrice, maxBudget]} = BidRange(64);
