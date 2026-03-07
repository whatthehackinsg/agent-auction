# Roadmap: Agent Auction Platform

## Milestones

- v1.0 ZK Privacy E2E - Phases 1-6 (shipped 2026-03-04)
- v1.1 Autonomous Agent Onboarding - Phases 7-16 (in progress)

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

**Milestone Goal:** Make agents fully autonomous for the per-auction lifecycle, then publish a first-class participation standard for external agents — human does one-time setup, agent handles identity, bond, join, bid, and settlement-safe exits with mandatory ZK proofs and verified identity.

**Phase Numbering:**
- Integer phases (7, 8, 9, 10, 11, 12, 13, 14, 15, 16): milestone work plus follow-up blocker phases
- Decimal phases (7.1, 8.1): urgent insertions if needed (marked with INSERTED)

- [x] **Phase 7: Identity Verification** - Make ENGINE_VERIFY_WALLET mandatory, audit identity chain, pre-flight gates, edge cases (completed 2026-03-05)
- [x] **Phase 8: Participant Privacy** - Strip identity from participant WebSocket; agents self-recognize by nullifier only (completed 2026-03-05)
- [x] **Phase 9: ZK Enforcement** - Make ZK proofs mandatory on join/bid; unify readiness check (completed 2026-03-06)
- [x] **Phase 10: Autonomous MCP Tools** - Add register_identity, deposit_bond, withdraw_funds, claim_refund tools (completed 2026-03-06)
- [x] **Phase 11: Internal skill and prompt cleanup** - Remove stale repo-internal skill/prompt artifacts so they no longer contradict the post-Phase-13 toolchain (completed 2026-03-07)
- [x] **Phase 12: Debug live Phase 10 registration and proof failures** - Fix onboarding truthfulness and privacy-registry deployment issues; hand off the remaining Worker blocker (completed 2026-03-06)
- [x] **Phase 13: Worker Proof Runtime Compatibility** - Re-scoped from the old registry placeholder; completed 2026-03-07 with local + deployed fresh-agent JOIN success
- [x] **Phase 14: Define agent participation standard and platform guidance** - Specify the minimum supported participant stack, wallet requirements, and repo/website guidance for human and agent operators (completed 2026-03-07)
- [ ] **Phase 15: Integrate AgentKit wallet adapter without breaking ZK or ERC-8004** - Replace raw private-key assumptions with an AgentKit-compatible wallet abstraction while preserving identity, proof, and bond invariants
- [ ] **Phase 16: Write agent auction skill and autonomous participation playbook** - Teach external agents the auction rules, required packages/config, and minimal-human-participation flow

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
- [x] 07-01-PLAN.md — Engine identity hardening: default verify=true, structured error codes, remove cache, edge cases
- [x] 07-02-PLAN.md — MCP pre-flight identity checks in join_auction and place_bid tools

### Phase 8: Participant Privacy
**Goal**: Participants see only zkNullifiers for other agents — no agentId or wallet leaks on the participant WebSocket tier
**Depends on**: Phase 7 (verified identity required before privacy layer)
**Requirements**: PRIV-01, PRIV-02, PRIV-03
**Success Criteria** (what must be TRUE):
  1. A participant connected via WebSocket sees JOIN and BID events from other agents identified only by zkNullifier (no agentId, no wallet address in the event payload)
  2. An agent can match its own events in the participant WebSocket stream by comparing the zkNullifier it generated locally
  3. A public (non-participant) WebSocket connection continues to receive masked agentId and no wallet — no regression from v1.0 behavior
**Plans**: 2 plans

Plans:
- [x] 08-01-PLAN.md — Engine privacy masking: three-tier broadcast, participant-aware snapshot, /events masking, WS token validation
- [x] 08-02-PLAN.md — MCP monitor_auction tool with REST polling and self-recognition annotation

### Phase 9: ZK Enforcement
**Goal**: ZK proofs are mandatory for join and bid — no opt-out path exists when agent state is configured
**Depends on**: Phase 8 (privacy model uses nullifiers that ZK proofs generate)
**Requirements**: ZKRQ-01, ZKRQ-02, ZKRQ-03, ZKRQ-04
**Success Criteria** (what must be TRUE):
  1. Calling join_auction with AGENT_STATE_FILE configured always generates and submits a ZK proof (no parameter to skip it)
  2. Calling place_bid with AGENT_STATE_FILE configured always generates and submits a ZK proof (no parameter to skip it)
  3. check_identity returns a single readyToParticipate flag that is TRUE only when both ERC-8004 identity and ZK state (AGENT_STATE_FILE, privacy registry membership) are ready
  4. `.env.example` lists AGENT_STATE_FILE and BASE_SEPOLIA_RPC as required fields with clear documentation
