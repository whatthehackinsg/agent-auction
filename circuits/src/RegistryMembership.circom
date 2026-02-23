pragma circom 2.1.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

// Prove membership in the registry Merkle tree
// without revealing which agent you are.
//
// Private inputs: agentSecret, capabilityId, leafIndex, pathElements, pathIndices, auctionId, salt
// Public inputs:  registryRoot, capabilityCommitment, nullifier
//
// Constraints: ~12K (20-level Poseidon Merkle tree)
template RegistryMembership(LEVELS) {
    // --- Private inputs (never leave agent's machine) ---
    signal input agentSecret;
    signal input capabilityId;
    signal input leafIndex;
    signal input pathElements[LEVELS];
    signal input pathIndices[LEVELS];
    signal input auctionId;
    signal input salt;

    // --- Public inputs (sent to DO sequencer) ---
    signal input registryRoot;
    signal input capabilityCommitment;
    signal input nullifier;

    // Step 1: Compute leaf = Poseidon(capabilityId, agentSecret, leafIndex)
    component leafHasher = Poseidon(3);
    leafHasher.inputs[0] <== capabilityId;
    leafHasher.inputs[1] <== agentSecret;
    leafHasher.inputs[2] <== leafIndex;
    signal leafHash <== leafHasher.out;

    // Step 2: Walk Merkle path from leaf to root
    component hashers[LEVELS];
    component mux[LEVELS];

    signal levelHash[LEVELS + 1];
    levelHash[0] <== leafHash;

    for (var i = 0; i < LEVELS; i++) {
        // pathIndices[i] == 0 means current node is left child
        // pathIndices[i] == 1 means current node is right child
        mux[i] = Mux1();
        mux[i].c[0] <== levelHash[i];
        mux[i].c[1] <== pathElements[i];
        mux[i].s <== pathIndices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== mux[i].out;
        hashers[i].inputs[1] <== levelHash[i] + pathElements[i] - mux[i].out;

        levelHash[i + 1] <== hashers[i].out;
    }

    // Step 3: Assert computed root == public registryRoot
    levelHash[LEVELS] === registryRoot;

    // Step 4: Assert capability commitment = Poseidon(capabilityId, agentSecret)
    component capCommit = Poseidon(2);
    capCommit.inputs[0] <== capabilityId;
    capCommit.inputs[1] <== agentSecret;
    capCommit.out === capabilityCommitment;

    // Step 5: Assert nullifier = Poseidon(agentSecret, auctionId, JOIN=1)
    component nullHash = Poseidon(3);
    nullHash.inputs[0] <== agentSecret;
    nullHash.inputs[1] <== auctionId;
    nullHash.inputs[2] <== 1; // JOIN action type
    nullHash.out === nullifier;
}

// 20 levels => supports up to 2^20 (~1M) registered agents
component main {public [registryRoot, capabilityCommitment, nullifier]} = RegistryMembership(20);
