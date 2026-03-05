# Roadmap: Agent Auction Platform

## Milestones

- v1.0 ZK Privacy E2E - Phases 1-6 (shipped 2026-03-04)
- v1.1 Autonomous Agent Onboarding - Phases 7-11 (in progress)

## Phases

<details>
<summary>v1.0 ZK Privacy E2E (Phases 1-6) - SHIPPED 2026-03-04</summary>

- [x] Phase 1: ZK Foundation (3/3 plans) - completed 2026-03-02
- [x] Phase 2: MCP + Engine Wiring (4/4 plans) - completed 2026-03-02
- [x] Phase 3: Agent-Client ZK Integration (2/2 plans) - completed 2026-03-03
- [x] Phase 4: Frontend + Demo (2/2 plans) - completed 2026-03-03
- [x] Phase 5: Key Figures Dashboard (2/2 plans) - completed 2026-03-03
- [x] Phase 6: Refine Stats Card UI (1/1 plan) - completed 2026-03-04

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### v1.1 Autonomous Agent Onboarding (In Progress)

**Milestone Goal:** Make agents fully autonomous for the per-auction lifecycle — human does one-time setup, agent handles everything via MCP tools with mandatory ZK proofs and verified identity.

**Phase Numbering:**
- Integer phases (7, 8, 9, 10, 11): Planned milestone work
- Decimal phases (7.1, 8.1): Urgent insertions if needed (marked with INSERTED)

- [x] **Phase 7: Identity Verification** - Make ENGINE_VERIFY_WALLET mandatory, audit identity chain, pre-flight gates, edge cases (completed 2026-03-05)
- [ ] **Phase 8: Participant Privacy** - Strip identity from participant WebSocket; agents self-recognize by nullifier only
- [ ] **Phase 9: ZK Enforcement** - Make ZK proofs mandatory on join/bid; unify readiness check
- [ ] **Phase 10: Autonomous MCP Tools** - Add register_identity, deposit_bond, withdraw_funds, claim_refund tools
- [ ] **Phase 11: Skill Rewrite** - Replace stale skill docs with correct ERC-8004 ABI and full autonomous flow

## Phase Details

### Phase 7: Identity Verification
**Goal**: Enforce on-chain identity verification as baseline security — engine rejects actions from unverified agents
**Depends on**: v1.0 complete (Phase 6)
**Requirements**: IDVR-01, IDVR-02, IDVR-03, IDVR-04
**Success Criteria** (what must be TRUE):
  1. Engine defaults to `ENGINE_VERIFY_WALLET=true` — JOIN is rejected if wallet doesn't match ERC-8004 `ownerOf(agentId)` on-chain
  2. MCP tools (`join_auction`, `place_bid`) pre-flight check identity and refuse to submit actions if agent is not ERC-8004 verified
  3. Engine returns structured error codes for: unregistered agentId, wallet mismatch, ERC-8004 lookup failure
  4. Ownership transfer invalidates cached verification — next JOIN re-verifies on-chain; RPC failure fails closed (rejects action)
**Plans**: 2 plans

Plans:
- [ ] 07-01-PLAN.md — Engine identity hardening: default verify=true, structured error codes, remove cache, edge cases
- [x] 07-02-PLAN.md — MCP pre-flight identity checks in join_auction and place_bid tools

### Phase 8: Participant Privacy
**Goal**: Participants see only zkNullifiers for other agents — no agentId or wallet leaks on the participant WebSocket tier
**Depends on**: Phase 7 (verified identity required before privacy layer)
**Requirements**: PRIV-01, PRIV-02, PRIV-03
**Success Criteria** (what must be TRUE):
  1. A participant connected via WebSocket sees JOIN and BID events from other agents identified only by zkNullifier (no agentId, no wallet address in the event payload)
  2. An agent can match its own events in the participant WebSocket stream by comparing the zkNullifier it generated locally
  3. A public (non-participant) WebSocket connection continues to receive masked agentId and no wallet — no regression from v1.0 behavior
**Plans**: TBD

Plans:
- [ ] 08-01: TBD

