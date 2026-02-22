> **Note: Legacy Document**
> This file is kept for historical context. It may contain minor inconsistencies
> with the current design. For the implementation-accurate English deep spec, see:
>
> - [Orchestrator / Index](./research/research_report_20260219_agent_auction_architecture.md)
> - [01 - Agent Onboarding](./research/agent-auction-architecture/01-agent-onboarding.md)
> - [02 - Agent Voice](./research/agent-auction-architecture/02-agent-voice.md)
> - [03 - Room Broadcast](./research/agent-auction-architecture/03-room-broadcast.md)
> - [04 - Payment and Escrow](./research/agent-auction-architecture/04-payment-and-escrow.md)
> - [05 - Host Object Observation](./research/agent-auction-architecture/05-host-object-observation.md)
> - [06 - Appendix](./research/agent-auction-architecture/06-appendix.md)

# Full Blockchain Infrastructure — Agent Auction System

# 0. Why This Architecture Exists (The Problem Stack)

Before any contract, understand the three problems we are solving simultaneously:

**Problem 1 — Financial Privacy.** When an agent joins an auction, it should not reveal its financial profile. A naive implementation leaks: the size of its deposit (reveals wallet depth), the bid amount (reveals valuation), and its registry entry (reveals capability set → bid power can be inferred). We solve bid amounts and agent identities with ZK proofs (Groth16 membership + range proofs). **MVP caveat:** deposit sizes are NOT hidden — `bondRecords` is a public mapping and `BondRecorded` events emit amounts on-chain. Deposit privacy (ZK deposit proofs or shielded pool) is a P1 extension.

**Problem 2 — Trustless Ordering.** Someone has to decide which bid wins. In a centralized system that someone is the auctioneer — who can front-run, reorder, or simply lie. We solve this with sealed MPC bids (no single party can decrypt early) and an on-chain append-only event log that any third party can replay to arrive at the same winner.

**Problem 3 — Agent UX.** Agents are not humans. They cannot hold ETH for gas, manage nonces manually, or recover from a failed mid-auction transaction. We solve this with EIP-4337 Account Abstraction — agents get smart contract wallets, gas is sponsored by the auction paymaster, and agent-initiated multi-call actions inside one UserOperation are atomic; admin bookkeeping (`recordBond`) remains a separate transaction in MVP (retryable, idempotent on tx hash).

---

# 1. Network Layer — Why L2

All contracts deploy on **Base Sepolia** (OP Stack L2, chainId `84532`). The research report and CRE integration are standardized on this target.

**The core reason:** Groth16 ZK proof verification on Ethereum L1 costs approximately 280,000–350,000 gas. At 30 gwei with ETH at $3,000, that is $25–$30 per proof verification. An auction with 50 agents each submitting a membership proof + bid range proof = 100 proof verifications = $2,500–$3,000 in gas for one auction. This is completely unusable.

On Base Sepolia (OP Stack L2), Groth16 verification costs ~200K gas execution but at L2 gas prices (~$0.01-$0.05 per proof). This is the only reason we use L2. Everything else (escrow, registry, events) would also work on L1, just at prohibitive cost.

**L1 anchor (P1):** We do not abandon L1 entirely. The ERC-8004 registry root (a single bytes32 Merkle root) is periodically anchored to L1 for maximum security. Large escrow settlements (above a configurable threshold) bridge back to L1. The L2 calldata (which includes our event log) is available on L1 permanently and cheaply. The L1 anchor path — root publication schedule, threshold configuration, bridge contract design — is a P1 deliverable, not in MVP scope.

**Why Base Sepolia:** Base is an OP Stack L2 with mature tooling (Tenderly fork support, Pimlico/CDP bundlers for EIP-4337, x402 facilitator support). EIP-4337 EntryPoint v0.7 is deployed at the canonical address `0x0000000071727De22E5E9d8BAf0edAc6f37da032`. CRE workflows target Base Sepolia for settlement. For production: Base Mainnet. **MVP pins EntryPoint v0.7; v0.9 exists.** Migration trigger: if Base deprecates v0.7 bundler support or a critical vulnerability is disclosed. Compatibility test plan: deploy AgentAccount against v0.9 EntryPoint on a Tenderly fork, run full bond+join+settle flow, verify Paymaster staking API compatibility.

---

# 2. Contract Architecture — Full Map

```
L2 (Base Sepolia — chainId 84532)
│
├─── ACCOUNT ABSTRACTION LAYER (EIP-4337)
│    ├── EntryPoint.sol
│    ├── AgentAccountFactory.sol
│    ├── AgentAccount.sol
│    └── AgentPaymaster.sol
│
├─── IDENTITY & PRIVACY LAYER
│    ├── IdentityRegistry (official ERC-8004, external canonical deployment)
│    ├── AgentPrivacyRegistry.sol (optional sidecar commitments)
│    └── NullifierSet.sol
│
├─── ZK VERIFICATION LAYER
│    ├── BidCommitVerifier.sol
│    ├── RegistryMemberVerifier.sol
│    └── DepositRangeVerifier.sol (P1 optional, not in MVP validation path)
│
├─── AUCTION LOGIC LAYER
│    ├── AuctionFactory.sol
│    ├── AuctionRegistry.sol
│    ├── AuctionRoom.sol
│    └── SealedBidMPC.sol
│
├─── PAYMENT LAYER
│    ├── AuctionEscrow.sol      (MVP: bonds-only, ReceiverTemplate for CRE)
│    ├── EscrowMilestone.sol    (P1: replaces AuctionEscrow with milestones + slashing)
│    └── X402PaymentGate.sol
│
OFF-CHAIN (but cryptographically bound to on-chain state)
│
├─── ZK CIRCUITS (Circom 2.x)
│    ├── RegistryMembership.circom
│    ├── BidRange.circom
│    └── DepositRange.circom (P1 optional)
│
└─── MPC COMMITTEE (3-of-5 threshold)
     └── ElGamal threshold decryption
```

---

# 3. Account Abstraction Layer (EIP-4337)

## Why EIP-4337 Is Non-Negotiable for Agent Systems

EIP-4337 decouples the concept of "who is doing an action" from "who pays for gas." In a normal Ethereum transaction, the sender must hold ETH to pay gas. For agents, this creates an operational nightmare: every agent needs a funded EOA, key management becomes a security risk, and a failed mid-auction transaction (e.g., bid succeeds but deposit lock fails) leaves the system in a partial state with no clean recovery.

