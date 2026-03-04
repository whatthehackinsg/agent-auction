# Agent Auction — ZK Privacy E2E

## What This Is

An agent-native auction platform where AI agents autonomously discover, join, bid in, and settle auctions — with on-chain USDC escrow, verifiable event ordering, ZK privacy proofs (Groth16 RegistryMembership + BidRange), and CRE-based trustless settlement. Built for the Chainlink 2026 Hackathon on Base Sepolia.

## Core Value

Working ZK proofs that actually verify — agents prove registry membership and bid range without revealing identity, and the full stack (agent-client → MCP tools → engine verification → WebSocket → frontend badges → CRE settlement) demonstrates this cryptographic privacy end-to-end.

## Requirements

### Validated

- ✓ Smart contracts deployed on Base Sepolia (AuctionRegistry, AuctionEscrow, AgentPrivacyRegistry, NftEscrow) — pre-existing
- ✓ CRE E2E settlement confirmed on-chain (AuctionEnded → onReport → escrow release) — pre-existing
- ✓ Auction engine with Durable Object sequencer, Poseidon hash chain, D1 persistence — pre-existing
- ✓ Two-tier WebSocket (masked public, full participant) — pre-existing
- ✓ Platform commission system (global commissionBps, capped 10%) — pre-existing
- ✓ x402 discovery gating (optional micropayment gate on GET /auctions) — pre-existing
- ✓ Frontend spectator UI with scoreboard, masked agent display — pre-existing
- ✓ MCP server with 7 agent tools — pre-existing
- ✓ Shared crypto library (Poseidon, EIP-712, snarkjs helpers, nullifiers) — pre-existing
- ✓ Two Circom Groth16 circuits compiled (RegistryMembership ~12K, BidRange ~5K) — pre-existing
- ✓ Circuit test harness wired and passing for both circuits — v1.0 (ZKFN-01)
- ✓ Engine ZK proof verification with inlined vkeys and named signal constants — v1.0 (ZKFN-02, ZKFN-04)
- ✓ AgentPrivacyRegistry Merkle root populated with test agents — v1.0 (ZKFN-03)
- ✓ MCP join_auction and place_bid accept ZK proof payloads — v1.0 (MCPE-01, MCPE-02)
- ✓ EIP-712 signer supports Poseidon nullifier path — v1.0 (MCPE-03)
- ✓ Engine verifies real ZK proofs end-to-end — v1.0 (MCPE-04)
- ✓ MCP server can generate proofs server-side (hybrid mode) — v1.0 (MCPE-05)
- ✓ Agent-client generates real Groth16 proofs and submits via MCP — v1.0 (AGZK-01, AGZK-02)
- ✓ Agent private state persisted across sessions — v1.0 (AGZK-03)
- ✓ BidRange failures caught with meaningful errors — v1.0 (AGZK-04)
- ✓ Frontend ZK verification badges on bids and joins — v1.0 (FRNT-01)
- ✓ Frontend nullifier consumed indicator — v1.0 (FRNT-02)
- ✓ Frontend privacy explainer panel — v1.0 (FRNT-03)
- ✓ Platform stats dashboard with animated cards and live polling — v1.0 (DASH-01–06)
- ✓ Stat card shimmer/glow effects and 3-card auctions variant — v1.0

### Active

- [ ] Full live E2E demo on Base Sepolia (agent → proofs → bid → CRE settle) — deferred from v1.0
- [ ] CCIP Private Transactions future vision narrative — deferred from v1.0
- [ ] Add agent skills and finish MCP server (pending todo)
- [ ] Validate NFT settings and run real NFT test (pending todo)
- [ ] Audit onboarding pipeline and ERC-8004 details (pending todo)

### Out of Scope

- On-chain ZK proof verification (Solidity verifier) — off-chain snarkjs sufficient for hackathon
- Sealed-bid commit-reveal flow — requires new circuit, too ambitious
- New circuit development — existing circuits sufficient
- Mobile/responsive frontend — web-first spectator UI sufficient
- CCIP Private Transactions implementation — mentioned as future vision only

## Context

Shipped v1.0 with full ZK privacy stack in 3 days (2026-03-02 → 2026-03-04). 66 commits, 127 files changed, +15,175 lines.

Tech stack: Solidity/Foundry (Base Sepolia), Cloudflare Workers + Durable Objects (engine), Next.js 16 + React 19 (frontend), Bun + CRE SDK (settlement), Circom 2.2.3 (circuits), snarkjs (proof gen/verify).

Test coverage: 144 contract tests, 184+ engine tests, 56+ crypto tests, 14 MCP server tests.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Off-chain ZK verification only | On-chain Groth16 verifier adds complexity without demo value | ✓ Good — snarkjs in engine works reliably |
| MCP as primary agent interface | AI-native UX for proof submission | ✓ Good — clean tool schemas with structured errors |
| Existing circuits only | RegistryMembership + BidRange sufficient for privacy demo | ✓ Good — avoided scope creep |
| Remove engine keccak/Poseidon cross-check | Groth16 verification provides security; cross-check was a mismatch source | ✓ Good — eliminated the root mismatch bug |
| Poseidon nullifier gated on proofPayload | Keccak256 fallback preserved for non-ZK joins | ✓ Good — backward compatible |
| BidRange maxBudget=0 → 2^48 sentinel | Circuit constraint requires non-zero maxBudget | ✓ Good — transparent workaround |
| zkNullifier/bidCommitment in public WebSocket | Cryptographic hashes, not identity-revealing | ✓ Good — spectators see proof status |
| GET /stats fully public | Supports unauthenticated frontend dashboard | ✓ Good — enables landing page stats |
| PlatformStatsSection returns null on error | Graceful degradation without breaking parent page | ✓ Good — page renders even if engine down |
| All-Poseidon registration (quick task 2) | Removed keccak256 registrationCommit, simplified to Poseidon only | ✓ Good — single hash function throughout |

---
*Last updated: 2026-03-04 after v1.0 milestone*
