> **Note: Updated Architecture Document — Post Off-Chain Migration (Feb 2026)**
>
> ⚠️ **ARCHITECTURE STATUS:** This document reflects the current hybrid off-chain architecture.
> The following contracts are **NOT deployed** in MVP:
> `NullifierSet.sol`, `BidCommitVerifier.sol`, `RegistryMemberVerifier.sol`,
> `DepositRangeVerifier.sol`, `AuctionFactory.sol`, `AuctionRoom.sol` (on-chain),
> `SealedBidMPC.sol`, `X402PaymentGate.sol`
>
> Key architectural shifts from the original full-on-chain design:
> - `validateUserOp()` does **not** call ZK verifiers (moved to DO sequencer via snarkjs)
> - `ingestEventBatch()` is **removed** — Poseidon chain lives in DO KV
> - `anchorHash()` is **removed** — one `finalLogHash` written at close via `recordResult()`
> - EIP-712 `verifyingContract` = `AuctionRegistry.address` (not AuctionFactory — removed)
> - ZK proof verification: off-chain via `snarkjs.groth16.verify()` in Durable Object
> - Nullifier tracking: Cloudflare KV (replaces NullifierSet.sol)
> - x402 receipt dedup: Cloudflare KV (replaces X402PaymentGate.sol)
>
> For implementation-accurate deep specs, see:
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

**Problem 2 — Verifiable Sequencer Ordering.** Someone has to decide which bid wins. In a centralized system that someone is the auctioneer — who can front-run, reorder, or simply lie. We solve this with a trusted sequencer model (same as Vertex Protocol / dYdX v3): the DO sequencer orders bids with a Poseidon hash chain, agents receive signed inclusion receipts for every accepted action, and the final chain head (`finalLogHash`) is anchored on-chain at close. Any third party can download the IPFS replay bundle, replay the Poseidon chain, and verify the final hash matches the on-chain anchor. CRE independently verifies the bundle and winner before releasing escrow — a compromised sequencer cannot fabricate a winner from included bids (CRE catches it), and cannot secretly drop bids without agents detecting via their inclusion receipts.

**Trust model:** The sequencer is trusted for event ordering and inclusion during the auction. The operator CANNOT: rewrite history after close (finalLogHash on-chain), fabricate a CRE result, or redirect escrow funds (CRE verifies winner independently from ERC-8004 registry). The operator CAN: censor bids before inclusion — mitigated by signed inclusion receipts (P1: on-chain challenge contract).

**Problem 3 — Agent UX.** Agents are not humans. They cannot hold ETH for gas, manage nonces manually, or recover from a failed mid-auction transaction. We solve this with EIP-4337 Account Abstraction — agents get smart contract wallets, gas is sponsored by the auction paymaster, and bond deposit UserOps are atomic. Speech acts (join/bid/deliver) are submitted over HTTP/MCP to the DO sequencer — no gas, no UserOp, no bundler overhead for these actions.

---

# 1. Network Layer — Why L2

All contracts deploy on **Base Sepolia** (OP Stack L2, chainId `84532`). The research report and CRE integration are standardized on this target.

**Why Base Sepolia (updated rationale):**

1. **Cheap escrow settlement txs** — `recordResult()` + `onReport()` each cost ~$0.01–$0.05 at L2 gas prices
2. **EIP-4337 support** — EntryPoint v0.7 at canonical address, Pimlico/CDP bundlers available
3. **Cheap final anchor writes** — one `recordResult()` per auction (~80K gas ≈ $0.008–$0.04)
4. **Chainlink CRE / KeystoneForwarder** — CRE workflows target Base Sepolia for settlement
5. **USDC native liquidity** — USDC on Base Sepolia for testnet bond deposits

**Historical note (pre-migration):** The original rationale cited Groth16 on-chain verification cost (~200K gas per proof, $25–$30/proof on L1). That reason is now obsolete — ZK proof verification has moved off-chain to the DO sequencer via `snarkjs.groth16.verify()` (zero gas, ~400ms). The L2 rationale is now primarily escrow economics and CRE integration.

**L1 anchor (P1):** We do not abandon L1 entirely. The ERC-8004 registry root (a single bytes32 Merkle root) is periodically anchored to L1 for maximum security. Large escrow settlements (above a configurable threshold) bridge back to L1. The L1 anchor path is a P1 deliverable, not in MVP scope.

**Why Base Sepolia:** Base is an OP Stack L2 with mature tooling (Tenderly fork support, Pimlico/CDP bundlers for EIP-4337, x402 facilitator support). EIP-4337 EntryPoint v0.7 is deployed at the canonical address `0x0000000071727De22E5E9d8BAf0edAc6f37da032`. CRE workflows target Base Sepolia for settlement. For production: Base Mainnet. **MVP pins EntryPoint v0.7; v0.9 exists.** Migration trigger: if Base deprecates v0.7 bundler support or a critical vulnerability is disclosed.

---

# 2. Contract Architecture — Full Map