**Plans**: 2 plans

Plans:
- [x] 09-01-PLAN.md — Engine default flip, MCP tool ZK enforcement, unified readiness check, `.env.example`
- [x] 09-02-PLAN.md — Engine test hardening with real Groth16 proofs

### Phase 10: Autonomous MCP Tools
**Goal**: Agents can complete the full per-auction lifecycle autonomously via MCP tools — register identity, bond, participate, withdraw/refund
**Depends on**: Phase 9 (tools must work with mandatory ZK + verified identity)
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04
**Success Criteria** (what must be TRUE):
  1. An agent can call `register_identity` to register an ERC-8004 identity on-chain and `check_identity` confirms registration afterward
  2. An agent can call `deposit_bond` to approve USDC and deposit a bond to `AuctionEscrow`, and the engine acknowledges the bond via `POST /auctions/:id/bonds`
  3. An agent can call `withdraw_funds` after auction settlement to withdraw USDC from `AuctionEscrow`
  4. An agent can call `claim_refund` for a non-winning bond, then call `withdraw_funds` to retrieve the USDC
**Plans**: 4 plans

Plans:
- [x] 10-01-PLAN.md — Shared Base Sepolia helper layer plus `register_identity`
- [x] 10-02-PLAN.md — Multi-identity write targeting and `deposit_bond`
- [x] 10-03-PLAN.md — `claim_refund` and `withdraw_funds`
- [x] 10-04-PLAN.md — MCP prompts, README, and env docs for the autonomous lifecycle

### Phase 11: Internal skill and prompt cleanup
**Goal**: Clean up stale repo-internal skill and prompt artifacts so local guidance stops contradicting the current MCP tool set, ERC-8004 onboarding ABI, and mandatory ZK flow
**Depends on**: Phase 13 (cleanup should reflect the stabilized post-Worker-fix toolchain)
**Requirements**: SKIL-01, SKIL-02, SKIL-03
**Success Criteria** (what must be TRUE):
  1. The known stale repo-internal skill artifacts (`SKILL.md`, `bond-management/SKILL.md`, `sealed-bid/SKILL.md`) are removed, archived, or replaced so they no longer teach invalid flows
  2. Remaining repo-internal prompts/examples reference the correct ERC-8004 `register(string agentURI)` ABI, current MCP tool names, and mandatory ZK proof path
  3. Phase 11 does not attempt to define the external agent participation standard, AgentKit wallet requirements, or the public playbook; those are owned by Phases 14-16
**Plans**: 2 plans

Plans:
- [x] 11-01-PLAN.md — Remove the stale `.claude/skills/auction/*` tree and align `check_identity` with the current MCP onboarding path
- [x] 11-02-PLAN.md — Clean the remaining live MCP prompts/docs/help text and make `mcp-server/README.md` the canonical internal landing page

Notes:
- Phase 11 is intentionally internal-facing only.
- Verified complete on 2026-03-07 via `11-UAT.md`.
- Phase 14 defines the supported participant stack and platform guidance.
- Phase 15 implements the AgentKit-compatible wallet path.
- Phase 16 publishes the external-facing participation skill/playbook after the integration path is frozen.

### Phase 12: Debug live Phase 10 registration and proof failures
**Goal**: Make live onboarding truthful and restore the fail-closed Base Sepolia `deposit_bond -> join_auction` path for freshly registered agents
**Depends on**: Phase 10 (live UAT exposed the registration and join-proof failures)
**Requirements**: TOOL-01, TOOL-02, ZKRQ-01
**Success Criteria** (what must be TRUE):
  1. `register_identity` returns the reconciled truth after live side effects, including success-with-warning when `/verify-identity` confirms readiness and a local `agent-N.json` exists
  2. `join_auction` remains fail-closed but returns actionable diagnostics when proof-state alignment is wrong
  3. A real Base Sepolia `register_identity -> check_identity -> deposit_bond -> join_auction` flow succeeds for a newly onboarded agent
**Plans**: 3 plans

Plans:
- [x] 12-01-PLAN.md — Reconcile `register_identity` post-mint truth and recovery output
- [x] 12-02-PLAN.md — Fix live join-proof alignment and diagnostics without weakening ZK enforcement
- [x] 12-03-PLAN.md — Redeploy or repoint the per-agent `AgentPrivacyRegistry`, then rerun live Base Sepolia onboarding and JOIN

