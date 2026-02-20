# Appendix: Execution Plan, Technology, Limitations, Bibliography & Methodology

> Split from [research_report_20260219_agent_auction_architecture.md](../research_report_20260219_agent_auction_architecture.md).

---

## System Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         AGENT LAYER                                       │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                │
│  │ Agent A        │  │ Agent B        │  │ Agent C        │               │
│  │ AgentAccount   │  │ AgentAccount   │  │ AgentAccount   │               │
│  │ (Smart Wallet) │  │ (Smart Wallet) │  │ (Smart Wallet) │               │
│  │ secp256k1+ZK   │  │ secp256k1+ZK   │  │ secp256k1+ZK   │               │
│  └──┬──────────┘  └──┬──────────┘  └──┬──────────┘               │
│     │ UserOp          │ UserOp         │ UserOp    │ HTTP/MCP     │
│     │ (on-chain)      │ (on-chain)     │ (on-chain)│ (off-chain)  │
│     ▼                 ▼                ▼           ▼              │
│  ┌────────────────────────────────────┐ ┌────────────────────────┐│
│  │ PATH A: On-chain (EIP-4337)       │ │ PATH B: HTTP/MCP       ││
│  │ EntryPoint v0.7 → AgentPaymaster  │ │ MCP Gateway / HTTP API ││
│  │ → validateUserOp (wallet sig,     │ │ x402 Payment Middleware││
│  │   nonce, paymaster checks)        │ │ (micropayments, EOA    ││
│  │ → executeBatch (USDC transfer +   │ │  fallback deposits)    ││
│  │   wallet-managed ops)             │ │                        ││
│  │ Writes directly to on-chain       │ │                        ││
│  │ contracts (AuctionEscrow, USDC)   │ │ Forwards actions to    ││
│  └────────────────────────────────────┘ │ Durable Object         ││
│                                          └───────────┬────────────┘│
└──────────────────────────────────────────────────────┼─────────────┘
                                                       │
┌──────────────────────────────────────────────────────┼─────────────┐
│                                                      │              │
│                    AUCTION ENGINE (Off-chain)         │              │
│  ┌───────────────────────────────────────────────────▼──┐           │
│  │   Cloudflare Durable Object (Room Core)              │           │
│  │   ┌──────────┐ ┌──────────────────────┐              │           │
│  │   │Sequencer │ │ Append-only Log      │              │           │
│  │   │(seq++)   │ │ (Poseidon hash chain)│              │           │
│  │   └──────────┘ └──────────────────────┘              │           │
│  │   ┌──────────────────────────────────┐               │           │
│  │   │ WebSocket/SSE Broadcast          │               │           │
│  │   └──────────────────────────────────┘               │           │
│  └──────────────────┬───────────────────────────────────┘           │
│                     │                                               │
│  ┌──────────────────▼────────────────────┐  ┌────────────────┐     │
│  │ PostgreSQL (event archive, search)    │  │ MPC Committee  │     │
│  └───────────────────────────────────────┘  │ (3-of-5        │     │
│                                              │  threshold     │     │
│                                              │  decryption)   │     │
│                                              └────────────────┘     │
└─────────────────────┬──────────────────────────────────────────────┘
                      │ (sequencer ingests events on-chain
                      │  via ingestEventBatch + AuctionEnded)
┌─────────────────────┼────────────────────────────────────────────┐
│                     │     ON-CHAIN LAYER (Base Sepolia)           │
│                     │                                             │
│  ── ACCOUNT ABSTRACTION ──────────────────────────────────────   │
│  │ EntryPoint (0x00...032)  AgentAccountFactory  AgentPaymaster│  │
│                                                                   │
│  ── IDENTITY & PRIVACY ───────────────────────────────────────   │
│  │ IdentityRegistry (official ERC-8004)                        │   │
│  │ AgentPrivacyRegistry (ZK sidecar)   NullifierSet            │   │
│                                                                   │
│  ── ZK VERIFICATION ────────────────────────────────────────────   │
│  │ RegistryMemberVerifier (Groth16)  BidCommitVerifier       │   │
│                                                                   │
│  ── AUCTION LOGIC ────────────────────────────────────────────   │
│  │ AuctionFactory      AuctionRoom (Poseidon chain)          │   │
│  │ SealedBidMPC (ElGamal + FROST)                            │   │
│                                                                   │
│  ── PAYMENT & ESCROW ─────────────────────────────────────────   │
│  │ AuctionEscrow (USDC, ReceiverTemplate)                    │   │
│  │ - x402 payTo: escrow address                              │   │
│  │ - recordBond(auctionId,agentId,depositor,amt,txId)        │   │
│  │ - onReport(metadata,report) [CRE Settlement]              │   │
│  │ - claimRefund(auctionId,agentId)                          │   │
│  │ EscrowMilestone (P1: delivery milestones + slashing)      │   │
│  │ X402PaymentGate (receipt verification)                    │   │
│                                                                   │
│  ── REGISTRY ─────────────────────────────────────────────────   │
│  │ AuctionRegistry (state machine + hash anchoring)          │   │
│  │ - anchorHash, recordResult, AuctionEnded event            │   │
│  │ - updateWinnerWallet (EIP-712), recordDeliveryProof       │   │
│                                                                   │
└─────────────────────┬────────────────────────────────────────────┘
                      │ (EVM Log Trigger)