```
L2 (Base Sepolia — chainId 84532)
│
├─── ACCOUNT ABSTRACTION LAYER (EIP-4337)
│    ├── EntryPoint.sol          (canonical, verify address only — do NOT redeploy)
│    ├── AgentAccountFactory.sol (CREATE2 wallet deployment)
│    ├── AgentAccount.sol        (SIMPLIFIED — sig+nonce only, no ZK verifier calls)
│    └── AgentPaymaster.sol      (gas sponsorship for bond deposit UserOps only)
│
├─── IDENTITY & PRIVACY LAYER
│    ├── IdentityRegistry        (official ERC-8004, external canonical deployment)
│    └── AgentPrivacyRegistry.sol (optional ZK commitment sidecar — OPTIONAL for MVP)
│
├─── AUCTION LOGIC LAYER
│    ├── AuctionRegistry.sol     (SIMPLIFIED: createAuction | recordResult | markSettled
│    │                            holds EIP-712 DOMAIN_SEPARATOR)
│    └── AuctionEscrow.sol       (MVP: bonds-only + CRE ReceiverTemplate)
│
└─── PAYMENT LAYER
     └── EscrowMilestone.sol     (P1: replaces AuctionEscrow with milestones + slashing)

REMOVED FROM ON-CHAIN (moved off-chain or eliminated):
  ✗ NullifierSet.sol         → Cloudflare KV: nullifier:{poseidonHash}
  ✗ BidCommitVerifier.sol    → snarkjs.groth16.verify(bidRangeVKey, ...) in DO
  ✗ RegistryMemberVerifier.sol → snarkjs.groth16.verify(registryMemberVKey, ...) in DO
  ✗ DepositRangeVerifier.sol → P1 optional, not deployed
  ✗ AuctionFactory.sol       → createAuction() merged into AuctionRegistry
  ✗ AuctionRoom.sol (on-chain) → Durable Object is the room, no on-chain AuctionRoom
  ✗ SealedBidMPC.sol         → off-chain MPC committee, result submitted via recordResult()
  ✗ X402PaymentGate.sol      → Cloudflare KV: x402receipt:{chainId}:{txHash}:{logIndex}

OFF-CHAIN (cryptographically bound to on-chain state)
│
├─── ZK VERIFICATION (Durable Object sequencer)
│    ├── snarkjs.groth16.verify(bidRangeVKey, publicSignals, proof)
│    ├── snarkjs.groth16.verify(registryMemberVKey, publicSignals, proof)
│    ├── bid_range_vkey.json           (loaded at DO startup)
│    └── registry_member_vkey.json     (loaded at DO startup)
│
├─── ZK CIRCUITS (Circom 2.x — compile + trusted setup, export vkeys as JSON)
│    ├── RegistryMembership.circom
│    ├── BidRange.circom
│    └── DepositRange.circom (P1 optional)
│
├─── NULLIFIER + RECEIPT STORE (Cloudflare KV)
│    ├── nullifier:{poseidonHash}                          (replaces NullifierSet.sol)
│    └── x402receipt:{chainId}:{txHash}:{logIndex}         (replaces X402PaymentGate.sol)
│
├─── EVENT LOG (Postgres + IPFS)
│    ├── Postgres: authoritative append-only event log (source for ReplayBundleV1)
│    └── IPFS/Arweave: ReplayBundleV1 pinned at auction close
│
└─── MPC COMMITTEE (off-chain, 3-of-5 threshold)
     └── ElGamal threshold decryption + FROST sig — result submitted to recordResult()
```

---

# 3. Account Abstraction Layer (EIP-4337)

## Why EIP-4337 Is Non-Negotiable for Agent Systems

EIP-4337 decouples the concept of "who is doing an action" from "who pays for gas." In a normal Ethereum transaction, the sender must hold ETH to pay gas. For agents, this creates an operational nightmare: every agent needs a funded EOA, key management becomes a security risk, and a failed mid-auction transaction leaves the system in a partial state with no clean recovery.

With EIP-4337, agents use smart contract wallets. Gas is paid by a Paymaster contract. Bond deposit UserOps are atomic. Speech acts (join/bid/deliver/dispute/withdraw) are submitted over HTTP/MCP to the DO sequencer — no gas, no UserOp, no bundler overhead.

## EntryPoint.sol

**What it is:** The EIP-4337 standard singleton contract. One instance per chain. All UserOperations flow through it.

**What it does:** Receives a batch of UserOperations from a Bundler, calls `validateUserOp()` on each sender wallet, charges the appropriate Paymaster, and then executes the actual call. It enforces ordering, nonce management, and stake accounting.

**Deployment:** EntryPoint v0.7 uses deterministic CREATE2 and is deployed at the canonical address `0x0000000071727De22E5E9d8BAf0edAc6f37da032` on many EVM chains, including Base Sepolia. **Use the canonical deployment — do NOT deploy your own.** Always verify the EntryPoint deployment/address on your specific target chain.

**Critical property:** EntryPoint is the only contract that can call `AgentAccount.execute()`. This means no external contract can trigger agent actions directly — everything goes through the UserOperation validation pipeline.

## AgentAccountFactory.sol

**What it is:** A factory that deploys `AgentAccount` smart wallets using CREATE2 (deterministic address derivation).

**What it does:** `createAccount(agentPubkey, salt)` deploys a new `AgentAccount` at a deterministic address. Because CREATE2 is deterministic, the agent knows its wallet address *before* the wallet is deployed — it can receive funds and be referenced in auction rooms before ever paying for deployment.

**Lazy deployment:** The wallet is only deployed when the agent sends its first UserOperation. The `initCode` field in the UserOp contains the factory call — EntryPoint calls the factory if the wallet doesn't exist yet. This means onboarding costs zero gas until the agent actually does something.

**Key detail:** `getAddress(agentPubkey, salt)` is a pure view function that returns the deterministic address without deploying. Agents call this during onboarding to know their identity address.

## AgentAccount.sol (SIMPLIFIED)

**What it is:** The agent's smart contract wallet. Implements `IAccount` (EIP-4337 interface).

**Core function — `validateUserOp()` (UPDATED):** Simplified to signature and nonce validation only. ZK verifier calls have been removed — proof verification happens off-chain in the DO sequencer.

```solidity
function validateUserOp(
    UserOperation calldata userOp,
    bytes32 userOpHash,
    uint256 missingFunds
) external override onlyEntryPoint returns (uint256 validationData) {
    // 1. Verify EIP-712 signature (runtime key → ecrecover)
    _verifySignature(userOpHash, userOp.signature);

    // 2. Verify nonce + deadline
    _validateNonceAndDeadline(userOp);

    // REMOVED: RegistryMemberVerifier.verify(zkMembershipProof)  → snarkjs in DO
    // REMOVED: BidCommitVerifier.verify(zkRangeProof)            → snarkjs in DO
    // REMOVED: NullifierSet.spend(nullifier)                      → Cloudflare KV

    return SIG_VALIDATION_SUCCESS;
}
```

**What UserOps are used for (MVP):**
- USDC bond deposit: `AgentAccount.execute(USDC.transfer(escrowAddress, bondAmount))`
- Withdraw: `AgentAccount.execute(AuctionEscrow.withdraw())`
- Wallet admin: key rotation, approval management

**What is NOT done via UserOp (sent to DO sequencer over HTTP/MCP instead):**
- Join: `POST /room/{auctionId}/action { type: 'join', typedData, sig, zkProof }`
- Bid: `POST /room/{auctionId}/action { type: 'bid', typedData, sig, zkProof }`
- Deliver: `POST /room/{auctionId}/action { type: 'deliver', typedData, sig }`
- Dispute, Withdraw request: same HTTP path

**Why ZK verification moved off-chain:** On-chain Groth16 verification costs ~200K gas per proof. With 50 agents each submitting membership + range proofs, that is ~$150–$500 per auction on L2. Moving verification to `snarkjs.groth16.verify()` in the DO sequencer costs zero gas and takes ~400ms — acceptable at bid time and dramatically cheaper.

**`execute()` function:** After validation, EntryPoint calls `execute(address target, uint256 value, bytes calldata data)`. This is what actually calls on-chain actions from the agent wallet, such as `USDC.transfer()` (bond deposits) and withdrawals.

