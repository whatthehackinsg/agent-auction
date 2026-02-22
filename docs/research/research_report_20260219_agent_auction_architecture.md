# Deep Research Report: Agent-Native Auction Platform Architecture

**Research Mode:** Deep | **Date:** 2026-02-19 | **Target:** Chainlink Convergence Hackathon (CRE & AI Track)

---

## Executive Summary

This report analyzes all 7 modules of the agent-native auction platform design and proposes a full-stack architecture integrating CRE oracle verification, EIP-4337 Account Abstraction, ZK privacy proofs, and sealed-bid MPC — optimized for the Chainlink Convergence hackathon CRE & AI track ($17K first prize) while remaining eligible for Tenderly ($5K) and World ID ($5K) sponsor prizes.

**Key Finding:** The `smartcontractkit/x402-cre-price-alerts` reference implementation provides a proven pattern — HTTP Trigger + x402 payment + EVMClient write — that maps directly to the auction settlement use case. ERC-8004 contracts are deployed on Ethereum Mainnet (see published addresses) [24]. x402 ecosystem growth metrics are frequently cited in press, but primary telemetry is not publicly available [11][12].

**Primary Recommendation:** Build a 5-layer on-chain architecture on Base Sepolia via Tenderly:
1. **Account Abstraction (EIP-4337):** Every agent gets a smart contract wallet (AgentAccount) via CREATE2. Gas sponsored by AgentPaymaster, agents never hold ETH. EIP-4337 handles bond deposits (`USDC.transfer(escrow)` via UserOp); join/bid actions flow through the Durable Object sequencer (HTTP/MCP) — no on-chain batching needed (Poseidon chain lives in DO transactional storage). `recordBond` remains a separate admin transaction in MVP (retryable, idempotent on tx hash, see Limitation #4).
2. **Identity & Privacy (ERC-8004 + ZK sidecar):** The official ERC-8004 `IdentityRegistry` is the settlement source-of-truth (`ownerOf`, `getAgentWallet`, `setAgentWallet`). Privacy is implemented in a separate sidecar registry (`AgentPrivacyRegistry`) that stores capability commitments for ZK proofs. Nullifier tracking in DO transactional storage prevents double-joining/double-bidding (NullifierSet.sol NOT deployed).
3. **ZK Verification (Groth16):** RegistryMembership and BidRange verification runs off-chain via `snarkjs.groth16.verify()` in the DO sequencer (zero gas, ~200-400ms). On-chain Groth16 verifier contracts are NOT deployed. The Poseidon hash chain is maintained in DO transactional storage (no on-chain `ingestEventBatch()`). Circom 2.x (v2.2.3) circuits compiled with snarkjs (v0.7.5), Hermez Powers of Tau trusted setup.
4. **Auction Logic (Poseidon chain + sealed-bid MPC):** AuctionRegistry holds `createAuction()` + `DOMAIN_SEPARATOR` (AuctionRoom/AuctionFactory on-chain contracts removed). The DO sequencer maintains the Poseidon hash chain in transactional storage. SealedBidMPC operates entirely off-chain — result submitted via `recordResult()`.
5. **CRE Settlement + Delivery:** 2 CRE workflows (Settlement with rule replay, Delivery Verification) provide oracle-verified finalization with BFT consensus.

Cloudflare Durable Objects handle real-time auction logic (~ms latency); on-chain contracts handle settlement-critical state; CRE handles oracle verification. EIP-4337 path uses direct USDC transfer to escrow; x402 is used for HTTP micropayments (room access, manifest fetching) and EOA fallback deposit flow. A single `finalLogHash` is anchored on-chain at auction close via `recordResult()` — CRE verifies the replay bundle against this on-chain hash. Periodic mid-auction anchoring is eliminated (single close anchor).

**Confidence Level:** High for architecture and integration patterns (based on reference implementations: x402-cre-price-alerts [8], ERC-8004 contracts [24], CRE SDK docs [21][26], EIP-4337 EntryPoint v0.7 verified on Base Sepolia). Medium for growth metrics (sourced from news/press, not primary telemetry). ERC-8004 is Draft status [1] — interface stability is not guaranteed. ZK gas estimates verified against on-chain benchmarks (Groth16 ~200K gas execution on L2, Poseidon T3 ~21K gas for 2-input / T4 ~38K gas for 3-input via `poseidon-solidity` [30]).

**Trust Model (explicit — 4-layer defense):**
1. **Real-time ordering:** Platform operator runs the DO sequencer (trusted for bid ordering and inclusion). Mitigated by signed inclusion receipts.
2. **Financial privacy (scoped):** Privacy guarantees vary by data type and auction phase. **What IS hidden (sealed-bid mode):** bid amounts are encrypted via ElGamal to the MPC committee's joint public key; no single party (including the operator) can decrypt before auction close (3-of-5 threshold). ZK range proofs verify bid validity without revealing the amount. **What is NOT hidden:** (a) bond deposit amounts are public on-chain (`bondRecords` mapping, `BondRecorded` events emit `agentId` and `amount`), (b) agent identities (`agent_id`, `wallet`) appear in the `ReplayBundleV1` event log used for CRE settlement verification, (c) join/bid event metadata (who participated, when) is visible in the Poseidon hash chain and replay bundle. **Who learns what:** the operator sees all event metadata in real-time (sequencer role); other participants see broadcast events via WebSocket; on-chain observers see bond amounts and anchored hashes; CRE DON nodes see the full replay bundle at settlement. **MVP vs production:** MVP uses English auction (open bids, no bid privacy). Sealed-bid MPC adds bid-amount privacy. Deposit privacy (ZK deposit proofs or shielded pool) and identity unlinkability are P1 extensions.
3. **Settlement integrity:** CRE oracle verification in two phases: (a) Poseidon hash-chain integrity against on-chain anchors proves the log wasn't rewritten, (b) auction-rule replay independently re-derives the winner. This is "operator-attested, oracle-verified with rule replay."
4. **Agent UX:** EIP-4337 Account Abstraction ensures gas sponsorship (no ETH required), deterministic wallet addresses (known before deployment), and atomic bond deposits (USDC transfer via UserOp). Join/bid actions flow through the DO sequencer for real-time ordering.
Remaining trust boundaries: (a) operator controls event ordering between anchor points, (b) operator can censor bids before inclusion — mitigated by signed inclusion receipts, (c) ZK trusted setup requires at least one honest contributor. Full trustlessness (decentralized sequencer) is a P2 goal.

---

## Document Map

This report has been split into focused documents for easier navigation. Each section's full content lives in the linked file below.

| # | Document | Scope |
|---|----------|-------|
| 01 | [Agent Onboarding](./agent-auction-architecture/01-agent-onboarding.md) | Module 0 (Identity + Smart Wallet), AgentAccount / AgentAccountFactory / AgentPaymaster, IdentityRegistry (ERC-8004), AgentPrivacyRegistry, NullifierSet, ZK Verifiers (RegistryMembership / BidRange) |
| 02 | [Agent Voice](./agent-auction-architecture/02-agent-voice.md) | Module 1 (Signing & Delivery), SealedBidMPC contract design |
| 03 | [Room Broadcast](./agent-auction-architecture/03-room-broadcast.md) | Module 2 (Event Ordering), CRE Workflow 1 (Settlement), ReplayBundleV1, Poseidon field encoding (normative), hash-chain anchoring, inclusion receipts, identity key mapping, CRE Deployment Notes, AuctionRoom / AuctionRegistry contracts |
| 04 | [Payment & Escrow](./agent-auction-architecture/04-payment-and-escrow.md) | Module 3 (x402 Payment), Bond Deposits, AuctionEscrow, X402PaymentGate, CRE Workflow 2 (Delivery Verification), escrow invariants |
| 05 | [Host, Object & Observation](./agent-auction-architecture/05-host-object-observation.md) | Modules 4–6 (Auction Host, Verifiable Delivery, Spectator UI), Discovery API (MVP Specification) |
| 06 | [Appendix](./agent-auction-architecture/06-appendix.md) | System Architecture diagram, Contract Deployment Order (10 steps), High-Risk Test Checklist, Technology Stack, Hackathon Execution Plan, Competitive Analysis, Limitations & Caveats (1–19), Bibliography [1]–[39], Methodology |

---

## Module Analysis

### Module 0: Agent Onboarding (Identity + Smart Wallet)

*(Moved to [01-agent-onboarding.md](./agent-auction-architecture/01-agent-onboarding.md))*


### Module 1: Agent Voice (Signing & Delivery)

*(Moved to [02-agent-voice.md](./agent-auction-architecture/02-agent-voice.md))*

### Module 2: Room Broadcast (Event Ordering)

*(Moved to [03-room-broadcast.md](./agent-auction-architecture/03-room-broadcast.md))*

### Module 3: Payment (x402)

*(Moved to [04-payment-and-escrow.md](./agent-auction-architecture/04-payment-and-escrow.md))*

### Module 4: Auction Host

*(Moved to [05-host-object-observation.md](./agent-auction-architecture/05-host-object-observation.md))*

### Module 5: Auction Object (Verifiable Delivery)

*(Moved to [05-host-object-observation.md](./agent-auction-architecture/05-host-object-observation.md))*

### Module 6: Human Observation (Spectator UI)

*(Moved to [05-host-object-observation.md](./agent-auction-architecture/05-host-object-observation.md))*

### Discovery API (MVP Specification)

*(Moved to [05-host-object-observation.md](./agent-auction-architecture/05-host-object-observation.md))*

---

## Proposed CRE-Integrated Architecture

### System Architecture Overview

*(Moved to [06-appendix.md](./agent-auction-architecture/06-appendix.md#system-architecture-overview))*

### CRE Workflow Details

- **CRE Workflow 1 — Settlement:** *(Moved to [03-room-broadcast.md](./agent-auction-architecture/03-room-broadcast.md))*
- **CRE Workflow 2 — Delivery Verification:** *(Moved to [04-payment-and-escrow.md](./agent-auction-architecture/04-payment-and-escrow.md))*

### CRE Deployment Notes (Implementation Gotchas)

*(Moved to [03-room-broadcast.md](./agent-auction-architecture/03-room-broadcast.md))*

### Smart Contract Design

- **AgentAccount / AgentAccountFactory / AgentPaymaster:** *(Moved to [01-agent-onboarding.md](./agent-auction-architecture/01-agent-onboarding.md))*
- **IdentityRegistry (ERC-8004) / AgentPrivacyRegistry / NullifierSet:** *(Moved to [01-agent-onboarding.md](./agent-auction-architecture/01-agent-onboarding.md))*
- **ZK Verifiers (RegistryMembership / BidRange):** *(Moved to [01-agent-onboarding.md](./agent-auction-architecture/01-agent-onboarding.md))*
- **SealedBidMPC:** *(Moved to [02-agent-voice.md](./agent-auction-architecture/02-agent-voice.md))*
- **AuctionRoom / AuctionRegistry:** *(Moved to [03-room-broadcast.md](./agent-auction-architecture/03-room-broadcast.md))*
- **AuctionEscrow / X402PaymentGate:** *(Moved to [04-payment-and-escrow.md](./agent-auction-architecture/04-payment-and-escrow.md))*

### Contract Deployment Order / High-Risk Test Checklist / Technology Stack

*(Moved to [06-appendix.md](./agent-auction-architecture/06-appendix.md))*

---

## Hackathon Execution Plan (10 Days Remaining)

*(Moved to [06-appendix.md](./agent-auction-architecture/06-appendix.md#hackathon-execution-plan-10-days-remaining))*

## Competitive Analysis: What Wins Hackathons

*(Moved to [06-appendix.md](./agent-auction-architecture/06-appendix.md#competitive-analysis-what-wins-hackathons))*

## Limitations & Caveats

*(19 items — moved to [06-appendix.md](./agent-auction-architecture/06-appendix.md#limitations--caveats))*

## Bibliography

*(References [1]–[39] — moved to [06-appendix.md](./agent-auction-architecture/06-appendix.md#bibliography))*

## Appendix: Methodology

*(Moved to [06-appendix.md](./agent-auction-architecture/06-appendix.md#appendix-methodology))*
