# WS-1: ZK Circuits + Cryptographic Libraries

**Owner:** ZK Researcher
**Directories owned:** `circuits/`, `packages/crypto/`, `contracts/src/AgentPrivacyRegistry.sol`
**Source of truth:** `docs/full_contract_arch(amended).md` Sections 4-6

---

## Mission

Build all cryptographic infrastructure: Circom circuits, trusted setup, and TypeScript libraries that WS-2 (contracts) and WS-3 (engine) depend on. You are the sole producer of crypto primitives — nothing ships without your libraries being correct.

---

## What You Deliver

| Artifact | Consumer | Deadline | Format |
|----------|----------|----------|--------|
| `RegistryMembership.circom` | Self (setup) | Day 2 | Circom 2.2.3 |
| `BidRange.circom` | Self (setup) | Day 2 | Circom 2.2.3 |
| `registry_member_vkey.json` | WS-3 (DO) | Day 2 | snarkjs export |
| `bid_range_vkey.json` | WS-3 (DO) | Day 2 | snarkjs export |
| `AgentPrivacyRegistry.sol` | WS-2 (deploy) | Day 2 | Solidity |
| `poseidon-chain.ts` | WS-3 (DO sequencer) | Day 4 | TS module |
| `snarkjs-verify.ts` | WS-3 (DO sequencer) | Day 4 | TS module |
| `eip712-typed-data.ts` | WS-3 (DO + agent client) | Day 4 | TS module |
| `nullifier.ts` | WS-3 (DO sequencer) | Day 4 | TS module |
| Poseidon test vectors | WS-2 (Foundry) + WS-3 | Day 4 | JSON |
| `replay-bundle.ts` | WS-2 (CRE) + WS-3 (DO) | Day 6 | TS module |
| `proof-generator.ts` | WS-3 (agent client) | Day 6 | TS module |

---

## What You Receive

| Artifact | From | Expected | Purpose |
|----------|------|----------|---------|
| Deployed `AgentPrivacyRegistry` address | WS-2 | Day 4 | For proof-generator to read `getRoot()` |
| Base Sepolia RPC endpoint | WS-2 | Day 3 | For on-chain root queries |

---

## Day-by-Day Tasks

### Day 1-2: Circuits + Trusted Setup

```
Priority: CRITICAL — WS-3 is blocked on vkeys by Day 3
```

- [ ] Set up environment: Circom 2.2.3 + snarkjs 0.7.5
- [ ] Download Hermez Powers of Tau: `powersOfTau28_hez_final_16.ptau` (supports 65K constraints)
  - URL: `https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_16.ptau`

**RegistryMembership.circom** (~12K constraints):
- [ ] Private inputs: `agentSecret` (256-bit), `capabilityPath[]` (20 Merkle siblings), `salt`, `leafIndex`, `capabilityId`
- [ ] Public inputs: `registryRoot`, `capabilityCommitment`, `nullifier`
- [ ] Circuit logic:
  1. `leafHash = Poseidon(capabilityId, agentSecret, leafIndex)`
  2. Walk Merkle path → compute root
  3. Assert: `computed root == registryRoot`
  4. Assert: `capabilityCommitment == Poseidon(capabilityId, agentSecret)`
  5. Assert: `nullifier == Poseidon(agentSecret, auctionId, JOIN)`
- [ ] Compile: `circom RegistryMembership.circom --r1cs --wasm --sym`

**BidRange.circom** (~5K constraints):
- [ ] Private inputs: `bid` (uint256), `salt`
- [ ] Public inputs: `bidCommitment`, `reservePrice`, `maxBudget`, `rangeOk`
- [ ] Circuit logic:
  1. Assert: `bidCommitment == Poseidon(bid, salt)`
  2. Range check: `bid - reservePrice >= 0` (64-bit binary decomposition)
  3. Range check: `maxBudget - bid >= 0`
  4. Output: `rangeOk = 1`
- [ ] Compile: `circom BidRange.circom --r1cs --wasm --sym`

**Trusted Setup (phase 2) — 3 independent contributors:**
- [ ] For each circuit:
  ```bash
  snarkjs groth16 setup circuit.r1cs powersOfTau28_hez_final_16.ptau circuit_0000.zkey
  snarkjs zkey contribute circuit_0000.zkey circuit_0001.zkey --name="contributor1"
  snarkjs zkey contribute circuit_0001.zkey circuit_0002.zkey --name="contributor2"
  snarkjs zkey contribute circuit_0002.zkey circuit_final.zkey --name="contributor3"
  snarkjs zkey export verificationkey circuit_final.zkey vkey.json
  ```
