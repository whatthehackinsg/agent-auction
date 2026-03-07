---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Autonomous Agent Onboarding
current_phase: 15
current_phase_name: Integrate AgentKit wallet adapter without breaking ZK or ERC-8004
current_plan: 0
status: planned
stopped_at: Phase 15 planned
last_updated: "2026-03-07T12:53:41Z"
last_activity: 2026-03-07
progress:
  total_phases: 10
  completed_phases: 9
  total_plans: 24
  completed_plans: 20
  percent: 90
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-05)

**Core value:** Working ZK proofs that actually verify — agents prove registry membership and bid range without revealing identity, demonstrated end-to-end.
**Current focus:** Phase 15 - Integrate the AgentKit wallet adapter without breaking ZK or ERC-8004, then Phase 16's external agent playbook

## Current Position

**Current Phase:** 15
**Current Phase Name:** Integrate AgentKit wallet adapter without breaking ZK or ERC-8004
**Total Phases:** 16
**Current Plan:** 0
**Total Plans in Phase:** 4
**Status:** Planned — ready to execute Phase 15
**Last Activity:** 2026-03-07

**Progress:** [█████████░] 90%

## Performance Metrics

**Velocity (v1.0):**
- Total plans completed: 14
- Average duration: ~3 min/plan
- Total execution time: ~42 min

**v1.1 plan metrics:**

| Phase/Plan | Duration | Tasks | Files |
|------------|----------|-------|-------|
| Phase 07-identity-verification P02 | 7m | 2 tasks | 3 files |
| Phase 07 P01 | 17 min | 1 tasks | 5 files |
| Phase 08 P01 | 12m | 2 tasks | 7 files |
| Phase 08 P02 | 4m | 2 tasks | 5 files |
| Phase 09-zk-enforcement P01 | 15m | 2 tasks | 7 files |
| Phase 09-zk-enforcement P02 | 23min | 2 tasks | 5 files |
| Phase 11-internal-skill-and-prompt-cleanup P01 | 20m | 2 tasks | 5 files |
| Phase 11-internal-skill-and-prompt-cleanup P02 | 25m | 2 tasks | 8 files |
| Phase 14 P01 | 11min | 2 tasks | 4 files |
| Phase 14 P02 | 9min | 2 tasks | 7 files |

## Accumulated Context

### Decisions

- [v1.1 roadmap]: Identity verification comes FIRST (Phase 7) — foundational for all downstream phases
- [v1.1 roadmap]: Participant privacy uses zkNullifier as pseudonym (not string masking) — cryptographically sound
- [v1.1 roadmap]: Phase 11 is now a narrow internal cleanup for stale skill/prompt artifacts; external agent guidance belongs to Phases 14-16
- [v1.1 investigation]: ENGINE_VERIFY_WALLET is OFF by default — any agent can claim any agentId without on-chain proof
- [v1.1 investigation]: Participant WebSocket broadcasts full agentId + wallet to all participants — privacy leak
- [v1.0]: All-Poseidon registration — single hash function throughout
- [Phase 07-identity-verification]: Centralized identity pre-flight in `mcp-server/src/lib/identity-check.ts` for consistent JOIN/BID gating
- [Phase 07-identity-verification]: MCP write tools fail closed when `/verify-identity` is unreachable; no action submission without verification
- [Phase 07]: Wallet verification now runs fresh on-chain per JOIN; DO cache bypass removed
- [Phase 07]: `ENGINE_VERIFY_WALLET=false` is only honored in insecure stub mode
- [Phase 07]: Identity lookup transport failures return `IDENTITY_RPC_FAILURE` and reject JOIN
- [Phase 08]: System events (`agentId=0`) pass through to participant sockets unmodified
- [Phase 08]: D1 events table gets `zk_nullifier` column for `/events` masking (migration 0004)
- [Phase 08]: `agentNullifierMap` persisted to DO storage for robustness across hibernation
- [Phase 08]: Self-recognition uses a Set of hex-encoded nullifiers computed from `agentSecret + auctionId`
- [Phase 08]: Events tool maps `agent_id` to `zkNullifier` and intentionally omits wallet in output
- [Phase 09-zk-enforcement]: `ENGINE_REQUIRE_PROOFS` now defaults to enabled unless explicitly set to false
- [Phase 09-zk-enforcement]: MCP `join_auction` and `place_bid` now auto-generate proofs from `AGENT_STATE_FILE` unless a `proofPayload` override is supplied
- [Phase 09-zk-enforcement]: `check_identity` now exposes a single `readyToParticipate` flag while keeping detailed diagnostic fields
- [Phase 09-zk-enforcement]: Proof-path tests now use real Groth16 payloads, while `ENGINE_ALLOW_INSECURE_STUBS` remains limited to EIP-712 signature bypass in tests
- [Phase 10]: Autonomous MCP lifecycle now includes `register_identity`, `deposit_bond`, `claim_refund`, and `withdraw_funds`
- [Phase 12]: Base Sepolia now uses per-agent `AgentPrivacyRegistry` `0x5b4f09A5D5188dCe1b1ba0caeDBcEb52CaCD1902`
- [Phase 13]: A permanent workerd/Miniflare harness now exercises the shared JOIN/BID verifier path and passes with the new backend
- [Phase 13]: Engine and MCP now share an explicit `PROOF_RUNTIME_UNAVAILABLE` contract for JOIN/BID verifier outages
- [Phase 13]: The engine verifier now uses a shared Worker-safe `verifyGroth16()` backend that loads imported/precompiled `.wasm` in Workers and raw bytes in Node
- [Phase 13]: Fresh local and deployed sign-off succeeded for `register_identity -> check_identity -> deposit_bond -> join_auction`
- [Phase 13]: Remote D1 schema and `d1_migrations` were reconciled so deployed JOIN can persist `zk_nullifier`
- [Phase 11]: The stale `.claude/skills/auction/*` tree is removed; `mcp-server/README.md` is now the canonical internal landing page while preserved `.planning/**` records remain untouched history
- [Phase 11]: Active MCP helper text now routes onboarding through `register_identity`, treats JOIN/BID as fail-closed `AGENT_STATE_FILE` / `proofPayload` flows, and points exits to `claim_refund` + `withdraw_funds`
- [Phase 11]: `11-UAT.md` passed 6/6 checks with no gaps, closing the internal cleanup phase
- [Phase 14]: The platform standard should center on `AgentKit + CDP Server Wallet`, with the current raw-key MCP path retained only as an advanced bridge and a new public setup-guide surface added for humans and agents
- [Phase 14]: The execution split is now two waves — canonical participation guide + repo alignment first, then the public `/participate` handoff page and frontend guide links
- [Phase 14]: `docs/participation-guide.md` is now the canonical operator-facing standard, and README/docs/MCP guidance now point to it consistently
- [Phase 14]: Active participation is defined around one persistent Base Sepolia owner wallet that spans ERC-8004 ownership, EIP-712 signing, and bond/refund flows
- [Phase 14]: The stable public handoff URL is the static /participate route, with all frontend surfaces importing the same shared constant instead of scattering links.
- [Phase 14]: The public guide mirrors `docs/participation-guide.md` with a checklist-first Supported / Advanced / Future matrix and deep links to repo docs rather than duplicating every implementation detail.
- [Phase 14]: Auction entry points may promote setup guidance, but they must stay spectator-first and avoid exposing identities, wallets, or per-agent bid history.