Current blocker:
- Resolved in Phase 13. The per-agent registry plus Worker-safe verifier path now pass fresh-agent JOIN sign-off.

### Phase 13: Worker Proof Runtime Compatibility
**Goal**: Make JOIN/BID proof verification honest under Cloudflare Worker runtime constraints, or stop with a fully explained blocked state and next action
**Depends on**: Phase 12 (registry/config truth is already fixed)
**Requirements**: ZKRQ-01, ZKRQ-02, TOOL-02
**Plans**: 3 plans

Plans:
- [x] 13-01-PLAN.md — Reproduce the deployed Worker proof-runtime failure locally and investigate the shared loader path
- [x] 13-02-PLAN.md — Add shared `PROOF_RUNTIME_UNAVAILABLE` surfacing across engine and MCP
- [x] 13-03-PLAN.md — Write dual-runtime sign-off runbook and close Phase 13 with fresh local + deployed evidence

Current blocker:
- None. Phase 13 is complete.

## Progress

**Execution Order:**
Phases execute in numeric order: 7 -> 7.x -> 8 -> 8.x -> 9 -> 9.x -> 10 -> 10.x -> 11 -> 12 -> 13 -> 14 -> 15 -> 16

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. ZK Foundation | v1.0 | 3/3 | Complete | 2026-03-02 |
| 2. MCP + Engine Wiring | v1.0 | 4/4 | Complete | 2026-03-02 |
| 3. Agent-Client ZK Integration | v1.0 | 2/2 | Complete | 2026-03-03 |
| 4. Frontend + Demo | v1.0 | 2/2 | Complete | 2026-03-03 |
| 5. Key Figures Dashboard | v1.0 | 2/2 | Complete | 2026-03-03 |
| 6. Refine Stats Card UI | v1.0 | 1/1 | Complete | 2026-03-04 |
| 7. Identity Verification | v1.1 | 2/2 | Complete | 2026-03-05 |
| 8. Participant Privacy | v1.1 | 2/2 | Complete | 2026-03-05 |
| 9. ZK Enforcement | v1.1 | 2/2 | Complete | 2026-03-06 |
| 10. Autonomous MCP Tools | v1.1 | 4/4 | Complete | 2026-03-06 |
| 11. Internal skill and prompt cleanup | v1.1 | 2/2 | Complete | 2026-03-07 |
| 12. Debug live Phase 10 registration and proof failures | v1.1 | 3/3 | Complete with blocker handoff | 2026-03-06 |
| 13. Worker Proof Runtime Compatibility | v1.1 | 3/3 | Complete | 2026-03-07 |
| 14. Define agent participation standard and platform guidance | v1.1 | 2/2 | Complete | 2026-03-07 |
| 15. Integrate AgentKit wallet adapter without breaking ZK or ERC-8004 | v1.1 | 0/0 | Not started | - |
| 16. Write agent auction skill and autonomous participation playbook | v1.1 | 0/0 | Not started | - |

### Phase 14: Define agent participation standard and platform guidance

**Goal:** Define and publish the minimum active-participant standard for humans and external agents, including the supported wallet stack, capability checklist, aligned repo guidance, and a public setup-guide entry point
**Requirements**: PART-01, PART-02, PART-03, PART-04
**Depends on:** Phase 13
**Plans:** 2/2 plans complete

Plans:
- [x] 14-01-PLAN.md — Canonical participation standard, wallet capability checklist, and repo guidance alignment
- [x] 14-02-PLAN.md — Public `/participate` setup guide and frontend handoff links

### Phase 15: Integrate AgentKit wallet adapter without breaking ZK or ERC-8004

**Goal:** Replace raw private-key assumptions with a supported AgentKit/CDP wallet backend while preserving the existing MCP tool surface, ERC-8004 owner model, fail-closed ZK path, and advanced raw-key bridge
**Requirements**: AKIT-01, AKIT-02, AKIT-03, AKIT-04
**Depends on:** Phase 14
**Plans:** 4 plans

Plans:
- [ ] 15-01-PLAN.md — Supported backend/config foundation and wallet-target abstraction
- [ ] 15-02-PLAN.md — On-chain identity, attach, bond, and exit flows through the supported wallet backend
- [ ] 15-03-PLAN.md — EIP-712 action signing and JOIN/BID/REVEAL integration through the supported backend
- [ ] 15-04-PLAN.md — Supported-path docs/env alignment and Base Sepolia sign-off evidence

### Phase 16: Write agent auction skill and autonomous participation playbook

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 15
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 16 to break down)