- [ ] Record each contributor's hash for auditability
- [ ] Export proving keys (for agent-side proof generation)

**AgentPrivacyRegistry.sol:**
- [ ] Write contract (see `full_contract_arch(amended).md` Section 4):
  ```solidity
  contract AgentPrivacyRegistry {
      struct Agent {
          bytes32 registrationCommit;  // keccak256(agentSecret, capabilityMerkleRoot, salt)
          uint256 registeredAt;
          address controller;
      }
      mapping(uint256 => Agent) public agents;  // agentId => Agent
      bytes32 public registryRoot;              // Merkle root of all commitments
      function register(uint256 agentId, bytes32 commit) external;
      function updateCommitment(uint256 agentId, bytes32 newCommit) external;
      function getRoot() external view returns (bytes32);
  }
  ```
- [ ] No `INullifierSet` dependency (nullifiers in DO transactional storage)
- [ ] **Push to `contracts/src/AgentPrivacyRegistry.sol`** — WS-2 deploys

**Deliveries:**
- [ ] Push vkey JSON files to `circuits/keys/`
- [ ] Push `AgentPrivacyRegistry.sol` to `contracts/src/`
- [ ] Tag: `ws1/circuits-ready`

### Day 3-4: TypeScript Crypto Libraries

```
Priority: CRITICAL — WS-3 replaces stubs with these on Day 4
```

All libraries go in `packages/crypto/src/`.

**`poseidon-chain.ts`:**
- [ ] Use `circomlibjs` or `poseidon-lite` (verify identical output to `poseidon-solidity`)
- [ ] Field modulus: `F = 21888242871839275222246405745257275088548364400416034343698204186575808495617`
- [ ] `to_fr(x)`: interpret as big-endian uint256, reduce `mod F`
- [ ] Export:
  ```typescript
  export function computeEventHash(seq: bigint, prevHash: Uint8Array, payloadHash: Uint8Array): Uint8Array
  export function computePayloadHash(actionType: number, agentId: bigint, wallet: string, amount: bigint): Uint8Array
  // payloadHash = keccak256(abi.encode(uint8 actionType, uint256 agentId, address wallet, uint256 amount))
  // eventHash = Poseidon([to_fr(seq), to_fr(prevHash), to_fr(payloadHash)])  // PoseidonT4
  ```

**`snarkjs-verify.ts`:**
- [ ] Load vkeys at module init (from bundled JSON or CDN)
- [ ] Export:
  ```typescript
  export async function verifyMembershipProof(
    proof: Groth16Proof, publicSignals: string[]
  ): Promise<{ valid: boolean; registryRoot: string; nullifier: string }>

  export async function verifyBidRangeProof(
    proof: Groth16Proof, publicSignals: string[]
  ): Promise<{ valid: boolean; bidCommitment: string; rangeOk: boolean }>
  ```

**`eip712-typed-data.ts`:**
- [ ] Implement EIP-712 hash computation for all speech act structs:
  - `Join { auctionId, nullifier, depositAmount, nonce, deadline }`
  - `Bid { auctionId, amount, nonce, deadline }` (MVP English — cleartext)
  - `BidCommit { auctionId, bidCommitment, encryptedBidHash, zkRangeProofHash, nonce, deadline }`
  - `Reveal { auctionId, bid, salt, nonce }`
  - `Deliver { auctionId, milestoneId, deliveryHash, executionLogHash, nonce, deadline }`
  - `Dispute { auctionId, evidencePackageHash, respondent, nonce }`
  - `Withdraw { auctionId, reason, nonce, deadline }`
- [ ] Domain: `{ name: "AgentAuction", version: "1", chainId: 84532, verifyingContract: AuctionRegistry.address }`
- [ ] Export:
  ```typescript
  export function hashTypedData(domain: EIP712Domain, primaryType: string, message: Record<string, any>): Uint8Array
  export function verifyEIP712Signature(typedDataHash: Uint8Array, signature: Uint8Array, expectedSigner: string): boolean
  ```

**`nullifier.ts`:**
- [ ] Export:
  ```typescript
  export function deriveNullifier(agentSecret: Uint8Array, auctionId: Uint8Array, actionType: number): Uint8Array
  // nullifier = Poseidon(to_fr(agentSecret), to_fr(auctionId), to_fr(actionType))  // PoseidonT4
  ```