### Roadmap Evolution

- Phase 12 added: Debug live Phase 10 registration and proof failures
- Phase 13 added: Redeploy AgentPrivacyRegistry and repoint Base Sepolia config
- Phase 12-03 executed: deployed per-agent AgentPrivacyRegistry `0x5b4f09A5D5188dCe1b1ba0caeDBcEb52CaCD1902` and repointed engine/MCP
- Phase 13 re-scoped in execution: from registry redeploy placeholder to Worker proof-runtime compatibility and blocked-state sign-off
- Phase 14 added: Define the minimum supported participant stack and platform guidance for external agents/humans
- Phase 15 added: Integrate an AgentKit-compatible wallet adapter while preserving ZK proof and ERC-8004 ownership invariants
- Phase 16 added: Publish the external-facing agent auction skill and autonomous participation playbook
- Phase 11 re-scoped: internal stale skill/prompt cleanup only; public AgentKit participation guidance moved to Phases 14-16
- Phase 11 executed: removed stale internal skill artifacts and aligned live MCP helper/docs surfaces with the post-Phase-13 lifecycle
- Phase 11 verified complete: `11-UAT.md` passed with no gaps, and focus advances to Phase 14
- Phase 14 context captured: the supported stack policy, guidance surfaces, minimum requirements, and fallback model are now locked for planning
- Phase 14 planned: `PART-01` through `PART-04` are now defined in requirements, roadmap metadata is filled in, and `14-01` / `14-02` are ready for execution
- Phase 14 wave 1 executed: the canonical participation guide is published and repo guidance surfaces are aligned ahead of the public `/participate` page
- Phase 14 wave 2 executed: the public `/participate` handoff page and frontend setup-guide links are now live across landing and auction surfaces
- Phase 14 wave 2 executed: the public `/participate` handoff page, shared frontend guide links, and spectator-safe setup CTAs are now live in the codebase
- Phase 14 verified complete: `14-UAT.md` passed 7/7 checks, the public `/participate` route is accepted, and focus advances to Phase 15 planning
- Phase 15 context captured: the supported AgentKit/CDP adapter behavior, wallet bootstrap assumptions, identity/ZK handoff rules, and fallback boundaries are now locked for planning
- Phase 15 planned: `AKIT-01` through `AKIT-04` are mapped in requirements, roadmap metadata is filled in, and `15-01` through `15-04` are ready for execution

### Pending Todos

- Full live E2E demo on Base Sepolia (deferred from v1.0)
- CCIP Private Transactions future vision narrative (deferred from v1.0)

### Blockers/Concerns

- 1 pre-existing failing test (`bond-watcher.test.ts`, predates v1.0)
- Dead `expectedRegistryRoot` code block in `engine/src/lib/crypto.ts` (tech debt from v1.0)

### Fixes Applied (2026-03-05)

- **REVEAL EIP-712 deadline bug** (Critical) — engine `verifySignature` was missing `deadline` in the Reveal message and skipping deadline expiry checks for REVEAL. Fixed in `engine/src/handlers/actions.ts`.
- **CRE replay verification blocking local demo** (High) — `config.json` sim config now has `skipReplayVerification: true` so Phase C does not attempt to fetch from the deployed Workers URL during local development. Production config unchanged.
- **Settlement watcher missed events** (High) — `cre/scripts/settlement-watcher.ts` now runs a 500-block backfill on startup, replaying any `AuctionEnded` events missed while the watcher was offline.

## Session Continuity

Last activity: 2026-03-07 — Planned Phase 15 for the AgentKit/CDP adapter path
**Last session:** 2026-03-07T12:53:41Z
**Stopped At:** Phase 15 planned
**Resume File:** None