### Phase 9: ZK Enforcement
**Goal**: ZK proofs are mandatory for join and bid — no opt-out path exists when agent state is configured
**Depends on**: Phase 8 (privacy model uses nullifiers that ZK proofs generate)
**Requirements**: ZKRQ-01, ZKRQ-02, ZKRQ-03, ZKRQ-04
**Success Criteria** (what must be TRUE):
  1. Calling join_auction with AGENT_STATE_FILE configured always generates and submits a ZK proof (no parameter to skip it)
  2. Calling place_bid with AGENT_STATE_FILE configured always generates and submits a ZK proof (no parameter to skip it)
  3. check_identity returns a single readyToParticipate flag that is TRUE only when both ERC-8004 identity and ZK state (AGENT_STATE_FILE, privacy registry membership) are ready
  4. .env.example lists AGENT_STATE_FILE and BASE_SEPOLIA_RPC as REQUIRED fields with clear documentation
**Plans**: TBD

Plans:
- [ ] 09-01: TBD

### Phase 10: Autonomous MCP Tools
**Goal**: Agents can complete the full per-auction lifecycle autonomously via MCP tools — register identity, bond, participate, withdraw/refund
**Depends on**: Phase 9 (tools must work with mandatory ZK + verified identity)
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04
**Success Criteria** (what must be TRUE):
  1. An agent can call register_identity to register an ERC-8004 identity on-chain (calls register(string agentURI) using AGENT_PRIVATE_KEY and BASE_SEPOLIA_RPC), and check_identity confirms registration afterward
  2. An agent can call deposit_bond to approve USDC and deposit a bond to AuctionEscrow for a specific auction, and the engine acknowledges the bond via POST /auctions/:id/bonds
  3. An agent can call withdraw_funds after auction settlement to withdraw USDC from AuctionEscrow (requires ownerOf(agentId) == agent wallet)
  4. An agent can call claim_refund for a non-winning bond to release it from escrow, then call withdraw_funds to retrieve the USDC
**Plans**: TBD

Plans:
- [ ] 10-01: TBD

### Phase 11: Skill Rewrite
**Goal**: Skill documentation accurately describes the current tool set, mandatory ZK flow, and full autonomous per-auction loop
**Depends on**: Phase 10 (skills document the final state of all tools)
**Requirements**: SKIL-01, SKIL-02, SKIL-03
**Success Criteria** (what must be TRUE):
  1. The 3 stale skill files (SKILL.md, bond-management/SKILL.md, sealed-bid/SKILL.md) no longer exist
  2. A new auction skill document describes the correct ERC-8004 register(string agentURI) ABI (not the old register(uint256, address) signature) and the mandatory ZK proof flow
  3. The new skill document covers the full autonomous per-auction loop: discover -> bond -> join(ZK) -> bid(ZK) -> monitor -> withdraw/claim, with each step mapping to a specific MCP tool
**Plans**: TBD

Plans:
- [ ] 11-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 7 -> 7.x -> 8 -> 8.x -> 9 -> 9.x -> 10 -> 10.x -> 11

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. ZK Foundation | v1.0 | 3/3 | Complete | 2026-03-02 |
| 2. MCP + Engine Wiring | v1.0 | 4/4 | Complete | 2026-03-02 |
| 3. Agent-Client ZK Integration | v1.0 | 2/2 | Complete | 2026-03-03 |
| 4. Frontend + Demo | v1.0 | 2/2 | Complete | 2026-03-03 |
| 5. Key Figures Dashboard | v1.0 | 2/2 | Complete | 2026-03-03 |
| 6. Refine Stats Card UI | v1.0 | 1/1 | Complete | 2026-03-04 |
| 7. Identity Verification | 2/2 | Complete   | 2026-03-05 | - |
| 8. Participant Privacy | v1.1 | 0/? | Not started | - |
| 9. ZK Enforcement | v1.1 | 0/? | Not started | - |
| 10. Autonomous MCP Tools | v1.1 | 0/? | Not started | - |
| 11. Skill Rewrite | v1.1 | 0/? | Not started | - |