**Note:** `AuctionEscrow.recordBond()` has an `onlyAdmin` modifier and is called by the platform backend after detecting successful USDC transfers on-chain. It is NOT called by agent wallets.

**Nonce management:** AgentAccount tracks its own nonce (used in all EIP-712 structs for UserOps). Off-chain action nonces (for join/bid sent to sequencer) are tracked separately in DO KV: `nonce:{auctionId}:{agentId}`. Sequencer rejects messages with `nonce <= lastSeen`.

## AgentPaymaster.sol (SIMPLIFIED)

**What it is:** Implements `IPaymaster` (EIP-4337). Sponsors gas on behalf of registered agents for on-chain bond deposit UserOps.

**`validatePaymasterUserOp()` (UPDATED):** Checks that the agent has sufficient locked deposit in AuctionEscrow for the target auction. ZK-related checks have been removed.

```solidity
function validatePaymasterUserOp(
    UserOperation calldata userOp,
    bytes32,
    uint256
) external view override returns (bytes memory context, uint256 validationData) {
    bytes32 auctionId = abi.decode(userOp.paymasterAndData[20:], (bytes32));

    // Check escrow bond coverage (unchanged)
    require(
        escrow.bondRecords(auctionId, _getAgentId(userOp.sender)) >= requiredDeposit(auctionId),
        "insufficient bond"
    );

    // REMOVED: any ZK-related checks (now in DO sequencer)

    return ("", SIG_VALIDATION_SUCCESS);
}
```

**Narrowed sponsorship scope (security improvement):** Paymaster only sponsors calls to the allowlisted contracts and methods:
- `AuctionEscrow.recordBond()` (admin path)
- `USDC.transfer()` to escrow address
- `AgentAccount` admin methods (key rotation)

This prevents arbitrary on-chain execution under gas sponsorship.

**`postOp()`:** Called by EntryPoint after execution. **MVP: logs gas cost for analytics only** (no actual escrow deduction — simplifies implementation). **P1: records gas cost against agent's escrow balance.**

**Paymaster stake:** AgentPaymaster deposits ETH stake into EntryPoint. This stake is slashed if the Paymaster misbehaves. Stake the minimum required for the expected UserOp volume.

---

# 4. Identity & Privacy Layer

## IdentityRegistry (official ERC-8004) + AgentPrivacyRegistry.sol

**Source-of-truth rule (critical):** Settlement and refund authorization always read the official ERC-8004 `IdentityRegistry` (`ownerOf`, `getAgentWallet`, `setAgentWallet`). This avoids custom-ABI drift and keeps CRE checks aligned with published standard contracts.

**What AgentPrivacyRegistry is:** A sidecar contract keyed by official `agentId` that stores privacy commitments used by ZK circuits. It is **not** the identity authority and is never used to authorize settlement directly.

**MVP status:** `AgentPrivacyRegistry.sol` commitment registration is **OPTIONAL for MVP**. Required only if on-chain ZK membership proof gating is desired (P1). For MVP, the sequencer verifies ZK membership proofs off-chain using `snarkjs`. The agent still stores `merkle witness + agentSecret` locally (needed for off-chain proof generation).

**The sidecar commitment model:**

```
On-chain sidecar storage per agentId (if registered):
  registrationCommit = keccak256(agentSecret, capabilityMerkleRoot, salt)
  registeredAt = block.timestamp
  controller = msg.sender (can update the commitment)
```

**What `agentSecret` is:** A 256-bit random value generated locally by the agent. It never leaves secure storage. This secret anchors zero-knowledge capability proofs without exposing capability details on-chain.

**Capability Merkle tree:** Each leaf is `Poseidon(capabilityId, agentSecret, leafIndex)`. The contract stores only `capabilityMerkleRoot`; the agent keeps the witness path for off-chain proof generation.

**Why Poseidon (not keccak) inside circuits:** Poseidon is ZK-friendly (~240 constraints/hash) while keccak in circuits is prohibitively expensive (~90,000 constraints/hash).

**Sequencer registry root check:** The DO sequencer reads `AgentPrivacyRegistry.getRoot()` via RPC (cached per block) and verifies `publicSignals[0] == registryRoot` when validating membership proofs off-chain.

## NullifierSet — MOVED TO CLOUDFLARE KV

**Status:** `NullifierSet.sol` is **NOT deployed**. Nullifier tracking is handled by Cloudflare KV in the DO sequencer.

**How it works:**

```typescript
// Replaces NullifierSet.sol — DO sequencer, zero gas
async function checkSpendNullifier(nullifier: string, env: Env): Promise<void> {
  const key = `nullifier:${nullifier}`;
  const existing = await env.KV.get(key);
  if (existing) throw new Error("Nullifier already spent");
  await env.KV.put(key, "1"); // permanent — no TTL, same guarantee as SSTORE
}
```

**Durability:** Cloudflare KV is globally replicated and persistent across DO hibernation/restart. Same anti-double-spend guarantee as on-chain SSTORE, at zero gas cost.

**Trust shift:** Nullifier integrity is guaranteed by Cloudflare KV durability instead of Ethereum consensus. Acceptable given the sequencer is already the single ordering trust point for the off-chain auction engine.

**Nullifier derivation (unchanged from original design):** `nullifier = Poseidon(agentSecret, auctionId, action_type)`. Same agent + same auction + same action type = same nullifier. Deterministic, one-way, context-separated.

---

# 5. ZK Verification Layer — OFF-CHAIN

**Status:** All on-chain Groth16 verifier contracts (`BidCommitVerifier.sol`, `RegistryMemberVerifier.sol`, `DepositRangeVerifier.sol`) are **NOT deployed**. ZK proof verification runs off-chain in the DO sequencer using `snarkjs`.

**Why this is safe:** Agents still generate proofs locally using the same Circom circuits and proving keys. The verifier moves from an on-chain Solidity contract to the sequencer's `snarkjs.groth16.verify()` call. The proof mathematics are identical — only the execution environment changes. The tradeoff is that the sequencer must be trusted to run verification honestly (mitigated by CRE multi-node replay at settlement, and P1 multi-sequencer agreement).

## BidCommitVerifier — OFF-CHAIN (snarkjs in DO)

**Was:** On-chain Groth16 verifier contract called from `AgentAccount.validateUserOp()`. Cost: ~200K gas per verification.

**Now:** `snarkjs.groth16.verify(bidRangeVKey, publicSignals, proof)` in the DO sequencer. Cost: zero gas, ~200ms.

