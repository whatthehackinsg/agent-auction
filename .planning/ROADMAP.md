# Roadmap: Agent Auction — ZK Privacy E2E

## Overview

This milestone closes the "last mile" ZK integration on a fully operational brownfield auction platform. The circuits, verification code, and all supporting infrastructure already exist. Four phases wire the existing pieces in strict dependency order: fix the hash mismatch and prove circuits work in isolation, then extend MCP tools to accept proof payloads, then wire the agent-client to generate real proofs end-to-end, then surface cryptographic status in the frontend for hackathon judges.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: ZK Foundation** - Fix hash mismatch, wire circuit test harness, populate on-chain Merkle root
- [ ] **Phase 2: MCP + Engine Wiring** - Extend MCP tool schemas to accept ZK proofs and validate engine E2E
- [ ] **Phase 3: Agent-Client ZK Integration** - Wire real Groth16 proof generation into the agent-client flow
- [ ] **Phase 4: Frontend + Demo** - Surface ZK verification status in UI and confirm live Base Sepolia demo

## Phase Details

### Phase 1: ZK Foundation
**Goal**: Circuits are confirmed working in isolation, the keccak/Poseidon root mismatch is eliminated, and the on-chain Merkle root contains real test agent leaves
**Depends on**: Nothing (first phase)
**Requirements**: ZKFN-01, ZKFN-02, ZKFN-03, ZKFN-04
**Success Criteria** (what must be TRUE):
  1. `npm test` in `packages/crypto/` passes for both RegistryMembership and BidRange circuits with real `.wasm` and `.zkey` artifacts
  2. Engine no longer rejects real ZK proofs due to keccak/Poseidon root cross-check (cross-check removed or fixed)
  3. `AgentPrivacyRegistry.getRoot()` on Base Sepolia returns a non-zero Poseidon Merkle root containing test agent commitments
  4. Named signal index constants exist in `packages/crypto/src/signal-indices.ts` and are imported by engine verifier
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Signal index constants (ZKFN-04) + remove engine cross-check (ZKFN-02)
- [x] 01-02-PLAN.md — Circuit proof generation and verification tests (ZKFN-01)
- [x] 01-03-PLAN.md — Test agent registration script and on-chain execution (ZKFN-03)

### Phase 2: MCP + Engine Wiring
**Goal**: MCP `join_auction` and `place_bid` tools accept ZK proof payloads, the EIP-712 signer uses the Poseidon nullifier when proofs are present, and the engine verifies real proofs end-to-end
**Depends on**: Phase 1
**Requirements**: MCPE-01, MCPE-02, MCPE-03, MCPE-04, MCPE-05
**Success Criteria** (what must be TRUE):
  1. A ZK proof payload submitted via MCP `join_auction` tool reaches the engine and produces an AuctionEvent with `zkNullifier` populated
  2. A ZK proof payload submitted via MCP `place_bid` tool reaches the engine and produces an AuctionEvent with `bidCommitment` populated
  3. Engine running with `ENGINE_REQUIRE_PROOFS=true` accepts the proof and rejects a matching request without a proof
  4. MCP server can generate proofs server-side when an agent provides secrets but not a pre-built proof (hybrid mode)
**Plans**: 3 plans

Plans:
- [ ] 02-01-PLAN.md — Foundation: crypto dependency, config env vars, signer nullifier switch, proof-generator module (MCPE-03, MCPE-05)
- [ ] 02-02-PLAN.md — Tool wiring: extend join_auction and place_bid Zod schemas with proof params + structured errors (MCPE-01, MCPE-02)
- [ ] 02-03-PLAN.md — Integration tests: vitest setup, proof fixtures, signer + tool tests (MCPE-04)

### Phase 3: Agent-Client ZK Integration
**Goal**: The agent-client autonomously generates real Groth16 membership and bid range proofs, persists private state across sessions, and submits the full proof flow through MCP tools
**Depends on**: Phase 2
**Requirements**: AGZK-01, AGZK-02, AGZK-03, AGZK-04
**Success Criteria** (what must be TRUE):
  1. Agent-client `joinAuction()` submits a real RegistryMembership Groth16 proof via MCP `join_auction` and the engine accepts it
  2. Agent-client `placeBid()` submits a real BidRange Groth16 proof via MCP `place_bid` and the engine accepts it
  3. A second call to `joinAuction()` with the same nullifier is rejected by the engine (double-join prevention)
  4. Submitting a bid outside the declared range produces a structured error (not an unhandled exception)
  5. Agent private state (secrets, nullifiers, Merkle witness) survives process restart and loads correctly next session
**Plans**: TBD

### Phase 4: Frontend + Demo
**Goal**: Judges can visually confirm ZK proof verification in the spectator UI, and a live end-to-end auction on Base Sepolia demonstrates the full privacy stack including CRE settlement
**Depends on**: Phase 3
**Requirements**: FRNT-01, FRNT-02, FRNT-03, DEMO-01, DEMO-02
**Success Criteria** (what must be TRUE):
  1. JOIN events in the activity feed show a "ZK VERIFIED" badge when `zkNullifier` is present in the WebSocket event
  2. BID events show a truncated `bidCommitment` field, visible to spectators
  3. A privacy explainer panel in the auction room explains membership proof and bid range proof guarantees in plain language
  4. A complete live run on Base Sepolia completes: agent registers, generates proofs, joins auction, bids with range proof, auction settles via CRE with escrow released
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. ZK Foundation | 3/3 | Complete   | 2026-03-02 |
| 2. MCP + Engine Wiring | 0/3 | Not started | - |
| 3. Agent-Client ZK Integration | 0/TBD | Not started | - |
| 4. Frontend + Demo | 0/TBD | Not started | - |