**Poseidon test vectors (3+):**
- [ ] Vector 1: all inputs < F (small values)
- [ ] Vector 2: inputs > F requiring reduction
- [ ] Vector 3: zero inputs
- [ ] Format: JSON array of `{ inputs: string[], expectedOutput: string }`
- [ ] **Push to `packages/crypto/test/poseidon-vectors.json`**
- [ ] Verify off-chain (circomlibjs) matches on-chain (poseidon-solidity) for all vectors

**Deliveries:**
- [ ] Push all `.ts` files to `packages/crypto/src/`
- [ ] Push test vectors to `packages/crypto/test/`
- [ ] Tag: `ws1/crypto-libs-ready`

### Day 5-6: Replay Bundle + Proof Generation SDK

**`replay-bundle.ts`:**
- [ ] Implement ReplayBundleV1 canonical serialization (see `03-room-broadcast.md`):
  - Header: `schema:v1\nauction_id:<0x64-hex>`
  - Events: `event:seq=<u64>|type=<TOKEN>|agent_id=<u256>|wallet=<0x40-hex>|amount=<u256>|prev_hash=<0x64-hex>|event_hash=<0x64-hex>|payload_hash=<0x64-hex>`
  - No trailing newline
  - `replayContentHash = sha256(canonical_bytes)`
- [ ] Export:
  ```typescript
  export function serializeReplayBundle(auctionId: string, events: AuctionEvent[]): Uint8Array
  export function computeContentHash(bundleBytes: Uint8Array): Uint8Array  // sha256
  ```
- [ ] Verify against test vectors: Vector A hash = `0xab8971d7...`, Vector B hash = `0x4f695aa5...`

**`proof-generator.ts` (agent-side SDK):**
- [ ] Load proving keys (`.zkey` + `.wasm`)
- [ ] Export:
  ```typescript
  export async function generateMembershipProof(
    agentSecret: Uint8Array, capabilityId: bigint, capabilityPath: Uint8Array[],
    leafIndex: number, auctionId: Uint8Array, registryRoot: Uint8Array
  ): Promise<{ proof: Groth16Proof; publicSignals: string[] }>

  export async function generateBidRangeProof(
    bid: bigint, salt: Uint8Array, reservePrice: bigint, maxBudget: bigint
  ): Promise<{ proof: Groth16Proof; publicSignals: string[] }>
  ```

**Deliveries:**
- [ ] Push to `packages/crypto/src/`
- [ ] Tag: `ws1/replay-bundle-ready`

### Day 7-8: Integration Assist

- [ ] Help WS-3 debug ZK proof verification failures in DO
- [ ] Write agent onboarding script:
  1. Generate `agentSecret` (256-bit random)
  2. Compute capability Merkle tree (Poseidon leaves)
  3. Compute `registrationCommit = keccak256(agentSecret, capabilityMerkleRoot, salt)`
  4. Call `AgentPrivacyRegistry.register(agentId, commit)` via viem/ethers
- [ ] Verify full E2E ZK flow: agent generates proof → sends to DO → DO verifies → admission accepted
- [ ] Verify Poseidon cross-language consistency: DO output == Foundry output for same inputs

### Day 9-10: Polish

- [ ] Review all crypto code for correctness
- [ ] Write `circuits/README.md`: setup instructions, constraint counts, trusted setup log
- [ ] Write ZK section of project README
- [ ] Assist with demo video (explain ZK privacy story)

---

## Technical References

| Item | Source |
|------|--------|
| Circom docs | https://docs.circom.io/getting-started/proving-circuits/ |
| snarkjs | https://github.com/iden3/snarkjs |
| poseidon-solidity | https://github.com/chancehudson/poseidon-solidity |
| circomlibjs (Poseidon JS) | https://github.com/iden3/circomlibjs |
| Hermez ptau | `powersOfTau28_hez_final_16.ptau` |
| Field modulus (BN254) | `21888242871839275222246405745257275088548364400416034343698204186575808495617` |
| EIP-712 spec | https://eips.ethereum.org/EIPS/eip-712 |
| Poseidon T mapping | T = arity + 1 (PoseidonT3 = 2-input, PoseidonT4 = 3-input) |

---

## If Behind — What to Cut

1. **Skip BidRange circuit** — membership proof alone demonstrates privacy (saves ~1 day)
2. **Hardcode vkeys** — skip formal trusted setup with 3 contributors, use single-contributor setup
3. **Skip replay-bundle.ts** — let WS-3 implement a simpler serializer (you review)
4. **Skip proof-generator.ts** — WS-3 calls snarkjs directly in agent client