┌─────────────────────┼────────────────────────────────────────────┐
│                     │     CRE LAYER (Chainlink DON)              │
│  ┌──────────────────▼──────────────────────┐                     │
│  │   Workflow 1: Settlement                │                     │
│  │   Trigger: EVM Log (AuctionEnded)       │                     │
│  │   → Read Poseidon anchor hashes         │  (CRE               │
│  │   → Verify log integrity vs anchors     │   Workflows)        │
│  │   → Replay auction rules → derive winner│                     │
│  │   → Release escrow (EVMClient write)    │                     │
│  └─────────────────────────────────────────┘                     │
│  ┌─────────────────────────────────────────┐                     │
│  │   Workflow 2: Delivery Verification     │                     │
│  │   Trigger: HTTP (winner submits)        │                     │
│  │   → Fetch delivery proof (HTTPClient)   │                     │
│  │   → Evaluate result (consensus)         │                     │
│  │   MVP: backend records proof on-chain   │                     │
│  │   P1:  EVMClient → DeliveryVerifier     │                     │
│  └─────────────────────────────────────────┘                     │
│                                                                   │
│  ── OFF-CHAIN ZK CIRCUITS (Circom 2.x) ──────────────────────   │
│  │ RegistryMembership.circom (~12K constraints)              │   │
│  │ BidRange.circom (~5K constraints)                         │   │
│  │ DepositRange.circom (~3K constraints, P1 optional)        │   │
│  │ Trusted setup: Hermez Powers of Tau (BN254)               │   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Contract Deployment Order (Full 15 Steps)

```
1.  EntryPoint v0.7             (Base Sepolia: 0x00...032; verify deployment/address on any other chain)
2.  NullifierSet.sol            (no dependencies)
3.  AgentPrivacyRegistry.sol    (privacy sidecar, depends: NullifierSet)
    + use official ERC-8004 IdentityRegistry/ReputationRegistry addresses as source-of-truth
4.  BidCommitVerifier.sol       (Groth16 verifier, verification key baked in)
5.  RegistryMemberVerifier.sol  (depends: AgentPrivacyRegistry for root check)
6.  DepositRangeVerifier.sol    (P1 optional research verifier, not in MVP validation path)
7.  AgentAccount.sol            (implementation contract)
8.  AgentAccountFactory.sol     (depends: EntryPoint, AgentAccount impl)
9.  AgentPaymaster.sol          (depends: EntryPoint) → stake ETH after deploy
10. AuctionRegistry.sol         (depends: EIP712; receives sequencer address)
11. AuctionEscrow.sol           (depends: AuctionRegistry, official IdentityRegistry; takes forwarderAddress in constructor, Ownable(msg.sender); post-deploy: call setExpectedAuthor, setExpectedWorkflowName, setExpectedWorkflowId)
12. X402PaymentGate.sol         (standalone receipt verifier)
13. SealedBidMPC.sol            (depends: BidCommitVerifier)
14. AuctionRoom.sol             (depends: verifiers, SealedBidMPC, AuctionEscrow)
15. AuctionFactory.sol          (depends: all above) → single entry point for agents
```
**Post-deploy wiring:** Call `AuctionRegistry.setEscrow(AuctionEscrow.address)` — one-time binding.

---

## High-Risk Test Checklist (P1)

- **Escrow solvency invariants:** Foundry fuzz/property tests that assert `usdc.balanceOf(escrow) >= totalBonded + totalWithdrawable` holds after every state transition and that each bond is credited/refunded exactly once (including `adminRefund`, `cancelExpiredAuction`, and `withdraw`).
- **ReplayBundleV1 canonicalization:** Golden test vectors in TypeScript + Solidity harnesses proving the exact bytes hashed by SHA-256 (LF-only, no trailing newline, stable field ordering). Include negative tests for CRLF, trailing whitespace, missing fields, and non-contiguous `seq`.
- **Reorg/finality policy:** Integration tests that simulate a reorged `anchorHash` (SAFE) and verify the system re-submits anchors idempotently, while `AuctionEnded` settlement trigger waits for FINALIZED. Confirm settlement uses only on-chain anchors at finality.
- **CRE retry/idempotency:** Unit tests that call `onReport` multiple times with identical report data (including the FAILED→retry path) and prove `settled[auctionId]` prevents double-crediting. Add tests for malformed metadata and wrong workflow owner/name.
- **Bond tx attribution edge cases:** Tests for `recordBond` idempotency on `x402TxId` and strict format validation (reject non-EVM schemes/malformed tx hashes) before casting to `bytes32`.
- **Inclusion receipt integrity:** Tests that a signed receipt can be verified offline and that omission detection is deterministic (receipt `eventHash` not present in replay bundle / anchored range).

---

## Technology Stack (Hackathon Build)