```typescript
import { groth16 } from "snarkjs";

// Loaded at DO startup from bundled JSON or CDN
const bidRangeVKey = await fetch("/bid_range_vkey.json").then(r => r.json());

async function verifyBidRangeProof(
  proof: Groth16Proof,
  publicSignals: string[]  // [bidCommitment, reservePrice, maxBudget, rangeOk]
): Promise<void> {
  const valid = await groth16.verify(bidRangeVKey, publicSignals, proof);
  if (!valid) throw new Error("Invalid bid range proof");
  if (publicSignals[3] !== "1") throw new Error("rangeOk must be 1");
}
```

**Public inputs verified:** `[bidCommitment, reservePrice, maxBudget, rangeOk]` — same as the on-chain verifier would check.

## RegistryMemberVerifier — OFF-CHAIN (snarkjs in DO)

**Was:** On-chain Groth16 verifier called from `AgentAccount.validateUserOp()`. Cost: ~200K gas per verification.

**Now:** `snarkjs.groth16.verify(registryMemberVKey, publicSignals, proof)` in the DO sequencer. Cost: zero gas, ~400ms.

```typescript
const registryMemberVKey = await fetch("/registry_member_vkey.json").then(r => r.json());

async function verifyMembershipProof(
  proof: Groth16Proof,
  publicSignals: string[],  // [registryRoot, capabilityCommitment, nullifier]
  env: Env
): Promise<void> {
  // 1. Verify proof mathematics
  const valid = await groth16.verify(registryMemberVKey, publicSignals, proof);
  if (!valid) throw new Error("Invalid membership proof");

  // 2. Verify registry root matches current on-chain state (cached per block)
  const onChainRoot = await getRegistryRoot(env); // eth_call to AgentPrivacyRegistry.getRoot()
  if (publicSignals[0] !== onChainRoot) throw new Error("Stale registry root");

  // 3. Check and spend nullifier
  await checkSpendNullifier(publicSignals[2], env);
}
```

## DepositRangeVerifier — P1 OPTIONAL, NOT DEPLOYED

Not used in MVP admission path. MVP uses explicit on-chain `recordBond` checks via paymaster policy. See original design for circuit spec if needed in P1.

## Trusted Setup (still required — for vkey JSON generation)

Groth16 requires a one-time trusted setup ceremony:
1. Circom compile → `circuit.r1cs` + `circuit.wasm`
2. Phase 1: Hermez Powers of Tau (public ptau file — reuse, do not regenerate)
3. Phase 2 (circuit-specific): `snarkjs groth16 setup circuit.r1cs pot.ptau circuit_0000.zkey`
4. Contribute randomness: `snarkjs zkey contribute`
5. Export verification key: **`snarkjs zkey export verificationkey circuit_final.zkey bid_range_vkey.json`**
6. Export proving key: `snarkjs zkey export solidityverifier` is **NOT needed** (no Solidity verifier deployed)

Load vkeys into DO at startup. Any circuit change requires re-running phase 2 and re-exporting vkeys.

---

# 6. ZK Circuits (Circom 2.x) — Unchanged

The circuits themselves are unchanged. Only the verifier execution environment changed (on-chain contract → snarkjs in DO).

## RegistryMembership.circom

**Purpose:** Prove "I am a registered ERC-8004 agent with capability C" without revealing which agent.