With EIP-4337, agents use smart contract wallets. Gas is paid by a Paymaster contract. Multiple actions are bundled into one atomic UserOperation. If anything fails, everything reverts — no partial state for actions inside the same UserOperation. Cross-transaction bookkeeping (e.g., `recordBond` called by platform backend after the agent's UserOp succeeds) can still fail independently and must be reconciled (retryable, idempotent on tx hash — see research report Limitation #4).

## EntryPoint.sol

**What it is:** The EIP-4337 standard singleton contract. One instance per chain. All UserOperations flow through it.

**What it does:** Receives a batch of UserOperations from a Bundler, calls `validateUserOp()` on each sender wallet, charges the appropriate Paymaster, and then executes the actual call. It enforces ordering, nonce management, and stake accounting.

**Deployment:** EntryPoint v0.7 uses deterministic CREATE2 and is deployed at the canonical address `0x0000000071727De22E5E9d8BAf0edAc6f37da032` on many EVM chains, including Base Sepolia. **Use the canonical deployment — do NOT deploy your own.** Always verify the EntryPoint deployment/address on your specific target chain (do not assume universal availability).

**Critical property:** EntryPoint is the only contract that can call `AgentAccount.execute()`. This means no external contract can trigger agent actions directly — everything goes through the UserOperation validation pipeline.

## AgentAccountFactory.sol

**What it is:** A factory that deploys `AgentAccount` smart wallets using CREATE2 (deterministic address derivation).

**What it does:** `createAccount(agentPubkey, salt)` deploys a new `AgentAccount` at a deterministic address. Because CREATE2 is deterministic, the agent knows its wallet address *before* the wallet is deployed — it can receive funds and be referenced in auction rooms before ever paying for deployment.

**Lazy deployment:** The wallet is only deployed when the agent sends its first UserOperation. The `initCode` field in the UserOp contains the factory call — EntryPoint calls the factory if the wallet doesn't exist yet. This means onboarding costs zero gas until the agent actually does something.

**Key detail:** `getAddress(agentPubkey, salt)` is a pure view function that returns the deterministic address without deploying. Agents call this during onboarding to know their identity address.

## AgentAccount.sol

**What it is:** The agent's smart contract wallet. Implements `IAccount` (EIP-4337 interface).

**Core function — `validateUserOp()`:** This is where the ZK proofs are verified. When an agent submits a bid UserOperation, `validateUserOp()` is called by EntryPoint before execution. Inside this function:

- For a `join` UserOp: calls `RegistryMemberVerifier.verify(zkMembershipProof)` — confirms this agent is a valid ERC-8004 member without revealing which agent
- For a `bid` UserOp: calls `BidCommitVerifier.verify(zkRangeProof)` — confirms the bid is within the valid range without revealing the bid amount
- Verifies the EIP-712 signature on the typed action struct
- Returns `SIG_VALIDATION_SUCCESS` or reverts

**Why ZK verification happens here, not in the auction contract:** Because `validateUserOp()` is called before execution, an invalid proof causes the entire UserOp to be rejected before it ever hits the mempool in a way that costs meaningful gas. The Bundler simulates validation off-chain first. Invalid proofs are caught early, cheaply, without cluttering on-chain state.

**`execute()` function:** After validation, EntryPoint calls `execute(address target, uint256 value, bytes calldata data)`. This is what actually calls on-chain actions from the agent wallet, such as `USDC.transfer()` (bond deposits) and other wallet-managed operations (approvals, withdrawals). **MVP architecture note:** join/bid are submitted to the Durable Object sequencer over HTTP/MCP and later ingested on-chain via `ingestEventBatch()`; they are not direct `AuctionRoom.join()` calls from agent UserOps. **Note:** `AuctionEscrow.recordBond()` is NOT called by agent wallets — it has an `onlyAdmin` modifier and is called by the platform backend after detecting successful USDC transfers on-chain.

**Nonce management:** AgentAccount tracks its own nonce (used in all EIP-712 structs). This prevents replay attacks — a bid signed for auction A cannot be replayed in auction B.

## AgentPaymaster.sol

**What it is:** Implements `IPaymaster` (EIP-4337). Sponsors gas on behalf of registered agents.

**`validatePaymasterUserOp()`:** Called by EntryPoint before execution. Checks that the agent has sufficient locked deposit in AuctionEscrow (MVP) / EscrowMilestone (P1) for the target auction. If yes, agrees to sponsor gas. If no, rejects — agent cannot act in this auction without a deposit. This is the anti-spam gate: no ETH in wallet required, but deposit in escrow required.

**`postOp()`:** Called by EntryPoint after execution. **MVP: logs gas cost for analytics only** (no actual escrow deduction — simplifies implementation). **P1: records gas cost against the agent's escrow balance.** Gas debt accumulates during the auction and is deducted at settlement. This means agents never pay gas during the auction — they pay at the end, from their winnings or from their deposit if they lose.

**Paymaster stake:** AgentPaymaster deposits ETH stake into EntryPoint. This stake is slashed if the Paymaster misbehaves (e.g., validates a UserOp but then the execution fails due to Paymaster's fault). The stake is what gives EntryPoint confidence to trust the Paymaster's `validatePaymasterUserOp()` result.

---

# 4. Identity & Privacy Layer

## IdentityRegistry (official ERC-8004) + AgentPrivacyRegistry.sol

**Source-of-truth rule (critical):** settlement and refund authorization always read the official ERC-8004 `IdentityRegistry` (`ownerOf`, `getAgentWallet`, `setAgentWallet`). This avoids custom-ABI drift and keeps CRE checks aligned with published standard contracts.

**What AgentPrivacyRegistry is:** a sidecar contract keyed by official `agentId` that stores privacy commitments used by ZK circuits. It is **not** the identity authority and is never used to authorize settlement directly.

**The sidecar commitment model:**

```
On-chain sidecar storage per agentId:
  registrationCommit = keccak256(agentSecret, capabilityMerkleRoot, salt)
  registeredAt = block.timestamp
  controller = msg.sender (can update the commitment)
  nullifierRoot = Merkle root of spent nullifiers for this agent
```

**What `agentSecret` is:** a 256-bit random value generated locally by the agent. It never leaves secure storage. This secret anchors zero-knowledge capability proofs without exposing capability details on-chain.

**Capability Merkle tree:** each leaf is `Poseidon(capabilityId, agentSecret, leafIndex)`. The contract stores only `capabilityMerkleRoot`; the agent keeps the witness path.

**Why Poseidon (not keccak) inside circuits:** Poseidon is ZK-friendly (~240 constraints/hash) while keccak in circuits is prohibitively expensive (~90,000 constraints/hash).

**Controller separation:** rotating `registrationCommit` rotates privacy commitments without changing official ERC-8004 identity ownership.

## NullifierSet.sol

**What it is:** A mapping of spent nullifiers. Prevents double-spending, double-joining, and double-bidding with the same ZK identity.

**How nullifiers work:** A nullifier is a value derived deterministically from the agent's secret and a specific context (e.g., the auctionId). `nullifier = Poseidon(agentSecret, auctionId, action_type)`. Because it is deterministic, the same agent trying to join the same auction twice will produce the same nullifier — and the contract will reject the second attempt. But because nullifiers are one-way derivations, an observer cannot link two nullifiers from different auctions to the same agent.

**What is stored:** `mapping(bytes32 => bool) public nullifiers`. When a nullifier is spent (join, bid, deliver), it is permanently set to true. There is no un-spending a nullifier.

**Separate nullifiers per action type:** A join nullifier and a bid nullifier are different values (different `action_type` input to Poseidon). This allows the same agent to join an auction and bid in it without collision, while preventing joining twice or bidding twice.

**⚠ Nullifiers MUST use permanent storage (SSTORE), NOT transient storage (EIP-1153).** Nullifiers are anti-double-spend markers — they must persist across transactions. TSTORE values are erased after each transaction, which would allow an agent to reuse a nullifier in a subsequent tx. The only EIP-1153 optimization relevant to nullifiers is the check-then-set *staging* pattern within a single UserOp (TLOAD to check, SSTORE to persist at the end), which saves negligible gas.

---

# 5. ZK Verification Layer

**EIP-1153 availability confirmed:** Transient storage (TSTORE/TLOAD) is available on Base Sepolia and Base Mainnet since the Ecotone upgrade (Feb 21, 2024 testnet, Mar 14, 2024 mainnet). Uniswap V4 uses transient storage in production on Base. Requires Solidity ≥0.8.24 with `evm_version = "cancun"`.

**⚠ Toolchain note:** Solidity's native `transient` keyword has had regressions in some compiler versions. If you adopt EIP-1153, pin a known-good compiler and prefer assembly TSTORE/TLOAD unless you've verified the exact Solidity version against current release notes.

## BidCommitVerifier.sol

**What it is:** An on-chain Groth16 proof verifier for the BidRange circuit. Deployed once, called by `AgentAccount.validateUserOp()` for every bid UserOperation.

**What it verifies:** That the submitted bid commitment `bidCommitment = Poseidon(bid, salt)` corresponds to a bid value `bid` that satisfies `reservePrice ≤ bid ≤ maxBudget`, without knowing what `bid` actually is.

**Groth16 verification on-chain:** Groth16 is the most gas-efficient ZK proof system for on-chain verification. Verification requires three elliptic curve pairing operations. The verifier contract is generated from the circuit's verification key (produced during trusted setup). The verification key is compiled into the contract's bytecode — it never changes after deployment.

**⚠ Clarification on EIP-1153 and Groth16:** Groth16 verification does NOT benefit from EIP-1153 transient storage. The snarkjs-generated verifier contract passes proof points (A, B, C) and verification key elements to the `ecPairing` precompile (address 0x08) via memory (`staticcall`), not via storage. The `ecPairing` precompile itself costs ~181,000 gas (fixed) + ~6,150 gas per input pair. These costs are intrinsic to the precompile and cannot be reduced by EIP-1153. Total Groth16 verification remains ~200,000 gas regardless of transient storage.

EIP-1153 is not required for the event batch ingestion pattern in AuctionRoom: a loop-local cursor in memory plus a single final SSTORE to persist `chainHead` already avoids unbounded storage writes. EIP-1153 is still useful elsewhere (e.g., transient reentrancy locks or cross-function scratch space within a transaction).

**The trusted setup:** Groth16 requires a one-time trusted setup ceremony that produces proving keys (used by agents to generate proofs) and verification keys (compiled into the verifier contract). For the hackathon, use the Hermez Powers of Tau ceremony (ptau file) which is already public. The circuit-specific setup (phase 2) must be run by the team. Anyone who participated in phase 2 could theoretically generate fake proofs — mitigate this with a multi-party phase 2 ceremony (at least 3 contributors).

## RegistryMemberVerifier.sol

**What it is:** Same architecture as BidCommitVerifier but for the RegistryMembership circuit. Verifies that an agent is in the ERC-8004 registry and has a specific capability, without revealing which agent.

**What it verifies:** That there exists a path in the capability Merkle tree from the agent's committed root to the specific capability leaf, and that the agent knows the agentSecret corresponding to the registered commitment.

**Public inputs after verification:**

- `registryRoot`: must match `AgentPrivacyRegistry.getRoot()` (proves the agent commitment is in the current privacy tree)
- `capabilityCommitment`: proves the agent has the required capability
- `nullifier`: the unique spend marker for this join action

**Why the registry root matters:** The circuit takes the current registry root as a public input. This means a proof generated against an old registry root is invalid — the agent must regenerate its proof whenever the registry is updated. This prevents "cached" proofs from stale registrations from being replayed.

## DepositRangeVerifier.sol

**What it is (P1 optional):** Groth16 verifier for the DepositRange circuit. Proves "my escrow balance ≥ required deposit" without revealing the actual balance.

**MVP policy:** this verifier is NOT used in `AgentAccount.validateUserOp()` gating. MVP admission uses explicit on-chain checks (`recordBond`, paymaster policy) for correctness and solvency.

**What it verifies:** That the submitted `balanceCommitment = Poseidon(balance, salt)` corresponds to a balance ≥ `requiredDeposit`, without revealing the actual balance.

**Public inputs after verification:**
- `balanceCommitment`: Poseidon commitment to the agent's balance
- `requiredDeposit`: minimum deposit amount (from auction manifest)
- `depositOk`: 1 if balance ≥ requiredDeposit
- `blockHash`: L2 block hash at proof generation time (freshness check)

**Balance freshness via blockHash:** The circuit includes `blockHash` as a public input. On-chain, the verifier checks `blockhash(blockNumber) == blockHash` to ensure the proof was generated against a recent state (within 256 blocks / ~8 minutes on Base). This prevents replay of proofs generated against stale balances (e.g., after a withdrawal).

```solidity
// Generated by snarkjs — same architecture as BidCommitVerifier
contract DepositRangeVerifier {
    // Verification key baked into bytecode at deploy time
    // Public inputs: [balanceCommitment, requiredDeposit, depositOk, blockHash]

    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[4] calldata _pubSignals  // [balanceCommitment, requiredDeposit, depositOk, blockHash]
    ) public view returns (bool) {
        // Groth16 pairing check (auto-generated by snarkjs)
        // ecPairing precompile ~181K gas + 6.15K per public input
    }
}
```

---

# 6. ZK Circuits (Circom 2.x)

## RegistryMembership.circom

**Purpose:** Prove "I am a registered ERC-8004 agent with capability C" without revealing which agent.

**Private inputs (never leave the agent's machine):**

```
agentSecret      : 256-bit random value generated at registration
capabilityPath[] : Merkle sibling nodes from leaf to root (20 elements for 2^20 registry)
salt             : per-proof randomness (prevents proof reuse)
```

**Public inputs (safe to broadcast):**

```
registryRoot          : current root of ERC-8004 registry Merkle tree
capabilityCommitment  : Poseidon(capabilityId, agentSecret) — proves capability without ID
nullifier             : Poseidon(agentSecret, auctionId, JOIN) — unique per auction join
```

**Circuit logic:**

1. Recompute `leafHash = Poseidon(capabilityId, agentSecret, leafIndex)` from private inputs
2. Walk the Merkle path using `capabilityPath[]` siblings, computing Poseidon at each level
3. Assert: computed root equals public `registryRoot`
4. Assert: `capabilityCommitment == Poseidon(capabilityId, agentSecret)`
5. Assert: `nullifier == Poseidon(agentSecret, auctionId, JOIN)`

**Constraint count:** ~12,000 constraints (20-level Poseidon Merkle tree). Proving time ~400ms on modern hardware with snarkjs, ~50ms with rapidsnark.

## BidRange.circom

**Purpose:** Prove "my hidden bid is within the valid range [reservePrice, maxBudget]" without revealing the bid.

**Private inputs:**

```
bid    : actual bid amount (uint256)
salt   : per-proof randomness
```

**Public inputs:**

```
bidCommitment : Poseidon(bid, salt) — binding commitment to the bid
reservePrice  : minimum valid bid (from auction manifest, public)
maxBudget     : maximum valid bid (agent's self-declared upper limit, can be public or private)
rangeOk       : 1 if reservePrice ≤ bid ≤ maxBudget, else circuit fails
```

**Circuit logic:**

1. Assert: `bidCommitment == Poseidon(bid, salt)`
2. Range check: `bid - reservePrice >= 0` (uses binary decomposition — Circom has no native range check, decompose into 64-bit limbs)
3. Range check: `maxBudget - bid >= 0` (same technique)
4. Output: `rangeOk = 1` (if we reach this point, range is satisfied)

**Why submit both commitment and proof at bid time:** The commitment binds the agent to a specific bid. The proof confirms the commitment is to a valid bid. Without the proof, a commitment could hide an invalid bid — wasting the reveal phase. Verifying the range proof at commit time means no invalid bids ever enter the system.

## DepositRange.circom

**Purpose:** Prove "my balance is ≥ required deposit" without revealing the actual balance.

**Private inputs:**

```
balance : agent's actual balance in escrow/wallet
salt    : per-proof randomness
```

**Public inputs:**

```
balanceCommitment : Poseidon(balance, salt)
requiredDeposit   : minimum deposit amount (from auction manifest, public)
depositOk         : 1 if balance ≥ requiredDeposit
```

**Where this is used (P1):** optional privacy enhancement path. Enable only after balance commitments are cryptographically bound to an on-chain source.

**Note on balance freshness and binding:** `blockHash` freshness alone is insufficient. Before production enablement, `balanceCommitment` must be linked to a contract-maintained on-chain commitment/root; otherwise the proof remains advisory and cannot enforce admission safely.

---

# 7. Auction Logic Layer

## AuctionFactory.sol

**What it is:** Deploys individual AuctionRoom instances from a template. Acts as the on-chain registry of all auctions.

**`createAuction(AuctionManifest calldata manifest)` :**

- Takes a manifest struct: `{ auctionId, taskDescriptionHash, requiredCapability, reservePrice, depositAmount, commitDeadline, revealDeadline, deliveryDeadline }` (on-chain stores `taskDescriptionHash` (bytes32) instead of full description for gas efficiency; `deliveryFormat` and `scoringWeights` are P1 extensions)
- Deploys a new `AuctionRoom` using CREATE2 with `auctionId` as salt
- Registers the auction in `auctions` mapping
- Emits `AuctionCreated(auctionId, roomAddress, manifestHash)` — this event is what agents subscribe to for discovery

**`DOMAIN_SEPARATOR`:** AuctionFactory holds the EIP-712 domain separator:

```
Domain = {
  name:              "AgentAuction",
  version:           "1",
  chainId:           <L2 chainId>,
  verifyingContract: AuctionFactory.address
}
```

All auction speech act structs (Bid, Join, Deliver, Dispute, Withdraw) use this domain. Agents fetch the domain separator during onboarding and verify it before signing anything. A mismatched domain separator is a phishing/replay attack vector.

**⚠ Two-domain design:** `AuctionRegistry` uses a SEPARATE EIP-712 domain for wallet rotation recovery: `EIP712("AuctionRegistry", "1", chainId, AuctionRegistry.address)`. This is intentional — `verifyingContract` must match the contract that verifies the signature. Agents MUST use the correct domain for each operation:
- **Auction actions** (bid, join, deliver, dispute, withdraw): sign with `AuctionFactory` domain (`"AgentAuction"`)
- **Wallet rotation** (`updateWinnerWallet`): sign with `AuctionRegistry` domain (`"AuctionRegistry"`)

Agent SDKs must expose both domains and select automatically based on the target contract. Signing a WalletUpdate with the AuctionFactory domain will ALWAYS fail `ecrecover`.

**Manifest hash commitment:** `manifestHash = keccak256(abi.encode(manifest))` is stored on-chain. Agents verify the manifest they fetched off-chain matches this hash before participating. This prevents manifest tampering after auction creation.

## AuctionRoom.sol

**What it is:** The per-auction state machine. One instance per auction.

**State machine (off-chain, per-room phases):**

```
OPEN
  ↓  (commitDeadline passes, or host closes early)
COMMIT
  ↓  (all agents submit encrypted bids + ZK range proofs)
REVEAL  (for non-sealed auctions) / MPC_CLOSE (for sealed)
  ↓  (revealDeadline passes / MPC committee submits threshold decryption)
CLOSED
  ↓  (winner delivers, escrow released or slashed)
SETTLED
```

**⚠ Two state machines — intentional separation of concerns:**

AuctionRoom has 6 off-chain phases (above) for fine-grained auction mechanics. AuctionRegistry has 5 on-chain states for settlement/escrow: `{ NONE, OPEN, CLOSED, SETTLED, CANCELLED }`. The mapping:

| AuctionRoom Phase | AuctionRegistry State | Transition Trigger |
| --- | --- | --- |
| OPEN, COMMIT, REVEAL, MPC_CLOSE | OPEN | (auction is running on-chain) |
| CLOSED | CLOSED | `recordResult()` by sequencer |
| SETTLED | SETTLED | `markSettled()` by escrow after CRE |
| (any, if expired/cancelled) | CANCELLED | `cancelExpiredAuction()` after 72h timeout |

**Source of truth:** AuctionRegistry is the on-chain authority for settlement and escrow interactions. AuctionRoom phases are off-chain Durable Object states for real-time auction mechanics. CRE reads from AuctionRegistry (on-chain), never from AuctionRoom (off-chain).

**Reorg policy for anchor writes:** Mid-auction `anchorHash` calls use `SAFE` confidence (non-financial). If an anchor tx is reorged, the DO re-submits with the same deterministic hash (3 retries, 15s interval). Failed re-anchoring triggers `ANCHOR_REORG_FAILED` alert but does not halt the auction — CRE settlement verifies anchors at `FINALIZED` confidence. Fewer intermediate anchors = weaker mid-auction integrity, but settlement-time verification remains sound. See research report Workflow 1 for full reorg handling.

**Event log with Poseidon hash chain:** Every state-changing action is appended to the event log:

```solidity
struct Event {
  uint64  seq;
  bytes32 prevHash;      // Poseidon(previous event)
  bytes   payload;       // ABI-encoded action data
  bytes32 hash;          // Poseidon(seq, prevHash, payload)
  bytes   agentSig;      // EIP-712 signature from acting agent
}
bytes32 public chainHead; // latest event hash
```

Any third party can pull all events from L2 calldata, replay the Poseidon chain, and verify `chainHead` matches the contract's stored value. This is a prerequisite for independent rule replay and auditability.

**Event batch ingestion (no transient storage required):**

```solidity
function ingestEventBatch(Event[] calldata events) external onlySequencer {
  bytes32 cursor = chainHead; // one cold SLOAD
  for (uint i = 0; i < events.length; i++) {
    require(events[i].prevHash == cursor, "chain broken");
    cursor = events[i].hash;
    // cursor stays in memory; no per-iteration storage writes.
  }
  chainHead = cursor; // one cold SSTORE at the end
}
```

**Tiebreaker randomness (no oracle needed):** When bids are equal, winner is selected using `prevrandao` (EIP-4399, available post-Merge natively):

```
Block N:   r1 = block.prevrandao   (recorded at close)
Block N+1: r2 = block.prevrandao   (recorded one block later)
seed = keccak256(r1, r2, auctionId)
winner = tiedBidders[seed % tiedBidders.length]
```

Two-block commit prevents last-block validator manipulation of the outcome. No Chainlink VRF needed.

## SealedBidMPC.sol

**What it is:** Manages ElGamal-encrypted bids for the sealed-bid auction phase. Works with the off-chain MPC committee for threshold decryption.

**The problem with naive commit-reveal:** Even after hiding the bid value, an agent can observe gas patterns at reveal time to infer bid values. More critically, a malicious agent can withhold its reveal to prevent the auction from closing (griefing). The ZK range proof at commit time solves griefing (invalid bids rejected before reveal), but gas pattern inference requires encryption.

**ElGamal encryption:** Each agent encrypts its bid to the MPC committee's distributed public key:

```
// mpcPubKey is the committee's joint public key from DKG
ciphertext = ElGamal.encrypt(bid_amount, mpcPubKey, random_r)
           = (r * G, bid_amount * G + r * mpcPubKey)
// This is additively homomorphic — useful for scoring functions
```

The committee's private key is split 3-of-5 using Shamir secret sharing. No single node has the full key. Decryption requires cooperation of at least 3 of 5 committee members.

**`submitEncryptedBid(auctionId, ciphertext, bidCommitment, zkRangeProof)`:**

- Verifies zkRangeProof via BidCommitVerifier (invalid bids rejected immediately)
- Stores ciphertext and bidCommitment
- Emits event to off-chain MPC committee

**`finalizeSealed(decryptedResults[], thresholdSig)`:** At auction close:

- Committee decrypts all bids off-chain and produces a FROST threshold signature over the results
- This function verifies the FROST threshold signature against the stored committee pubkey
- Sets the winner and emits `AuctionClosed(auctionId, winnerAddress, winningBid)`
- Losing bids' ciphertexts remain on-chain but are never decrypted — losing agents' bid values are permanently hidden

**MPC committee setup (one-time per auction series):**

1. 5 committee nodes run a Distributed Key Generation (DKG) protocol
2. Each node gets a key share; no node knows the full key
3. Joint public key `mpcPubKey` is published to `SealedBidMPC.setCommitteeKey()`
4. At close: each node partially decrypts, shares partial decryptions, computes FROST signature
5. Any one node submits the result + signature to `finalizeSealed()`

---

# 8. Payment Layer

## AuctionEscrow.sol (MVP — bonds only)

**What it is:** The MVP escrow contract. Inherits CRE's `ReceiverTemplate` for secure `onReport` settlement. Handles USDC bond deposits, CRE-verified settlement, and pull-based refunds. No milestone payouts, no buyer prize pool, no slashing. See the research report for full `AuctionEscrow.sol` code.

**ReceiverTemplate integration (verified against smartcontractkit repos, Feb 2026):** `ReceiverTemplate` constructor takes a single parameter — `address _forwarderAddress` (the KeystoneForwarder) — and inherits `Ownable(msg.sender)`. Expected author, workflow name, and workflow ID are configured **POST-DEPLOY** via `onlyOwner` setters: `setExpectedAuthor(address)`, `setExpectedWorkflowName(string calldata)` (takes plaintext string, internally hashes to bytes10), `setExpectedWorkflowId(bytes32)`, `setForwarderAddress(address)`. Setting any expected value to zero disables that validation check. The `onReport()` function (inherited) verifies incoming reports match these configured values before calling `_processReport()`. **⚠ Security:** The Ownable owner can reconfigure which workflow the escrow accepts. For production (P1): transfer ownership to a timelocked multisig after initial configuration. **Metadata byte layout (64 bytes, 4 fields):** `workflowId(bytes32, 0-31) + workflowName(bytes10, 32-41) + workflowOwner(address, 42-61) + reportName(bytes2, 62-63)`. **ReceiverTemplate._decodeMetadata() only decodes the first 3 fields** (workflowId, workflowName, workflowOwner) — `reportName` is present in the bytes but ignored by the template's validation. If your `_processReport` needs `reportName`, extract it manually from `metadata[62:64]`. Layout is defined by KeystoneForwarder constants (`METADATA_LENGTH=109`, `FORWARDER_METADATA_LENGTH=45`); pin to the deployed forwarder version. See research report for canonical test vector.

**Key functions:** `recordBond(auctionId, agentId, depositor, amount, x402TxId)`, `_processReport(report)` (CRE settlement — called by inherited `onReport(metadata, report)` after metadata validation; returns winner bond; losers use `claimRefund` pull path), `claimRefund(auctionId, agentId)`, `withdraw()`. Solvency invariant: `usdc.balanceOf(this) >= totalBonded + totalWithdrawable`.

---

## EscrowMilestone.sol (P1 — replaces AuctionEscrow)

**What it is:** The P1 replacement for AuctionEscrow. Adds milestone-based delivery, buyer prize pool, and slashing. Inherits all AuctionEscrow functionality and extends it.

**Deposit lifecycle:**

```
LOCKED     : agent joins auction, deposit locked as anti-spam bond
ACTIVE     : agent wins auction, deposit becomes performance bond
MILESTONE  : partial delivery verified, partial release
RELEASED   : full delivery verified, full release minus gas debt
SLASHED    : delivery fails or dispute resolved against agent
REFUNDED   : agent loses auction, deposit returned minus gas debt
```

**Milestone release logic:**

- Auction manifest defines milestones: `{ milestoneId, description, paymentBps, verificationMethod }`
- `verificationMethod` is either `HASH_MATCH` (submitter provides hash of output, matches spec) or `SCRIPT_HASH` (hash of a verification script that any party can run)
- `submitDelivery(auctionId, milestoneId, deliveryHash, executionLogHash)`: agent submits delivery
- If `verificationMethod == HASH_MATCH`: immediate release if hashes match
- If `verificationMethod == SCRIPT_HASH`: 24-hour challenge window; if no dispute, auto-release

**Slashing mechanics:**

- `slash(auctionId, agentAddress, evidenceHash)`: called by dispute resolution
- Slashed amount goes to a `disputePool` — distributed to successful dispute challengers
- Partial slashing is supported (e.g., 50% slash for late delivery, 100% for fraudulent delivery)

**Paymaster accounting integration:**

- `recordGasDebt(auctionId, agentAddress, gasUsed)`: called by AgentPaymaster.postOp()
- Gas debt accumulates during auction participation
- At RELEASED or REFUNDED: `netPayout = depositAmount - gasDebt - platformFee`
- `platformFee` is configurable by AuctionFactory owner (set to 0 for hackathon demo)

## X402PaymentGate.sol (+ off-chain x402 middleware)

**What x402 is:** x402 is an HTTP-layer micropayment protocol. When a client makes an HTTP request to a resource, the server can respond with HTTP 402 Payment Required, including payment details in response headers. The client pays on-chain, includes a payment receipt in the retry request, and the server fulfills. It is designed for machine-to-machine payments — exactly what agents do.

**Why keep x402 alongside EIP-4337 escrow:** The two systems operate at different levels and serve different purposes. EIP-4337 escrow handles the auction's main financial flows (deposits, milestone payments, settlements) — these are high-value, structured, on-chain operations. x402 handles the access economy around auctions — paying to access the auction room's HTTP API, paying for premium discovery data, paying for manifest fetching, paying per-query for the event log. These are low-value, high-frequency, HTTP-native operations that don't need the overhead of a full UserOperation.

**x402 flow for auction room access:**

```
x402 V2 Transport Headers (all base64-encoded JSON, uppercase, no X- prefix):
  PAYMENT-REQUIRED  — server → client (PaymentRequired schema)
  PAYMENT-SIGNATURE — client → server (PaymentPayload schema)
  PAYMENT-RESPONSE  — server → client (SettlementResponse schema)

1. Agent → GET /auction/{auctionId}/manifest

2. Server ← HTTP 402
   Headers:
     PAYMENT-REQUIRED: base64({
       "x402Version": 2,
       "resource": {
         "url": "https://api.auction.example/auction/{auctionId}/manifest",
         "description": "Auction manifest access fee",
         "mimeType": "application/json"
       },
       "accepts": [{
         "scheme": "exact",
         "network": "eip155:84532",
         "amount": "1000",                   // 0.001 USDC (6 decimals, atomic units)
         "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  // USDC on Base Sepolia
         "payTo": "0x...",                    // AuctionFactory.treasury
         "maxTimeoutSeconds": 60,
         "extra": { "assetTransferMethod": "eip3009", "name": "USDC", "version": "2" }
       }]
     })

3. Agent signs EIP-3009 transferWithAuthorization (or Permit2 if token requires)
   (or uses EIP-4337 UserOp to batch payment + request atomically)

4. Agent → GET /auction/{auctionId}/manifest
   Headers:
     PAYMENT-SIGNATURE: base64({
       "x402Version": 2,
       "resource": { "url": "https://api.auction.example/auction/{auctionId}/manifest" },
       "accepted": {                          // the PaymentRequirements the client chose
         "scheme": "exact",
         "network": "eip155:84532",
         "amount": "1000",
         "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
         "payTo": "0x...",
         "maxTimeoutSeconds": 60,
         "extra": { "assetTransferMethod": "eip3009", "name": "USDC", "version": "2" }
       },
       "payload": {
         "signature": "0x...",                // EIP-3009 auth signature
         "authorization": { "from": ..., "to": ..., "value": "1000", "validAfter": ..., "validBefore": ..., "nonce": ... }
       }
     })

5. Server → Facilitator /settle (or self-settles)
6. Server ← HTTP 200 + manifest data
   Headers:
     PAYMENT-RESPONSE: base64({
       "success": true,
       "transaction": "0x..."                 // on-chain tx hash
     })
```

**X402PaymentGate.sol — what it does on-chain:**

- Verifies payment receipts submitted by agents
- `verifyReceipt(bytes32 txHash, address payer, uint256 expectedAmount)`: returns true if the tx at txHash transferred `expectedAmount` from `payer` to the treasury
- Receipts are stored as spent (like nullifiers) to prevent replay of the same payment receipt
- Off-chain middleware checks this contract before serving the resource

**Where x402 applies in the auction flow:**

| HTTP Endpoint | x402 Fee | Why |
| --- | --- | --- |
| `GET /manifest` | 0.001 USDC | Anti-spam for manifest fetching (prevent registry scraping) |
| `GET /events?from=0` | 0.0001 USDC/call | Rate-limits event log polling (incentivizes WS subscription) |
| `GET /auctions` (discovery) | 0 (free) | Discovery should be free to maximize participation |

**Bond deposit path (not x402 for EIP-4337 agents):** EIP-4337 agents use direct USDC transfer + join in one UserOperation:

```
UserOp.callData = AgentAccount.executeBatch([
  { target: USDC, data: transfer(escrowAddress, bondAmount) }, // direct escrow deposit
  { target: AuctionRoom, data: join(auctionId, zkProof) }    // auction join
])
```

This atomicity means: if join fails (invalid proof), the bond transfer also reverts.

**EOA fallback path:** non-4337 agents can use x402 with `payTo = escrowAddress`; backend then records bond attribution via `recordBond(...)` (idempotent on tx hash).

**Receipt as reputation evidence:** x402 receipts (txHashes of payments) are permanent on-chain records. An agent that consistently pays API/manifest/event access fees and completes auctions has a verifiable payment history. This can feed reputation features in phase ② without extra trust assumptions.

---

# 9. EIP-712 TypedData — All Speech Acts

Every action an agent takes in an auction is an EIP-712 typed data struct. This gives us: human-readable signing (agents know what they're signing), domain separation (bid for auction A cannot be replayed in auction B), and on-chain verifiability (`ecrecover()` in AgentAccount).

**Domain (fetched from AuctionFactory, verified at session init):**

```solidity
struct EIP712Domain {
  string  name;              // "AgentAuction"
  string  version;           // "1"
  uint256 chainId;           // L2 chain ID
  address verifyingContract; // AuctionFactory.address
}
```

**All typed structs:**

```solidity
struct Join {
  bytes32 auctionId;
  bytes32 nullifier;          // Poseidon(agentSecret, auctionId, JOIN)
  uint256 depositAmount;
  uint256 nonce;              // from AgentAccount.getNonce()
  uint256 deadline;           // unix timestamp, tx reverts if past
}

struct Bid {
  bytes32 auctionId;
  bytes32 bidCommitment;      // Poseidon(bid, salt) — bid is hidden
  bytes32 encryptedBidHash;   // keccak256(ElGamal ciphertext)
  bytes32 zkRangeProofHash;   // keccak256(Groth16 proof bytes)
  uint256 nonce;
  uint256 deadline;
}

struct Reveal {               // only for non-sealed / commit-reveal auctions
  bytes32 auctionId;
  uint256 bid;                // actual bid amount
  bytes32 salt;               // reveals the commitment
  uint256 nonce;
}

struct Deliver {
  bytes32 auctionId;
  uint256 milestoneId;
  bytes32 deliveryHash;       // keccak256(output bytes)
  bytes32 executionLogHash;   // keccak256(execution log from ERC-6551 if used)
  uint256 nonce;
  uint256 deadline;
}

struct Dispute {
  bytes32 auctionId;
  bytes32 evidencePackageHash; // must contain: delivery hash, logs, test results, timestamps
  address respondent;
  uint256 nonce;
}

struct Withdraw {
  bytes32 auctionId;
  string  reason;              // logged on-chain for transparency
  uint256 nonce;
  uint256 deadline;
}
```

**Signing in practice:** Agent generates the typed data hash using EIP-712 encoding, signs with its runtime key, and includes the signature in the UserOperation's `signature` field. `AgentAccount.validateUserOp()` reconstructs the hash from the calldata and verifies via `ecrecover()`. The nonce in each struct must match `AgentAccount.getNonce()` — incremented after each successful UserOp.

---

# 10. Contract Deployment Order

Order matters. Dependencies must be deployed before dependents.

```
Step 1:  Verify EntryPoint.sol at canonical address
         (0x0000000071727De22E5E9d8BAf0edAc6f37da032 — already deployed on Base Sepolia via CREATE2)
         ACTION: verify bytecode exists via eth_getCode; do NOT redeploy

Step 2:  NullifierSet.sol
         (no dependencies, needed by verifiers and registry)

Step 3:  AgentPrivacyRegistry.sol
         (depends: NullifierSet)

         NOTE: official ERC-8004 IdentityRegistry/ReputationRegistry are external
               canonical deployments; integrate by pinned addresses/ABI, do not fork for MVP

Step 4:  BidCommitVerifier.sol
         (no dependencies, pure verifier — verification key baked in at deploy)

Step 5:  RegistryMemberVerifier.sol
         (depends: AgentPrivacyRegistry — needs to check current registryRoot)

Step 6:  DepositRangeVerifier.sol
         (P1 optional, pure Groth16 verifier — verification key baked in at deploy)

Step 7:  AgentAccount.sol (implementation, not proxy)
         (depends: RegistryMemberVerifier, BidCommitVerifier; DepositRangeVerifier is P1 optional)

Step 8:  AgentAccountFactory.sol
         (depends: EntryPoint, AgentAccount implementation)

Step 9:  AgentPaymaster.sol
         (depends: EntryPoint)
         ACTION: stake ETH in EntryPoint after deploy

Step 10: AuctionRegistry.sol
         (depends: nothing at deploy — receives sequencer/escrow roles post-deploy)
         ACTION: grant SEQUENCER_ROLE and ESCROW_ROLE after AuctionEscrow deploy

Step 11: AuctionEscrow.sol (MVP) / EscrowMilestone.sol (P1)
         (depends: AgentPaymaster, AuctionRegistry, ReceiverTemplate)
         NOTE: ReceiverTemplate constructor takes (forwarderAddress) only. Inherits Ownable(msg.sender).
         ACTION: after deploy, call setExpectedAuthor(workflowDeployerAddress),
                 setExpectedWorkflowName("auctSettle"), setExpectedWorkflowId(workflowIdBytes32).
                 For production: transfer ownership to timelocked multisig after configuration.

Step 12: X402PaymentGate.sol
         (depends: nothing — standalone receipt verifier)

Step 13: SealedBidMPC.sol
         (depends: BidCommitVerifier — verifies range proofs at bid submission)
         ACTION: set MPC committee public key after DKG ceremony

Step 14: AuctionRoom.sol (implementation template)
         (depends: BidCommitVerifier, RegistryMemberVerifier, SealedBidMPC, AuctionEscrow)
         NOTE: ingestEventBatch requires onlySequencer — set sequencer address post-deploy

Step 15: AuctionFactory.sol
         (depends: all of the above)
         ACTION: this is the single entry point for all agents — publish this address
```

**Verification key deployment note:** Steps 4, 5, and 6 require Groth16 verification keys. These are produced by the trusted setup ceremony (Circom → snarkjs setup → export verification key → generate verifier Solidity). Run the trusted setup on the final compiled circuits before these deployment steps. Any circuit change requires redeploying the affected verifier(s) and re-running the trusted setup.

---

# 11. Gas Analysis — Why This Works

| Operation | Without EIP-1153 | With EIP-1153 | Saving | Notes |
| --- | --- | --- | --- | --- |
| Groth16 verification | ~200,000 gas | ~200,000 gas | 0% | ecPairing precompile uses memory, not storage. ~181K fixed + 6.15K/pair. EIP-1153 irrelevant. |
| Event batch ingestion (20 events) | ~26,000 gas | ~26,000 gas | 0% | Current design validates the chain in memory and persists only the final `chainHead` (1 SSTORE). EIP-1153 is not required. |
| Nullifier check + set | ~22,100 gas | ~22,100 gas | 0% | Nullifiers MUST use permanent SSTORE (anti-double-spend). TSTORE would erase after tx. |
| Full join UserOp (proof + nullifier + deposit lock) | ~250,000 gas | ~250,000 gas | ~0% | Dominated by Groth16 (~200K) + nullifier SSTORE (~22K) + deposit lock (~25K). EIP-1153 only helps if event batch is included. |

**On Base Sepolia (OP Stack L2), gas costs are significantly reduced** compared to L1 equivalent pricing. A full join UserOp costs approximately ~250K gas = $0.03–$0.10 at typical L2 gas prices. An entire auction (50 agents each joining + bidding = ~100 UserOps × ~250K gas each) runs to approximately $3–$10 total gas cost — viable for the target use case.

**Paymaster sponsorship accounting:** All gas debt is deferred to settlement. During the auction, agents pay zero gas from their own wallets. At settlement:

- Winner: gas debt deducted from winnings. If winnings >> gas, net positive.
- Losers: gas debt deducted from returned deposit. Deposits must cover maximum expected gas usage.
- Auction manifest specifies `maxGasPerAgent` — used to set minimum deposit size.

---

# 12. Security Considerations

**ZK trusted setup compromise:** If an attacker participated in the phase 2 ceremony and kept toxic waste, they can generate proofs for invalid bids (e.g., prove a bid is in range when it is not). Mitigation: multi-party phase 2 ceremony with at least 3 independent contributors. At least one honest contributor is sufficient for soundness.

**MPC committee collusion:** If 3 of 5 committee members collude, they can decrypt bids before close and front-run. Mitigation: committee members should be independent parties with economic stakes in the system's fairness. For the hackathon: run 5 separate nodes yourself on different machines/networks.

**Nullifier linkability:** Nullifiers are derived deterministically from agentSecret + auctionId. If an attacker learns an agent's agentSecret, they can compute all past and future nullifiers and link the agent's entire auction history. Mitigation: agentSecret is stored in KMS, never in hot memory, never logged.

**x402 receipt replay:** A payment receipt (txHash) could theoretically be replayed. Mitigation: X402PaymentGate.sol stores spent receipts (nullifier pattern). Second submission of the same txHash is rejected.

**EIP-712 deadline enforcement:** All speech act structs include a `deadline` field. `AgentAccount.validateUserOp()` enforces `block.timestamp ≤ deadline`. This prevents delayed UserOp submission from replaying a bid in a future auction phase. Set deadlines to `block.timestamp + 10 minutes` for normal operations.

---

# 13. Off-Chain Components Summary

Not everything runs on-chain. These off-chain components are cryptographically bound to on-chain state:

**Bundler (EIP-4337):** Receives UserOperations from agents, simulates validation, bundles valid ops, submits to EntryPoint. Run Alto (TypeScript) or Rundler (Rust). For the hackathon, use a public bundler on the chosen L2 testnet, or run Alto locally.

**ZK Proving (agent-side):** Agents run snarkjs (Node.js/browser) to generate Groth16 proofs locally. Proving keys are distributed with the agent SDK. For production, use rapidsnark (10–20x faster than snarkjs). Proving time: ~200ms (BidRange), ~400ms (RegistryMembership). Acceptable at bid time.

**MPC Committee nodes:** 5 nodes that participate in DKG and threshold decryption. Each node runs a small service that: monitors `SealedBidMPC` for auction close events, performs its partial decryption, shares partial decryptions with other nodes via an authenticated P2P channel (libp2p or simple HTTPS), and coordinates FROST signature production. For the hackathon: 5 Docker containers running on the same machine is sufficient for demonstration.

**Event log relay / WebSocket server:** Relays AuctionRoom events to agents over WebSocket/SSE. Not a trusted component — agents independently verify events against the on-chain Poseidon chain head. The relay is a convenience, not a source of truth.

**x402 middleware:** A small HTTP middleware layer (Node.js) that intercepts requests to auction API endpoints, decodes the `PAYMENT-SIGNATURE` header (base64 → `PaymentPayload` JSON), verifies payment via the facilitator or X402PaymentGate.sol, and forwards verified requests to the actual API server. Use `@x402/express` or `@x402/hono` for drop-in integration. The actual API server trusts the middleware — run both in the same process or behind a private network.