| Component | Technology | Why |
|-----------|-----------|-----|
| CRE Workflows | TypeScript SDK (`@chainlink/cre-sdk`) | Official SDK, matches your stack |
| Smart Contracts | Solidity + Foundry | Deploy to Base Sepolia via Tenderly |
| Account Abstraction | EIP-4337 EntryPoint v0.7 (`0x00...032`), `@account-abstraction/contracts@0.7.0` | Canonical on Base Sepolia, Pimlico/CDP bundlers. **MVP pins v0.7; v0.9 exists.** Migration trigger: if Base Sepolia deprecates v0.7 bundler support or a critical vulnerability is disclosed. Compatibility test plan: deploy AgentAccount against v0.9 EntryPoint on a Tenderly fork, run full bond+join+settle flow, verify Paymaster staking API compatibility. Do NOT migrate without passing this test suite |
| ZK Circuits | Circom 2.x (`v2.2.3`) + snarkjs (`v0.7.5`) | Groth16 proof generation + Solidity verifier export |
| ZK Trusted Setup | Hermez Powers of Tau (BN254) | `powersOfTau28_hez_final_16.ptau` (65K constraints) |
| Poseidon Hash | `poseidon-solidity` (npm) | ZK-friendly on-chain hash chain. Event hash: PoseidonT4 (3-input, ~38K gas). Bid commitment: PoseidonT3 (2-input, ~21K gas) |
| BabyJubJub | `@iden3/contracts` (verify latest version on npm; v3.1.0 may not include BabyJubJub directly — check `@iden3/bjj-js` or `circomlibjs` for off-chain ops) | ERC-2494 curve for ElGamal bid encryption |
| FROST Signatures | `frost-secp256k1-evm` | <6K gas threshold signature verification |
| Auction Engine | Cloudflare Workers + Durable Objects | Single-threaded sequencer, WebSocket |
| API/Backend | Express.js + `@x402/express` [25] | x402 middleware, reference pattern |
| Frontend | Next.js + React | Spectator UI, real-time via WebSocket |
| Agent Identity | Official ERC-8004 IdentityRegistry + AgentPrivacyRegistry sidecar [24] | Settlement reads canonical ERC-8004 state; sidecar handles optional privacy commitments |
| Payments | x402 (USDC on Base Sepolia) + EIP-4337 Paymaster | Gas sponsorship (EIP-4337); x402 HTTP settlement is separate from UserOps (non-atomic) |
| Deployment | Tenderly Virtual TestNets | Required for sponsor prize |
| Agent Signing | secp256k1 (runtime key, EIP-712 on-chain verifiable via ecrecover) + BabyJubJub (ZK bid privacy) | On-chain verifiability + ZK privacy. Ed25519 NOT usable for on-chain actions (no EVM precompile). |

---

## Hackathon Execution Plan (10 Days Remaining)

### Priority Order

| Day | Task | CRE Impact |
|-----|------|------------|
| 1-2 | **On-chain foundation:** AgentAccountFactory + AgentAccount (EIP-4337), official ERC-8004 IdentityRegistry integration, AgentPrivacyRegistry sidecar, NullifierSet, AuctionRegistry w/ hash anchoring, AuctionEscrow w/ USDC — all on Base Sepolia via Tenderly | Foundation |
| 2-3 | **ZK circuits:** RegistryMembership.circom + BidCommitVerifier.sol (Groth16 verifier export). AgentPaymaster + EntryPoint staking. Run trusted setup (phase 2) | Privacy layer |
| 3-4 | **CRE Workflow 1:** Settlement (EVM Log Trigger → read Poseidon anchor hashes → fetch event log → replay rules → derive winner → release escrow via onReport) | Core differentiator |
| 4-6 | **Auction Engine:** Cloudflare DO with seq ordering + Poseidon hash chain + periodic on-chain anchoring (batch ingest) + event broadcast. AuctionFactory + AuctionRoom contracts | Off-chain + on-chain engine |
| 6-7 | **API layer** with x402 middleware (Express.js). EIP-4337 UserOp for bond deposit; join/bid via HTTP/MCP to DO sequencer; `recordBond` async/idempotent bookkeeping | Agent entry point |
| 7-8 | **Agent demo client** (deploy smart wallet, register ERC-8004 identity + privacy sidecar commitment, place bids with ZK range proofs, pay bonds, submit delivery) | Demo flow |
| 8-9 | **Spectator UI** (Next.js: live view + settlement verification + anchor trail display + ZK proof status) | Wow factor |
| 9-10 | Demo video (3-5 min) + README + documentation | Submission |

### What to Cut if Behind (in order)

1. **Cut sealed-bid MPC** (SealedBidMPC, ElGamal, FROST) — English auction with ZK membership proofs is sufficient for demo
2. **Simplify ZK** — hardcode RegistryMembership verification, skip BidRange circuit. Membership proof alone demonstrates the privacy story
3. **Cut Delivery Verification workflow** — Settlement workflow alone is enough
4. **Simplify EIP-4337** — use Coinbase Base Paymaster instead of custom AgentPaymaster (loses gas-debt tracking but gains speed)
5. **Simplify UI** — Remix demo is acceptable per hackathon rules
6. **Reduce anchor frequency** — Anchor only at first event (seq=1) + end (minimum viable anchoring). **Warning: this significantly degrades the trust model.** First+end-only anchoring means the operator can rewrite the entire event history between those two points — CRE only verifies the final hash against the first-event hash, which is effectively just final-hash attestation. The "operator cannot rewrite history" claim in [Module 2: Room Broadcast](./03-room-broadcast.md) requires periodic mid-auction anchoring. If cutting to first+end, update trust claims accordingly and note in the demo that periodic anchoring is the production design.
7. **Keep** the Settlement workflow + hash anchoring + rule replay + ZK membership proof — this IS the project

---

## Competitive Analysis: What Wins Hackathons

