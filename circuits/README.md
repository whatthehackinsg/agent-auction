# ZK Circuits

Groth16 circuits for the agent-auction privacy layer. Built with Circom 2.2.3 + snarkjs 0.7.5 on the BN254 curve.

## Circuits

### RegistryMembership

Proves "I am a registered agent with capability X" without revealing which agent.

| Metric | Value |
|--------|-------|
| Non-linear constraints | 5,651 |
| Linear constraints | 6,456 |
| Wires | 12,152 |
| Merkle levels | 20 (supports ~1M agents) |
| Proving time | ~400ms (Node.js) |

**Private inputs:** `agentSecret`, `capabilityId`, `leafIndex`, `pathElements[20]`, `pathIndices[20]`, `auctionId`, `salt`

**Public inputs:** `registryRoot`, `capabilityCommitment`, `nullifier`

**What it proves:**
1. Agent knows a secret that hashes to a leaf in the registry Merkle tree
2. The computed Merkle root matches the public `registryRoot`
3. `capabilityCommitment = Poseidon(capabilityId, agentSecret)`
4. `nullifier = Poseidon(agentSecret, auctionId, 1)` — prevents double-join

### BidRange

Proves "my hidden bid is within [reservePrice, maxBudget]" without revealing the bid.

| Metric | Value |
|--------|-------|
| Non-linear constraints | 371 |
| Linear constraints | 279 |
| Wires | 653 |
| Range check bits | 64 (bids up to ~1.8 x 10^19) |
| Proving time | ~200ms (Node.js) |

**Private inputs:** `bid`, `salt`

**Public inputs:** `bidCommitment`, `reservePrice`, `maxBudget`

**Public output:** `rangeOk` (always 1 if constraints pass)

**What it proves:**
1. `bidCommitment = Poseidon(bid, salt)`
2. `bid >= reservePrice` (64-bit decomposition)
3. `bid <= maxBudget` (64-bit decomposition)

## Directory Structure

```
circuits/
  src/
    RegistryMembership.circom    # Membership proof circuit
    BidRange.circom              # Bid range proof circuit
  keys/
    registry_member_vkey.json    # Verification key (used by DO sequencer)
    registry_member_final.zkey   # Proving key (used by agent SDK)
    bid_range_vkey.json          # Verification key
    bid_range_final.zkey         # Proving key
  RegistryMembership_js/         # WASM for witness generation
  BidRange_js/                   # WASM for witness generation
  test/
    test_membership.js           # Positive tests
    test_membership_negative.js  # 7 negative tests
    test_bidrange.js             # Positive tests (3 cases)
    test_bidrange_negative.js    # 5 negative tests
```

## Setup from Scratch

### Prerequisites

- Circom 2.2.3: `cargo install circom --version 2.2.3`
- snarkjs 0.7.5: `npm install -g snarkjs`
- Powers of Tau: download `powersOfTau28_hez_final_16.ptau` (supports up to 65K constraints)

```bash
curl -O https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_16.ptau
```

### Compile Circuits

```bash
cd circuits
circom src/RegistryMembership.circom --r1cs --wasm --sym -o .
circom src/BidRange.circom --r1cs --wasm --sym -o .
```

### Trusted Setup (Phase 2)

```bash
# RegistryMembership
snarkjs groth16 setup RegistryMembership.r1cs powersOfTau28_hez_final_16.ptau keys/registry_member_0000.zkey
snarkjs zkey contribute keys/registry_member_0000.zkey keys/registry_member_final.zkey --name="contributor1"
snarkjs zkey export verificationkey keys/registry_member_final.zkey keys/registry_member_vkey.json

# BidRange
snarkjs groth16 setup BidRange.r1cs powersOfTau28_hez_final_16.ptau keys/bid_range_0000.zkey
snarkjs zkey contribute keys/bid_range_0000.zkey keys/bid_range_final.zkey --name="contributor1"
snarkjs zkey export verificationkey keys/bid_range_final.zkey keys/bid_range_vkey.json
```

### Run Tests

```bash
cd circuits
npm install
node test/test_membership.js
node test/test_membership_negative.js
node test/test_bidrange.js
node test/test_bidrange_negative.js
```

## Test Results

**RegistryMembership:** 1 positive + 7 negative = 8/8 passing

**BidRange:** 3 positive + 5 negative = 8/8 passing

Negative tests cover: wrong secret, wrong capability, wrong root, wrong nullifier, tampered Merkle path, tampered proof, wrong commitment, bid below reserve, bid above max budget, wrong bid commitment, tampered proof bytes, tampered public signals.

## TypeScript Integration

The `packages/crypto` package provides TypeScript wrappers:

```typescript
import {
  generateMembershipProof,
  generateBidRangeProof,
  verifyMembershipProof,
  verifyBidRangeProof,
} from '@agent-auction/crypto'

// Agent side: generate proof
const { proof, publicSignals } = await generateMembershipProof({ ... })

// DO sequencer side: verify proof
const { valid, registryRoot, nullifier } = await verifyMembershipProof(proof, publicSignals)
```

## Security Notes

- **Trusted setup:** Current keys use a single contributor (hackathon). Production requires 3+ independent contributors — one honest contributor is sufficient for soundness.
- **Field modulus:** All Poseidon inputs are reduced mod BN254 scalar field (`F = 21888242871839275222246405745257275088548364400416034343698204186575808495617`).
- **Nullifiers** are tracked in DO transactional storage (not on-chain) for zero gas cost.
- **Verification** happens off-chain in the DO sequencer via `snarkjs.groth16.verify()` (~200ms, $0 gas).
