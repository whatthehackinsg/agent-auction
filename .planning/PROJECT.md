# Agent Auction — ZK Privacy E2E

## What This Is

An agent-native auction platform where AI agents autonomously discover, join, bid in, and settle auctions — with on-chain USDC escrow, verifiable event ordering, ZK privacy proofs, and CRE-based trustless settlement. Built for the Chainlink 2026 Hackathon on Base Sepolia.

## Core Value

Working ZK proofs that actually verify on-chain — agents prove registry membership and bid range without revealing identity, and the full stack (MCP tools → engine → contracts → CRE settlement → frontend) demonstrates this cryptographic privacy end-to-end.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Smart contracts deployed on Base Sepolia (AuctionRegistry, AuctionEscrow, AgentPrivacyRegistry, NftEscrow) — existing
- ✓ CRE E2E settlement confirmed on-chain (AuctionEnded → onReport → escrow release) — existing
- ✓ Auction engine with Durable Object sequencer, Poseidon hash chain, D1 persistence — existing
- ✓ Two-tier WebSocket (masked public, full participant) — existing
- ✓ Platform commission system (global commissionBps, capped 10%, deducted at settlement) — existing
- ✓ x402 discovery gating (optional micropayment gate on GET /auctions) — existing
- ✓ Frontend spectator UI with scoreboard, masked agent display, replay viewer — existing
- ✓ MCP server with 7 agent tools (discover, details, join, bid, bond, status, history) — existing
- ✓ Agent-client demo with x402 auto-payment — existing
- ✓ Shared crypto library (Poseidon, EIP-712, snarkjs helpers, nullifiers) — 56 tests passing
- ✓ Two Circom Groth16 circuits compiled (RegistryMembership ~12K, BidRange ~5K) — existing
- ✓ Engine ZK proof verification with inlined vkeys (snarkjs.groth16.verify) — existing
- ✓ 144 contract tests, 182+ engine tests passing — existing

### Active

<!-- Current scope. Building toward these. -->

- [ ] Circuits test harness wired and passing (RegistryMembership + BidRange)
- [ ] Agent-client generates real ZK membership proof via snarkjs and submits to engine via MCP join_auction tool
- [ ] Agent-client generates real ZK bid range proof and submits to engine via MCP place_bid tool
- [ ] MCP server tools accept and forward ZK proof payloads (join + bid)
- [ ] Engine verifies real ZK proofs end-to-end (not just stub/bypass mode)
- [ ] AgentPrivacyRegistry Merkle root updated with test agents for live demo
- [ ] Live on-chain demo: agent registers → generates proofs → joins → bids → auction settles via CRE on Base Sepolia
- [ ] Frontend shows ZK proof verification status and privacy indicators (not just string masking)
- [ ] Frontend displays cryptographic guarantees (proof verified badge, nullifier consumed, membership confirmed)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Auctions-preview batch endpoint — deferred to separate milestone, not needed for ZK demo
- On-chain ZK proof verification (Solidity verifier) — P1 feature, off-chain snarkjs verification sufficient for hackathon
- Sealed-bid commit-reveal flow — requires new circuit + protocol changes, too ambitious for this milestone
- New circuit development — use existing RegistryMembership + BidRange circuits as-is
- Mobile app or responsive frontend — web-first spectator UI is sufficient

## Context

This is a brownfield project with substantial existing infrastructure. The ZK privacy layer is partially built — circuits compiled, engine verification logic exists, crypto library tested — but nothing is wired end-to-end. The gap is the "last mile" integration:

1. **Circuits**: Compiled but test harness not connected (`npm test` expected to fail)
2. **Agent-client**: Has EIP-712 signing but no ZK proof generation
3. **MCP server**: Tools don't accept proof payloads yet
4. **Engine**: Has `ENGINE_REQUIRE_PROOFS=true` flag but untested with real proofs from real circuits
5. **Frontend**: Uses string masking (`Agent ●●●●XX`) but doesn't display proof verification status

The on-chain `AgentPrivacyRegistry` contract is deployed and has a `getRoot()` function the engine already reads — the Merkle root just needs to be populated with test agent leaves.

## Constraints

- **Chain**: Base Sepolia (chainId 84532) — all existing contracts deployed here
- **Circuits**: Must use existing RegistryMembership + BidRange (no new circuit development)
- **Runtime**: Engine runs on Cloudflare Workers (snarkjs must work in CF Workers env — already confirmed with inlined vkeys)
- **Demo**: Must work live on Base Sepolia, not just local — judges see real on-chain transactions
- **Timeline**: Hackathon deadline — prioritize working proofs over polish

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Off-chain ZK verification only | On-chain Groth16 verifier adds complexity without demo value — snarkjs in engine is sufficient | — Pending |
| MCP as primary agent interface | Agents use MCP tools (not direct HTTP) for proof submission — demonstrates AI-native UX | — Pending |
| Existing circuits only | RegistryMembership + BidRange are sufficient to demonstrate privacy guarantees | — Pending |
| Live Base Sepolia demo | Real on-chain transactions > local mock — proves the full stack works | — Pending |

---
*Last updated: 2026-03-02 after initialization*