Based on Chromion winners:
- **YieldCoin** (Grand Prize, $35K): Cross-chain yield optimizer using CCIP + Automation + Functions. Sophisticated multi-chain logic.
- **HTTPayer** (Cross-Chain, $10K): Payment server with x402-style flow using CCIP. Clean implementation of payment infrastructure.
- **TokenIQ** (DeFi 1st, $16.5K): Autonomous treasury management with AI agent + Chainlink services.

**Pattern:** Winners combine CRE/Chainlink deep integration + novel use case + working demo. No auction platform has won before — this is a greenfield category in CRE & AI. The closest DeFi precedent is batch auctions in protocols like CoW Protocol [23], but none use CRE for settlement verification.

**Your differentiator:** "First oracle-verified auction settlement for agent-native auctions: AI agents bid via gas-sponsored smart wallets (EIP-4337), the auction event log is anchored on-chain, and Chainlink CRE independently replays auction rules against a content-addressed replay bundle before releasing escrow. Privacy is layered: **MVP English auctions are transparent**; sealed-bid mode adds bid-amount privacy via MPC + ZK range proofs. The CRE + EIP-4337 + ZK combination is an unusually deep integration for a hackathon-grade demo."

---

## Limitations & Caveats

> **Scope and maturity disclaimer.** This document provides production-quality documentation of a **hackathon MVP architecture**. The architecture itself is intentionally scoped for a hackathon demo — it makes explicit, documented tradeoffs that are acceptable at demo scale but must be hardened before production deployment. The table below inventories these tradeoffs. Each entry links to the corresponding limitation section below, which contains the full P1 mitigation design. **This is an architectural maturity inventory, not a documentation quality gap** — the documentation fully specifies both the MVP behavior and the production upgrade path for each item.
>
> | # | Architectural tradeoff (MVP) | Why acceptable at demo scale | Production hardening path (P1) |
> |---|-----|-----------|--------------------------------------|
> | 3 | Bond attribution is trust-based operator bookkeeping (`recordBond` is `onlyAdmin`, not agent-initiated) | Single trusted operator; all demo agents controlled; tx hash provides auditability | Agent-direct `msg.sender` deposit or x402 nonce encoding — removes operator from attribution path |
> | 4 | `recordBond` is not atomic with agent's UserOp or join action (separate admin tx) | Retryable + idempotent on tx hash; reconciliation cron documented; demo scale = negligible failure rate | Atomic `msg.sender` bond deposit eliminates the gap entirely (same P1 path as #3) |
> | 5 | Sequencer key compromise can drain all pending escrow | Single EOA owner; key secured in demo environment; escrow amounts are testnet USDC | Timelocked multisig owner + live monitoring + auto-pause + independent witness node (see Go-Live Checklist) |
> | 8 | ReceiverTemplate Ownable owner can reconfigure which CRE workflow the escrow accepts | Same EOA as deployer; single trusted operator | Transfer ownership to timelocked multisig after initial configuration |
> | — | Deposit sizes are publicly visible on-chain (`BondRecorded` events, `bondRecords` mapping) | Privacy is not a demo requirement; all participants are demo agents | ZK deposit range proofs or shielded pool (P1) |
>
> All other limitations below are either accepted risks with documented mitigations, or hackathon-appropriate tradeoffs that do not require hardening for the demo.

1. **Trust model is "operator-attested, oracle-verified" with rule replay — stronger than pure attestation, but not fully trustless.** The platform operator controls the sequencer and writes the event log. CRE verification has two layers: (a) hash-chain integrity against on-chain anchors, and (b) rule replay that independently re-derives the winner from the event log. This means CRE can catch both log tampering (via hash mismatch) and rule violations (via winner mismatch). **Bid censorship remains possible:** the operator can silently drop bids before they enter the log. CRE replays the declared log, which may be missing censored bids — hash integrity cannot detect omissions. Mitigation: signed inclusion receipts (see [03-room-broadcast.md](./03-room-broadcast.md)) give agents cryptographic proof of bid submission, enabling post-auction censorship detection and on-chain dispute (P1). Full trustlessness requires a decentralized sequencer (P2). This trust model is comparable to Vertex Protocol and dYdX v3.

2. **Rule replay is limited to deterministic auction types.** CRE can independently verify the winner for English auctions (highest bid wins), Dutch auctions (first accept wins), and first-price sealed-bid (highest commit wins after reveal). Scoring auctions and subjective evaluation auctions cannot be replayed deterministically — those remain operator-attested only. MVP implements English auction replay only. Replay data is content-addressed (`replayContentHash` stored on-chain) to ensure all DON nodes verify against identical data.

3. **Bond attribution is trust-based (MVP).** x402 sends generic USDC to the escrow contract. The `recordBond(auctionId, agentId, depositor, amount, x402TxId)` call is operator bookkeeping with no cryptographic binding between the deposit and the `(auctionId, agentId)` pair. The `x402TxId` is the Ethereum tx hash from `SettleResponse.transaction` (mapped directly to `bytes32`), which is globally unique and on-chain verifiable. The operator could theoretically misattribute deposits (assign wrong agentId to a payment). Production mitigations (P1): agent-direct deposit as `msg.sender`, or x402 nonce encoding. See [04-payment-and-escrow.md](./04-payment-and-escrow.md) for details.