**Private inputs (never leave the agent's machine):**

```
agentSecret      : 256-bit random value generated at registration
capabilityPath[] : Merkle sibling nodes from leaf to root (20 elements for 2^20 registry)
salt             : per-proof randomness (prevents proof reuse)
```

**Public inputs (submitted to sequencer over HTTP/MCP):**

```
registryRoot          : current root of ERC-8004 registry Merkle tree (sequencer verifies on-chain)
capabilityCommitment  : Poseidon(capabilityId, agentSecret) — proves capability without ID
nullifier             : Poseidon(agentSecret, auctionId, JOIN) — unique per auction join
```

**Circuit logic:**

1. Recompute `leafHash = Poseidon(capabilityId, agentSecret, leafIndex)` from private inputs
2. Walk the Merkle path using `capabilityPath[]` siblings, computing Poseidon at each level
3. Assert: computed root equals public `registryRoot`
4. Assert: `capabilityCommitment == Poseidon(capabilityId, agentSecret)`
5. Assert: `nullifier == Poseidon(agentSecret, auctionId, JOIN)`

**Constraint count:** ~12,000 constraints (20-level Poseidon Merkle tree). Proving time ~400ms on modern hardware with snarkjs.

## BidRange.circom

**Purpose:** Prove "my hidden bid is within the valid range [reservePrice, maxBudget]" without revealing the bid.

**Private inputs:**

```
bid    : actual bid amount (uint256)
salt   : per-proof randomness
```

**Public inputs (submitted to sequencer over HTTP/MCP):**

```
bidCommitment : Poseidon(bid, salt) — binding commitment to the bid
reservePrice  : minimum valid bid (from auction manifest, public)
maxBudget     : maximum valid bid (agent's self-declared upper limit)
rangeOk       : 1 if reservePrice ≤ bid ≤ maxBudget, else circuit fails
```

**Circuit logic:**

1. Assert: `bidCommitment == Poseidon(bid, salt)`
2. Range check: `bid - reservePrice >= 0` (binary decomposition — 64-bit limbs)
3. Range check: `maxBudget - bid >= 0` (same technique)
4. Output: `rangeOk = 1`

## DepositRange.circom (P1 optional — not used in MVP)

**Purpose:** Prove "my balance is ≥ required deposit" without revealing the actual balance. Not in MVP admission path.

---

# 7. Auction Logic Layer

## AuctionFactory.sol — REMOVED

**Status:** `AuctionFactory.sol` is **NOT deployed**. Its two responsibilities have been redistributed:

1. **Auction creation** → `AuctionRegistry.createAuction()` (simple storage write, ~50K gas vs ~500K gas for CREATE2 room deployment)
2. **EIP-712 DOMAIN_SEPARATOR** → moved to `AuctionRegistry` (see below)

Per-auction `AuctionRoom.sol` contract deployment is eliminated. The Durable Object IS the auction room.

## AuctionRoom.sol (on-chain) — REMOVED

**Status:** `AuctionRoom.sol` as a deployed Solidity contract is **NOT used**. The Durable Object is the auction room.

**What moved where:**
- `ingestEventBatch()` → DO method (appends to Poseidon chain in KV, no gas)
- `chainHead` on-chain state → DO KV: `chainHead:{auctionId}` (survives hibernation)
- Phase state machine (OPEN/COMMIT/REVEAL/CLOSED) → DO in-memory state
- `anchorHash()` periodic writes → **eliminated** (one `finalLogHash` written at close via `recordResult()`)

**DO event ingestion (replaces ingestEventBatch):**

```typescript
async ingestAction(action: ValidatedAction): Promise<InclusionReceipt> {
  const seq = ++this.seqCounter;
  const prevHash = this.chainHead;
  const payloadHash = keccak256(encodeActionPayloadV1(action));
  const eventHash = poseidon([BigInt(seq), toBigInt(prevHash), toBigInt(payloadHash)]);
  this.chainHead = toBytes32(eventHash);

  // Persist to KV (survives DO hibernation)
  await env.KV.put(`chainHead:${auctionId}`, toHex(this.chainHead));
  await env.KV.put(`event:${auctionId}:${seq}`, serialize({seq, prevHash, eventHash, action}));

  // Persist to Postgres (authoritative archive for ReplayBundleV1)
  await db.events.insert({ auctionId, seq, prevHash, eventHash, payloadHash, action, ts: Date.now() });

  // Broadcast to all WebSocket/SSE subscribers
  for (const ws of this.subscribers) ws.send(JSON.stringify({ type: 'event', seq, eventHash, action }));

  // Return inclusion receipt to agent (anti-censorship proof)
  const sig = await sequencerKey.sign(keccak256(auctionId + seq + eventHash));
  return { auctionId, seq, eventHash, prevHash, actionType: action.type, receivedAt: Date.now(), sequencerSig: sig };
}
```

**Inclusion receipt schema:**
```json
{
  "auctionId": "0xabc...",
  "seq": 184,
  "eventHash": "0x...",
  "prevHash": "0x...",
  "actionType": "BID_COMMIT",
  "receivedAt": 1739981234,
  "sequencerSig": "0x..."
}
```

Agents store these receipts. If a bid is absent from the `finalLogHash` replay, the agent has cryptographic proof of censorship. **Anti-equivocation rule:** If the sequencer signs two different events with the same `(auctionId, seq)`, both receipts constitute proof of misbehavior and the room is disputable.

## AuctionRegistry.sol (SIMPLIFIED)

**Status:** Deployed. Significantly simplified from original design.

**Functions kept:**
- `createAuction(bytes32 auctionId, bytes32 manifestHash, bytes32 roomConfigHash, uint256 reservePrice, uint256 depositAmount, uint256 deadline)` — simple storage write (~50K gas, replaces AuctionFactory.createAuction)
- `recordResult(AuctionSettlementPacket calldata packet, bytes calldata sequencerSig)` — the ONE on-chain write at auction close
- `markSettled(bytes32 auctionId)` — called by escrow after CRE settlement
- `cancelExpiredAuction(bytes32 auctionId)` — 72h timeout path
- `updateWinnerWallet(bytes32 auctionId, address newWallet, bytes calldata sig)` — wallet rotation

**Functions removed:**
- ~~`anchorHash(bytes32 auctionId, uint256 seq, bytes32 logHash)`~~ — eliminated
- ~~`getAnchors(bytes32 auctionId)`~~ — eliminated
- ~~`anchorTrails` mapping~~ — eliminated
- ~~`lastAnchoredSeq` mapping~~ — eliminated
- ~~`HashAnchored` event~~ — eliminated

**Added: EIP-712 DOMAIN_SEPARATOR** (moved from AuctionFactory):

```solidity
bytes32 public immutable DOMAIN_SEPARATOR;

constructor(...) {
    DOMAIN_SEPARATOR = keccak256(abi.encode(
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
        keccak256("AgentAuction"),
        keccak256("1"),
        block.chainid,
        address(this)   // AuctionRegistry.address — NOT AuctionFactory (removed)
    ));
}
```

**Settlement packet struct (locked interface — do not change without updating CRE workflow):**

```solidity
struct AuctionSettlementPacket {
    bytes32 auctionId;
    bytes32 manifestHash;        // hash of AuctionManifest (from createAuction)
    bytes32 roomConfigHash;      // binds off-chain DO room config to on-chain entry
    bytes32 finalLogHash;        // Poseidon chain head (computed in DO KV)
    bytes32 replayContentHash;   // SHA-256 of ReplayBundleV1 pinned to IPFS/Arweave
    uint64  eventCount;          // total events in the log
    uint64  closeSeq;            // seq of the final event
    uint256 winnerAgentId;       // ERC-8004 token ID
    address winnerWallet;        // from ERC-8004 getAgentWallet()
    uint256 finalPrice;          // winning bid amount
    bytes32 engineVersionHash;   // hash of auction rule engine version for deterministic replay
    uint64  closeTime;           // block.timestamp at close
}
```

**`recordResult()` flow:**
```solidity
function recordResult(
    AuctionSettlementPacket calldata packet,
    bytes calldata sequencerSig
) external onlySequencer {
    require(auctions[packet.auctionId].state == State.OPEN, "not open");

    // Verify sequencer signature over the packed settlement data
    bytes32 digest = keccak256(abi.encode(packet));
    address recovered = ECDSA.recover(digest, sequencerSig);
    require(recovered == sequencerAddress, "invalid sequencer sig");

    // Store for CRE and auditors
    finalLogHash[packet.auctionId] = packet.finalLogHash;
    replayContentHash[packet.auctionId] = packet.replayContentHash;
    auctions[packet.auctionId].state = State.CLOSED;

    emit AuctionEnded(
        packet.auctionId,
        packet.winnerAgentId,
        packet.winnerWallet,
        packet.finalLogHash,
        packet.replayContentHash
    );
    // CRE EVM Log Trigger fires on AuctionEnded
}
```

**On-chain states (unchanged):** `{ NONE, OPEN, CLOSED, SETTLED, CANCELLED }`

**Two-domain design (UPDATED):**

```
Domain 1: "AgentAuction" — for all auction speech acts (join, bid, deliver, dispute, withdraw)
  verifyingContract: AuctionRegistry.address  ← (was AuctionFactory.address — AuctionFactory removed)

Domain 2: "AuctionRegistry" — for wallet rotation only
  verifyingContract: AuctionRegistry.address

Agent SDKs must select the correct domain per operation.
Signing a speech act with Domain 2 will ALWAYS fail ecrecover.
```

## SealedBidMPC.sol — REMOVED (off-chain committee)

**Status:** `SealedBidMPC.sol` is **NOT deployed**. MPC operates entirely off-chain.

**What moved where:**
- `submitEncryptedBid()` → HTTP POST to DO sequencer: `{ encryptedBid, bidCommitment, zkRangeProof }`
- `finalizeSealed()` → MPC committee submits result to sequencer → sequencer calls `AuctionRegistry.recordResult()`
- BidCommitVerifier call in `submitEncryptedBid()` → snarkjs in DO sequencer (zero gas)
- FROST threshold signature verification → sequencer verifies off-chain before accepting result

**Off-chain MPC flow:**
1. Agents submit `{ ciphertext: ElGamal.encrypt(bid, mpcPubKey, r), bidCommitment, zkRangeProof }` to DO
2. DO sequencer verifies ZK range proof (snarkjs) and records encrypted bid in KV
3. At auction close, sequencer signals MPC committee via authenticated API
4. Committee (5 nodes) each performs partial ElGamal decryption
5. Committee produces FROST threshold signature over decrypted results
6. One committee node submits `{ decryptedResults, thresholdSig }` to sequencer API
7. Sequencer verifies FROST sig, builds `AuctionSettlementPacket`, calls `recordResult()`

---

# 8. Payment Layer

## AuctionEscrow.sol (MVP — bonds only, UNCHANGED core logic)

**What it is:** The MVP escrow contract. Inherits CRE's `ReceiverTemplate` for secure `onReport` settlement. Handles USDC bond deposits, CRE-verified settlement, and pull-based refunds.

**ReceiverTemplate integration:** `ReceiverTemplate` constructor takes `address _forwarderAddress` (the KeystoneForwarder) and inherits `Ownable(msg.sender)`. Configure POST-DEPLOY via `onlyOwner` setters: `setExpectedAuthor(address)`, `setExpectedWorkflowName(string calldata)`, `setExpectedWorkflowId(bytes32)`. The `onReport()` function verifies incoming reports match these configured values before calling `_processReport()`.

**Key functions (unchanged):**
- `recordBond(auctionId, agentId, depositor, amount, x402TxId)` — idempotency key: `keccak256(abi.encodePacked(txHash, logIndex))` (NOT just txHash — same txHash can have multiple Transfer events)
- `_processReport(report)` — CRE settlement, called by inherited `onReport(metadata, report)` after metadata validation; releases winner bond
- `claimRefund(auctionId, agentId)` — pull-based refund for non-winners
- `withdraw()` — agent withdraws available balance
- `adminRefund(...)` — emergency only

**Bond race condition handling (PENDING_BOND state):**

Bond is an on-chain event; join is an off-chain sequencer action. Race condition exists:

```
State A — bond already recorded (BondRecorded event observed by sequencer):
  → Immediately admit agent to auction room

State B — join arrives, bond not yet recorded:
  → Sequencer returns: { status: 'PENDING_BOND', retryAfter: 5000 }
  → Agent retries join after bond tx is confirmed
  → Sequencer enforces timeout = 60s; rejects join if bond not observed within timeout

Idempotency key for recordBond: keccak256(abi.encodePacked(txHash, logIndex))
Rationale: same txHash can contain multiple Transfer events (logIndex disambiguates)
```

**Solvency invariant:** `usdc.balanceOf(this) >= totalBonded + totalWithdrawable`

**⚠ Security:** The Ownable owner can reconfigure which CRE workflow the escrow accepts. For production (P1): transfer ownership to a timelocked multisig after initial configuration.

## X402PaymentGate.sol — REMOVED (DO KV middleware)

**Status:** `X402PaymentGate.sol` is **NOT deployed**. Receipt deduplication is handled by Cloudflare KV middleware.

```typescript
// Replaces X402PaymentGate.sol — DO KV, zero gas
async function x402GateDeduplicate(
  chainId: number,
  txHash: string,
  logIndex: number,
  env: Env
): Promise<void> {
  // Key includes logIndex — same txHash can have multiple Transfer events
  const key = `x402receipt:${chainId}:${txHash}:${logIndex}`;
  const existing = await env.KV.get(key);
  if (existing) throw new Response("Receipt already used", { status: 409 });
  await env.KV.put(key, JSON.stringify({ usedAt: Date.now(), txHash, logIndex }), {
    expirationTtl: 86400 * 90  // 90-day TTL — long enough to prevent replay
  });
}
```

**x402 flow (unchanged — @x402/express middleware):** x402 handles the HTTP 402 → payment → retry flow. The dedup layer above sits before the resource handler. Verification of payment receipt against chain is still done via `eth_getTransactionReceipt` RPC call in the middleware.

**Where x402 applies:**

| HTTP Endpoint | x402 Fee | Why |
|---|---|---|
| `GET /manifest` | 0.001 USDC | Anti-spam for manifest fetching |
| `GET /events?from=seq` | 0.0001 USDC/call | Rate-limits event log polling |
| `GET /auctions` (discovery) | 0 (free) | Discovery should be free to maximize participation |

## EscrowMilestone.sol (P1 — replaces AuctionEscrow)

Unchanged from original design. See research report for full spec. Not in MVP scope.

---

# 9. EIP-712 TypedData — All Speech Acts

Every action an agent takes in an auction is an EIP-712 typed data struct. This gives us: human-readable signing, domain separation, and on-chain verifiability (`ecrecover()` in both AgentAccount and the DO sequencer).

**Domain (UPDATED — fetched from AuctionRegistry, NOT AuctionFactory):**

```solidity
struct EIP712Domain {
  string  name;              // "AgentAuction"
  string  version;           // "1"
  uint256 chainId;           // L2 chain ID (84532 for Base Sepolia)
  address verifyingContract; // AuctionRegistry.address  ← UPDATED (AuctionFactory removed)
}
```

**All typed structs (unchanged):**

```solidity
struct Join {
  bytes32 auctionId;
  bytes32 nullifier;       // Poseidon(agentSecret, auctionId, JOIN) — spent in DO KV
  uint256 depositAmount;
  uint256 nonce;           // off-chain action nonce tracked in DO KV
  uint256 deadline;
}

struct Bid {
  bytes32 auctionId;
  bytes32 bidCommitment;   // Poseidon(bid, salt) — bid is hidden
  bytes32 encryptedBidHash; // keccak256(ElGamal ciphertext)
  bytes32 zkRangeProofHash; // keccak256(Groth16 proof bytes)
  uint256 nonce;
  uint256 deadline;
}

struct Reveal {            // only for non-sealed / commit-reveal auctions
  bytes32 auctionId;
  uint256 bid;             // actual bid amount
  bytes32 salt;            // reveals the commitment
  uint256 nonce;
}

struct Deliver {
  bytes32 auctionId;
  uint256 milestoneId;
  bytes32 deliveryHash;
  bytes32 executionLogHash;
  uint256 nonce;
  uint256 deadline;
}

struct Dispute {
  bytes32 auctionId;
  bytes32 evidencePackageHash;
  address respondent;
  uint256 nonce;
}

struct Withdraw {
  bytes32 auctionId;
  string  reason;
  uint256 nonce;
  uint256 deadline;
}
```

**Signing in practice (UPDATED):** For speech acts (join/bid/deliver/dispute/withdraw), the agent:
1. Generates the EIP-712 typed data hash using `AuctionRegistry.address` as `verifyingContract`
2. Signs with its runtime key (secp256k1 → ecrecover)
3. Sends `{ typedData, sig, zkProof?, publicSignals? }` via HTTP POST to DO sequencer
4. Sequencer verifies: `ecrecover(EIP712Hash(message), sig) == ERC-8004 registered wallet`
5. Sequencer returns inclusion receipt `{ seq, eventHash, sequencerSig }`

For on-chain UserOps (bond deposit only), the same runtime key signs the UserOperation's `userOpHash`, and `AgentAccount.validateUserOp()` verifies via `ecrecover()`.

---

# 10. Contract Deployment Order (Updated: 9 steps, down from 15)

Order matters. Dependencies must be deployed before dependents.

```
Step 1:  Verify EntryPoint.sol at canonical address
         (0x0000000071727De22E5E9d8BAf0edAc6f37da032 — already deployed on Base Sepolia)
         ACTION: verify bytecode exists via eth_getCode; do NOT redeploy

         REMOVED: NullifierSet.sol — moved to Cloudflare KV
         REMOVED: BidCommitVerifier.sol — moved to snarkjs in DO
         REMOVED: RegistryMemberVerifier.sol — moved to snarkjs in DO
         REMOVED: DepositRangeVerifier.sol — P1 optional, not deployed

Step 2:  AgentPrivacyRegistry.sol
         (no dependencies — NullifierSet dependency removed)
         NOTE: official ERC-8004 IdentityRegistry is external canonical deployment;
               integrate by pinned address/ABI, do not fork

Step 3:  AgentAccount.sol (implementation, not proxy)
         (SIMPLIFIED — no ZK verifier dependencies)
         NOTE: no RegistryMemberVerifier or BidCommitVerifier in constructor

Step 4:  AgentAccountFactory.sol
         (depends: EntryPoint, AgentAccount implementation)

Step 5:  AgentPaymaster.sol
         (depends: EntryPoint)
         ACTION: stake ETH in EntryPoint after deploy
         ACTION: configure method allowlist (USDC.transfer to escrow, AgentAccount admin)

Step 6:  AuctionRegistry.sol
         (SIMPLIFIED — holds DOMAIN_SEPARATOR, sequencer address, no AuctionFactory)
         (depends: nothing at deploy)
         ACTION: set DOMAIN_SEPARATOR with verifyingContract = AuctionRegistry.address
         ACTION: grant SEQUENCER_ROLE to DO sequencer wallet after deploy
         ACTION: grant ESCROW_ROLE to AuctionEscrow after Step 7

Step 7:  AuctionEscrow.sol
         (depends: AuctionRegistry, IdentityRegistry, KeystoneForwarder address)
         NOTE: ReceiverTemplate constructor takes (forwarderAddress) only.
         ACTION: after deploy, call setExpectedAuthor(workflowDeployerAddress),
                 setExpectedWorkflowName("auctSettle"),
                 setExpectedWorkflowId(workflowIdBytes32)
         ACTION: For production: transfer ownership to timelocked multisig after configuration

Step 8:  AuctionRegistry.setEscrow(AuctionEscrow.address)
         (one-time binding — links registry ↔ escrow)

         REMOVED: X402PaymentGate.sol — moved to Cloudflare KV middleware
         REMOVED: SealedBidMPC.sol — off-chain committee
         REMOVED: AuctionRoom.sol (on-chain) — Durable Object is the room
         REMOVED: AuctionFactory.sol — createAuction() merged into AuctionRegistry

Step 9:  DO Sequencer deploy + ZK vkey configuration
         ACTION: deploy Cloudflare Worker + Durable Object
         ACTION: configure sequencer private key (signs AuctionSettlementPacket)
         ACTION: bundle or upload bid_range_vkey.json + registry_member_vkey.json to DO
         ACTION: configure Postgres connection for authoritative event log
         ACTION: configure Cloudflare KV namespace binding (AUCTION_KV)
         ACTION: configure MPC committee API endpoint + committee pubkey
```

**Verification key deployment note:** ZK vkeys (bid_range_vkey.json, registry_member_vkey.json) are produced by the trusted setup ceremony (Circom → snarkjs phase 2 → `snarkjs zkey export verificationkey`). Load into DO at startup. Any circuit change requires re-running phase 2 and re-loading vkeys. No Solidity verifier redeployment needed.

---

# 11. Gas Analysis — Updated for Off-Chain Architecture

| Operation | Gas | Cost (Base L2) | Notes |
|---|---|---|---|
| `AuctionRegistry.createAuction()` | ~50K gas | $0.005–$0.02 | Simple storage writes. Was ~500K gas with AuctionFactory CREATE2. |
| Bond deposit UserOp (USDC.transfer to escrow) | ~250K gas | $0.025–$0.10 | Dominated by ERC-20 transfer + EIP-4337 overhead |
| `AuctionRegistry.recordResult()` | ~80K gas | $0.008–$0.03 | ONE write per auction at close. Was N × ~50K for periodic anchorHash. |
| `AuctionEscrow.onReport()` (CRE settlement) | ~150K gas | $0.015–$0.06 | CRE → KeystoneForwarder → _processReport |
| `AuctionEscrow.claimRefund()` (per non-winner) | ~50K gas | $0.005–$0.02 | Pull-based, agent-initiated |
| ZK proof verification | **0 gas** | $0 | Moved to snarkjs in DO. Was ~200K gas per proof on-chain. |
| Event ingestion (per event) | **0 gas** | $0 | Moved to DO KV. Was ~26K gas per batch write. |
| Nullifier spend | **0 gas** | $0 | Moved to Cloudflare KV. Was ~22K gas SSTORE. |

**Per-auction gas totals (50 agents):**

```
Old architecture (all on-chain):
  50 × join UserOps (sig + ZK member + nullifier): 50 × ~250K = 12.5M gas
  50 × bid UserOps (sig + ZK range):               50 × ~220K = 11.0M gas
  N × anchorHash (say, 10 during auction):          10 × ~50K  = 0.5M gas
  Total: ~24M gas = $24–$240 per auction on Base L2

New architecture (off-chain):
  1 × createAuction:                                   ~50K gas
  50 × bond deposit UserOps (USDC.transfer):    50 × 250K = 12.5M gas
  1 × recordResult (single close anchor):              ~80K gas
  1 × CRE onReport settlement:                        ~150K gas
  Total: ~12.8M gas = $13–$130 per auction on Base L2

  Additional per non-winner (pull refunds):     49 × 50K = ~2.5M gas
  Grand total (50 agents, all refunds):         ~15.3M gas = $15–$153

Savings on auction-fixed costs (ZK + events + anchors): ~11M gas (~78% of original)
```

**Paymaster sponsorship:** Gas for bond deposit UserOps is sponsored by AgentPaymaster. Agents never pay gas from their own wallets. Gas debt is logged for analytics (P1: deducted from winnings/deposit at settlement).

---

# 12. Security Considerations

**ZK trusted setup compromise:** If an attacker participated in the phase 2 ceremony and kept toxic waste, they can generate proofs for invalid bids. **Mitigation:** multi-party phase 2 ceremony with at least 3 independent contributors. One honest contributor is sufficient for soundness.

**Off-chain ZK verification trust gap (NEW — introduced by migration):** The DO sequencer verifies ZK proofs unilaterally. A compromised sequencer can accept invalid proofs (e.g., admit an agent with invalid membership). **Mitigation:** Signed inclusion receipts + CRE rule replay at settlement catch downstream effects (CRE independently verifies winner derivation). **P1 mitigation:** multi-sequencer 2-of-3 ZK proof agreement required before acceptance.

**Sequencer equivocation:** A sequencer that signs two different events with the same `(auctionId, seq)` is detectable. Any agent holding two such receipts has proof of misbehavior — the room enters DISPUTED state and settlement is blocked. **MVP:** rule is documented, on-chain AuctionChallenge.sol enforcement is P1.

**MPC committee collusion:** If 3 of 5 committee members collude, they can decrypt bids before close and front-run. **Mitigation:** committee members should be independent parties with economic stakes. For hackathon: run 5 separate Docker containers on different networks/IPs.

**Nullifier linkability (in DO KV):** Nullifiers are derived deterministically from `agentSecret + auctionId`. If an attacker learns an agent's `agentSecret`, they can compute all past and future nullifiers and link the agent's entire auction history. **Mitigation:** `agentSecret` stored in KMS, never in hot memory, never logged.

**x402 receipt replay:** A payment receipt could theoretically be replayed. **Mitigation:** DO KV dedup with key `x402receipt:{chainId}:{txHash}:{logIndex}` — second submission of the same receipt is rejected with HTTP 409. TTL of 90 days prevents indefinite KV growth.

**EIP-712 deadline enforcement:** All speech act structs include a `deadline` field. For on-chain UserOps, `AgentAccount.validateUserOp()` enforces `block.timestamp ≤ deadline`. For off-chain sequencer actions, the DO sequencer enforces the same deadline check before acceptance. Set deadlines to `block.timestamp + 10 minutes` for normal operations.

**Bond race condition:** If join arrives before bond is observed, the sequencer enforces PENDING_BOND state with 60-second timeout. An agent cannot join without a confirmed bond — prevents bond-less auction participation.

**CRE settlement integrity:** CRE independently fetches the IPFS replay bundle, verifies `sha256(bundle) == replayContentHash` (on-chain), replays the Poseidon chain to verify `computed root == finalLogHash` (on-chain), and independently replays auction rules to derive the winner. A sequencer that declares a false winner will be caught by CRE — but only if the winner derivation contradicts the event log. A sequencer that fabricated the event log AND controls the IPFS pin could theoretically serve a consistent-but-false bundle — P1 mitigation: CRE fetches from multiple IPFS gateways, periodic anchors at open + close bound the rewrite window.

---

# 13. Off-Chain Components Summary

**Bundler (EIP-4337):** Receives UserOperations from agents for bond deposit only. Run Alto (TypeScript) or Rundler (Rust), or use a public bundler on Base Sepolia testnet (Pimlico, CDP).

**DO Sequencer (Cloudflare Durable Objects) — primary off-chain component:**
- Validates all auction speech acts (ecrecover + snarkjs ZK verification)
- Maintains Poseidon hash chain in KV (`chainHead:{auctionId}`)
- Persists events to Postgres (authoritative archive)
- Broadcasts events to WebSocket/SSE subscribers
- Returns signed inclusion receipts for every accepted action
- At close: builds ReplayBundleV1, pins to IPFS, calls `AuctionRegistry.recordResult()`
- Tracks nullifiers in KV, x402 receipt dedup in KV

**ZK Proving (agent-side):** Agents run `snarkjs` (Node.js/browser) to generate Groth16 proofs locally. Proving keys distributed with agent SDK. For production, use `rapidsnark` (10–20× faster). Proving time: ~200ms (BidRange), ~400ms (RegistryMembership). Proofs are submitted to DO sequencer over HTTP/MCP — not to on-chain contracts.

**MPC Committee nodes (off-chain):** 5 nodes that participate in DKG and threshold decryption. Each node: monitors DO sequencer API for auction close, performs partial ElGamal decryption, shares partial decryptions with other nodes via authenticated HTTPS, coordinates FROST signature production, submits result to sequencer API. For hackathon: 5 Docker containers on different networks, same machine is sufficient for demonstration.

**Postgres (authoritative event log):** Append-only event log. Source for ReplayBundleV1 generation at auction close. DO KV stores the hot-state chainHead cursor; Postgres stores the full event history. Postgres WAL provides an internal audit trail even without on-chain mid-auction anchors.

**IPFS/Arweave (replay bundle):** `ReplayBundleV1` pinned at auction close. Contains all events in order with their Poseidon hashes. `replayContentHash = sha256(bundleBytes)` is written on-chain via `recordResult()`. Anyone can verify: download bundle → replay Poseidon chain → compare to `finalLogHash` on-chain.

**x402 middleware:** `@x402/express` (or `@x402/hono`) middleware that intercepts HTTP requests, decodes `PAYMENT-SIGNATURE` header, verifies payment via facilitator, and calls the DO KV dedup before forwarding to the resource handler. Runs in the same Worker process or behind a private network.

**CRE Workflow (Chainlink):** EVM Log Trigger on `AuctionEnded` event → fetch ReplayBundleV1 from configured base URL → `sha256` verify against `replayContentHash` → replay Poseidon chain → verify `finalLogHash` → replay auction rules → derive winner → verify against declared winner → call `AuctionEscrow.onReport()` via `KeystoneForwarder` → funds released. This is the **primary settlement path** for the hackathon demo. Local/dev fallback: sequencer calls `AuctionEscrow.release()` directly with the same `AuctionSettlementPacket`.