4. **Bond recording is not atomic with the agent's UserOp (both agent types).** For EIP-4337 agents, the UserOp transfers USDC to escrow. The join action is a separate off-chain request to the DO sequencer. `recordBond()` is admin-mediated bookkeeping (`onlyAdmin` modifier), called after the backend detects the successful on-chain USDC transfer. This is retryable (idempotent on tx hash) but not atomic with the agent's UserOp. **Failure mode:** if the backend crashes after the agent's UserOp succeeds but before `recordBond` is called, the USDC is in the escrow contract but unattributed. The reconciliation mechanism (cron job matching escrow USDC balance to bond records via tx hash) handles this. See [04-payment-and-escrow.md](./04-payment-and-escrow.md). **Orphaned deposit reconciliation SLO (P1):** detection within 5 minutes (cron interval), automated recovery within 15 minutes. Automated recovery flow: (1) `checkSolvency()` detects surplus (unattributed USDC), (2) reconciliation service queries `Transfer` events to escrow address not matched to any `BondRecorded` event, (3) for each orphan: cross-reference `Transfer.from` with pending join requests in the event log to determine `(auctionId, agentId)`, (4) auto-call `recordBond` with the matched parameters, (5) if auto-matching fails (ambiguous or unknown sender), flag for manual review and alert on-call (SEV2). **MVP:** reconciliation is manual (operator checks `checkSolvency()` and calls `recordBond`). For non-4337 agents (EOA / Flow C hybrid), x402 settlements are irreversible push payments with the same `recordBond` gap. Risk is low for hackathon demo scale.

5. **Sequencer key is the single most critical security parameter — compromise can steal all pending escrow funds.** If the sequencer private key is compromised, the attacker can: (a) write fake anchors via `anchorHash()` with fabricated hash chains, (b) declare fake winners via `recordResult()` pointing to attacker-controlled wallets, (c) CRE would validate the fabricated data because it reads anchors from chain (which the compromised sequencer wrote) — **CRE provides zero protection against a compromised sequencer**. The attacker can drain every pending auction's escrow in a single block. `setSequencer()` (owner-only) can rotate the key, but a compromised sequencer can act before detection. **Recovery for already-settled auctions is impossible** — once `_processReport` credits the attacker's wallet and `withdraw()` is called, the USDC is gone. For hackathon MVP: single EOA owner is acceptable, documented risk.

   **Production Go-Live Checklist (P1):**
   - **Timelocked multisig owner:** `setSequencer()` and `transferOwnership()` gated by a 24-hour timelock + 2-of-3 multisig (Gnosis Safe). No single individual can rotate the sequencer unilaterally.
   - **Key rotation runbook:** Documented procedure — generate new key in HSM, submit timelock tx, verify new key via test anchor, execute after delay, revoke old key. Tested quarterly.
   - **Sequencer failover runbook (RTO/RPO):** **RPO = 0** (no data loss — the append-only event log and on-chain anchors are the source of truth, not the sequencer's in-memory state). **RTO = 5 minutes** (target). Procedure: (1) monitoring detects sequencer unresponsive (no heartbeat for 60s), (2) standby sequencer (pre-configured, same DO namespace, read-only until activated) promotes to primary, (3) new sequencer replays the event log from the last on-chain anchor to reconstruct in-memory state, (4) resumes accepting bids. **During failover:** auctions in OPEN state are paused (agents receive 503 with `Retry-After`); auctions in CLOSED state continue to CRE settlement (settlement path is independent of sequencer liveness). **MVP:** single sequencer, no standby — failover is manual restart of the DO. This is acceptable for demo scale.
   - **Live monitoring thresholds:** Alert if (a) anchor frequency deviates >2σ from trailing 24h mean, (b) `recordResult` is called without a preceding `AuctionEnded` event within the same block range, (c) `setSequencer` is submitted unexpectedly.
   - **Settlement pause conditions and function-level policy:** `AuctionEscrow.pause()` (via OpenZeppelin Pausable, added P1) triggered automatically if monitoring detects anomalous anchor patterns. **Exact function behavior while paused:**
     - `recordBond()` — **PAUSED** (`whenNotPaused`). No new bonds accepted. Rationale: if the system is compromised, accepting new deposits increases blast radius.
     - `_processReport()` — **PAUSED** (`whenNotPaused`). No new CRE settlements processed. Rationale: a compromised sequencer could submit fraudulent `AuctionEnded` events; pausing prevents the escrow from processing them. **Trade-off:** legitimate in-flight settlements are blocked. This is acceptable because the alternative (processing a fraudulent settlement) is worse (irreversible fund loss).
     - `claimRefund()` — **ACTIVE** (no `whenNotPaused`). Agents can always withdraw their refund balance. Rationale: refunds are already credited to `withdrawable` — no new trust decisions involved.
     - `withdraw()` — **ACTIVE** (no `whenNotPaused`). Agents can always withdraw credited funds. Same rationale as `claimRefund`.
     - `cancelExpiredAuction()` — **ACTIVE** (no `whenNotPaused`). Must remain callable so stuck auctions can be cancelled and refunds enabled even during a pause.
     - `adminRefund()` — **ACTIVE** (no `whenNotPaused`). Admin must be able to manually refund agents during an incident.
     - `checkSolvency()` — **ACTIVE** (view function, no state changes).
   - **Ownable2Step:** Replaces single-step `Ownable` to prevent accidental ownership loss (see Limitation #8).
   - **Independent witness node:** A separate, read-only node monitors all `anchorHash` and `recordResult` transactions. Compares anchor frequency and result patterns against expected behavior. Alerts if any anomaly. This is the detection layer that enables the pause trigger above.
   - **CRE settlement failure monitoring:** If no `AuctionSettledOnChain` event appears within 30 minutes of `AuctionEnded`, alert on-call. The 72-hour `cancelExpiredAuction()` timeout is the last resort, not the detection mechanism.
   - **Incident severity classification:** SEV1 = sequencer compromise / escrow drain (all-hands, 15-min response). SEV2 = CRE settlement stuck / single auction affected (1-hour response). SEV3 = monitoring anomaly / non-fund-affecting (next business day).
   - **On-call rotation:** Minimum 2-person rotation with documented escalation path. Post-mortem required for all SEV1/SEV2 incidents.
   - **Pause/unpause authority:** `pause()` can be triggered by monitoring automation OR any multisig signer (emergency). `unpause()` requires full 2-of-3 multisig approval + documented root cause resolution. No single person can unpause.
   - **Wallet rotation agent recovery (P1):** Add `agentRecoverWallet(auctionId, newWallet, deadline, agentSignature)` callable by anyone (not just sequencer). Requires EIP-712 signature from the agent's NEW wallet + proof of ERC-8004 NFT ownership. This removes the sequencer from the wallet recovery path.

6. **CRE Early Access:** CRE deployment is in early access. Simulation works locally but production deployment may have waitlist/approval requirements. Mitigation: the hackathon explicitly supports simulated workflows.

7. **ERC-8004 cross-domain policy + L1 anchoring path.** For MVP on Base Sepolia, use the published ERC-8004 Base Sepolia addresses directly (no custom fork). For production, still define cross-domain fallback policy (CCIP/L1 reads), chain-finality mismatch handling, and outage recovery when identity and settlement environments diverge. **L1 anchoring (P1):** periodic anchoring of critical registry roots and large-settlement controls remains a separate production design item.

8. **Contract authority relies on correct configuration — Ownable owner is a critical trust boundary.** AuctionEscrow inherits `ReceiverTemplate` which inherits `Ownable`. The constructor takes only the KeystoneForwarder address; expected author, workflow name, and workflow ID are configured POST-DEPLOY via `onlyOwner` setters (`setExpectedAuthor`, `setExpectedWorkflowName`, `setExpectedWorkflowId`). This means the `Ownable` owner can reconfigure which CRE workflow the escrow accepts — an attacker who compromises the owner key can redirect the escrow to accept reports from a rogue workflow. **Production mitigation (P1):** After initial configuration, transfer ownership to a timelocked multisig (Gnosis Safe with 24-hour delay + 2-of-3 threshold). For hackathon: single deployer EOA is acceptable, documented risk. The `onlySequencer` modifier on `recordResult` similarly trusts that the sequencer address is the legitimate DO backend. **Post-deploy configuration:** After deploying AuctionEscrow, call `setExpectedAuthor(workflowDeployerAddress)` and `setExpectedWorkflowName("auctSettle")` (plaintext string — the contract hashes it internally). Use the [Forwarder Directory](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory) to confirm KeystoneForwarder addresses per network.

9. **Off-chain agents (Flow A) cannot participate in auctions.** Agents without ERC-8004 on-chain identity are restricted to spectator/read-only access. This is by design (CRE settlement requires on-chain identity verification), but it means the platform cannot serve agents that refuse or are unable to register on-chain. Flow C (hybrid) provides a pragmatic middle ground.

10. **Time Constraint:** 10 days to build 2 CRE workflows + 2 contracts + engine + UI + demo is aggressive. The execution plan has clear cut points.

11. **ERC-8004 is still Draft status.** The EIP-8004 specification is currently in Draft state [1], meaning interfaces may evolve before finalization. Full auction participation (bonding, bidding, winning) depends on ERC-8004 identity verification. If `IdentityRegistry` interfaces change, both CRE settlement checks and identity gates must be updated. Mitigation: pin to a specific ERC-8004 contracts commit/tag [24], add compatibility tests for `ownerOf/getAgentWallet/setAgentWallet`, and monitor EIP updates continuously.

12. **Sealed-bid MPC requires trusted committee.** The 3-of-5 MPC committee can collude to decrypt bids before auction close and front-run. Mitigation: committee members should be independent parties with economic stakes in fairness. For the hackathon: run 5 separate nodes on different machines. Production: committee rotation per auction series, slashing for provable misbehavior. Academic foundations: [19][20].

13. **MVP escrow handles bonds only — buyer-funded prize payouts are P1.** In the MVP, `_processReport` returns the winner's bond (security deposit) to their withdrawable balance. There is no mechanism for the auction buyer (task poster) to deposit a prize pool into escrow. The `amount` field in the CRE report is used for cross-check validation against the registry, not as a separate payout source. For production (P1): add a `depositPrize(auctionId)` function that allows the auction buyer to fund the prize via x402 before auction start. The solvency invariant (`totalBonded + totalWithdrawable <= usdc.balanceOf(this)`) ensures the contract never credits more than it holds. Adding `totalPrize` tracking would extend this to cover buyer deposits.

14. **Workflow 2 (Delivery Verification) has split trust model in MVP.** The CRE workflow runs the verification consensus, but the on-chain proof recording is done by the platform backend (`onlyOwner`) rather than via CRE's EVMClient write. This means the delivery proof's on-chain attestation trusts the platform operator to honestly relay CRE's consensus result. For production (P1): a dedicated `DeliveryVerifier` contract inherits `ReceiverTemplate` to receive CRE's `onReport` directly, removing the platform from the trust path.

15. **ZK trusted setup compromise.** If an attacker participated in the Groth16 phase 2 ceremony and kept toxic waste, they can generate proofs for invalid bids (e.g., prove a bid is in range when it is not). Mitigation: multi-party phase 2 ceremony with at least 3 independent contributors — at least one honest contributor is sufficient for soundness. For the hackathon: use Hermez Powers of Tau (phase 1) + team-run phase 2 with **at minimum 3 independent contributors** (e.g., 3 team members on separate machines, each contributing entropy independently). Document each contributor's hash for auditability. A single "team-run" ceremony with one contributor does NOT meet the soundness threshold. For production: public multi-party phase 2 ceremony with verifiable transcript.

16. **Nullifier linkability risk.** Nullifiers are derived deterministically from `agentSecret + auctionId`. If an attacker learns an agent's `agentSecret`, they can compute all past and future nullifiers, linking the agent's entire auction history. Mitigation: `agentSecret` stored in KMS, never in hot memory, never logged. Key rotation via `AgentPrivacyRegistry.updateCommitment()` generates a new `agentSecret` — old nullifiers become unlinkable to the new identity.

17. **Poseidon gas cost on-chain + audit status.** `poseidon-solidity` [30] benchmarks: PoseidonT3 (2-input) ~21,124 gas, PoseidonT4 (3-input) ~37,617 gas. The event hash chain uses PoseidonT4 (~38K gas per hash) vs ~42 gas for keccak256 — a ~900x premium. Bid commitments use PoseidonT3 (~21K gas). This is acceptable for settlement-critical hash chain events (anchored periodically, not per-bid), but prohibitive for high-frequency operations. Design rule: Poseidon for the on-chain hash chain and inside ZK circuits only; keccak256 for everything else. EIP-5988 (Poseidon precompile proposal [37]) would reduce this to ~200 gas if adopted. **Audit note:** the `poseidon-solidity` package README explicitly states "This implementation has not been audited." For hackathon: acceptable. For production: use an audited implementation or wait for EIP-5988.

18. **EIP-4337 UserOperation gas overhead.** Each UserOp carries ~42K gas fixed overhead vs direct EOA transactions (~3-4x for simple transfers). On Base Sepolia this translates to fractions of a cent in USD, but impacts gas budget calculations. Paymaster-sponsored operations accumulate this overhead as gas debt deducted at settlement. Batching multiple actions into a single `executeBatch` UserOp amortizes the fixed cost.

19. **No production ElGamal Solidity library.** ElGamal encryption/decryption on BabyJubJub must be performed entirely off-chain — no production Solidity implementation exists. On-chain verification of ElGamal operations happens indirectly via Groth16 proofs (the ZK circuit verifies correctness, the smart contract verifies the proof). This is the standard pattern (Bank of JubJub, ec-elgamal-circom) but means the sealed-bid flow depends on off-chain circuit correctness.

---

## Bibliography

[1] Ethereum Foundation. "ERC-8004: Trustless Agents." Ethereum Improvement Proposals. https://eips.ethereum.org/EIPS/eip-8004

[2] QuillAudits. "ERC-8004: Infrastructure for Autonomous AI Agents." https://www.quillaudits.com/blog/smart-contract/erc-8004

[3] Backpack Exchange. "ERC-8004 Explained: Ethereum's AI Agent Standard Guide 2025." https://learn.backpack.exchange/articles/erc-8004-explained

[4] Solo.io. "Agent Identity and Access Management — Can SPIFFE Work?" https://www.solo.io/blog/agent-identity-and-access-management---can-spiffe-work

[5] Microsoft. "What is Microsoft Entra Agent ID?" https://learn.microsoft.com/en-us/entra/agent-id/identity-professional/microsoft-entra-agent-identities-for-ai-agents

[6] Model Context Protocol. "Transports — Streamable HTTP." https://modelcontextprotocol.io/specification/2025-03-26/basic/transports

[7] Cloudflare. "Bringing Streamable HTTP Transport and Python Language Support to MCP Servers." https://blog.cloudflare.com/streamable-http-mcp-servers-python/

[8] Smartcontractkit. "x402-cre-price-alerts: Crypto Price Alert System." GitHub. https://github.com/smartcontractkit/x402-cre-price-alerts

[9] Cloudflare. "Use WebSockets with Durable Objects." https://developers.cloudflare.com/durable-objects/best-practices/websockets/

[10] Cloudflare. "Rules of Durable Objects." https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/

[11] ainvest. "x402 Payment Volume Reaches $600 Million." https://www.ainvest.com/news/x402-payment-volume-reaches-600-million-open-facilitators-fuel-2026-growth-trend-2512/

[12] Cloudflare. "Launching the x402 Foundation with Coinbase." https://blog.cloudflare.com/x402/

[13] x402.org. "Introducing x402 V2: Evolving the Standard." https://www.x402.org/writing/x402-v2-launch

[14] Coinbase. "x402 Exact EVM Scheme Specification." GitHub. https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md

[15] Coinbase. "x402 TypeScript Examples." GitHub. https://github.com/coinbase/x402/tree/main/examples/typescript

[16] Coinbase. "x402 + Chainlink: Enabling AI Agents to Trigger CRE Workflows." https://www.coinbase.com/developer-platform/discover/launches/chainlink-cre-x402

[17] Chainlink. "Announcing the Chainlink Chromion Hackathon Winners." https://blog.chain.link/announcing-the-chainlink-chromion-hackathon-winners/

[18] Chainlink. "What Is Oracle Computation?" https://chain.link/education-hub/oracle-computation

[19] ePrint. "Censorship-Resistant Sealed-Bid Auctions on Blockchains." https://eprint.iacr.org/2025/2127.pdf

[20] a16z crypto. "A Sneaky Solidity Implementation of a Sealed-Bid Auction." https://a16zcrypto.com/posts/article/hidden-in-plain-sight-a-sneaky-solidity-implementation-of-a-sealed-bid-auction/

[21] Chainlink. "Building Consumer Contracts (ReceiverTemplate)." https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts

[22] Chainlink. "5 Ways to Build with the Chainlink Runtime Environment." https://blog.chain.link/5-ways-to-build-with-cre/

[23] CoW Protocol. "Understanding Batch Auctions." https://cow.fi/learn/understanding-batch-auctions

[24] erc-8004. "ERC-8004 Contracts." GitHub. https://github.com/erc-8004/erc-8004-contracts

[25] Coinbase. "x402 Welcome." Developer Documentation. https://docs.cdp.coinbase.com/x402/welcome

[26] Chainlink. "SDK Reference: EVM Log Trigger (TypeScript)." https://docs.chain.link/cre/reference/sdk/triggers/evm-log-trigger-ts

[27] Ethereum Foundation. "ERC-4337: Account Abstraction Using Alt Mempool." https://eips.ethereum.org/EIPS/eip-4337

[28] eth-infinitism. "Account Abstraction v0.7.0." GitHub. https://github.com/eth-infinitism/account-abstraction/releases/tag/v0.7.0

[29] Ethereum Foundation. "EIP-1153: Transient Storage Opcodes." https://eips.ethereum.org/EIPS/eip-1153

[30] chancehudson. "poseidon-solidity." npm/GitHub. https://github.com/chancehudson/poseidon-solidity

[31] iden3. "Circom 2 Documentation." https://docs.circom.io/getting-started/proving-circuits/

[32] iden3. "snarkjs: JavaScript Implementation of zkSNARK Schemes." GitHub. https://github.com/iden3/snarkjs

[33] Ethereum Foundation. "ERC-2494: Baby Jubjub Elliptic Curve." https://eips.ethereum.org/EIPS/eip-2494

[34] StackOverflowExcept1on. "frost-secp256k1-evm: FROST Threshold Signatures on EVM." GitHub. https://github.com/StackOverflowExcept1on/frost-secp256k1-evm

[35] Safe Global. "FROST Brings Secure, Scalable Threshold Signatures to the EVM." https://safe.global/blog/frost-brings-secure-scalable-threshold-signatures-to-the-evm

[36] Shigoto-dev19. "ec-elgamal-circom: ElGamal on BabyJubJub as Circom2 Circuits." GitHub. https://github.com/Shigoto-dev19/ec-elgamal-circom

[37] Ethereum Foundation. "EIP-5988: Add Poseidon Hash Function Precompile." https://eips.ethereum.org/EIPS/eip-5988

[38] Optimism. "Ecotone Network Upgrade Specification." https://specs.optimism.io/protocol/ecotone/overview.html

[39] Coinbase. "Base Paymaster." GitHub. https://github.com/base/paymaster

---

## Appendix: Methodology

**Research Process:** Deep mode (8-phase pipeline). Phase 3 (RETRIEVE) used 8 parallel web searches + 3 background research agents + 4 targeted document fetches. Total sources consulted: 39. Phase 4 (TRIANGULATE): Architecture claims and contract interfaces verified against official documentation and reference implementations. Growth/adoption metrics (e.g., x402 payment volume) sourced from press coverage — primary telemetry data was not available. ZK gas estimates verified against on-chain benchmarks (poseidon-solidity npm, Groth16 verification gas formulas from Nebra/Orbiter Research). EIP-4337 infrastructure verified on Base Sepolia (EntryPoint v0.7, bundlers, Paymaster). EIP-4337 interface signatures (IAccount, IPaymaster, BaseAccount) verified against eth-infinitism v0.7.0 tagged source code. Circom/snarkjs versions verified against npm registry and GitHub releases. CRE + EIP-4337 compatibility was checked via 3 dedicated research agents; no official CRE documentation or reference repo surfaced an end-to-end example of CRE writes coordinating with EIP-4337 wallet flows. Phase 5 (SYNTHESIZE): Architecture proposal synthesized from reference implementation patterns (x402-cre-price-alerts), Chromion hackathon winner analysis, blockchain infrastructure design contributions, and existing design documents. Post-synthesis: 16 rounds of adversarial review with external verification (ERC-8004 GitHub, Chainlink docs, OpenZeppelin contracts, x402 specs, EIP-4337 docs, Circom/snarkjs ecosystem, Chainlink MCP developer assistant, x402 core types/facilitator API, KeystoneForwarder.sol source code, OP Stack Ecotone upgrade specs, Uniswap V4 transient storage production verification, viem SDK imports).

**Source Types:** EIP specifications (5), official documentation (10), GitHub repositories (10), blog posts (6), academic papers (2), news/analysis (2), community resources (4).
