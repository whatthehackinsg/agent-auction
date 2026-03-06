---
phase: 09-zk-enforcement
plan: 01
subsystem: api
tags: [zk, groth16, mcp, cloudflare-workers, erc-8004]
requires:
  - phase: 08-participant-privacy
    provides: privacy-preserving auction participation built around zkNullifier flows
provides:
  - Engine proof enforcement defaults to fail-closed for JOIN and BID actions
  - MCP join_auction and place_bid auto-generate proofs from AGENT_STATE_FILE with readiness checks
  - check_identity exposes a single readyToParticipate flag for auction participation
  - mcp-server/.env.example documents the required ZK participation configuration
affects: [phase-09-02-test-hardening, phase-10-autonomous-mcp-tools, phase-11-skill-rewrite, engine, mcp-server]
tech-stack:
  added: []
  patterns:
    - Default-true security toggles for proof enforcement
    - Auto-generated ZK proofs with local readiness pre-flight and advanced proof overrides
key-files:
  created: []
  modified:
    - engine/src/auction-room.ts
    - engine/src/handlers/actions.ts
    - mcp-server/src/lib/identity-check.ts
    - mcp-server/src/tools/join.ts
    - mcp-server/src/tools/bid.ts
    - mcp-server/src/tools/identity.ts
    - mcp-server/.env.example
key-decisions:
  - "ENGINE_REQUIRE_PROOFS now defaults to enabled unless explicitly set to 'false' so ZK enforcement is fail-closed by default."
  - "MCP join_auction and place_bid now auto-generate proofs whenever proofPayload is omitted, while keeping proofPayload as the advanced override path."
  - "check_identity keeps detailed diagnostics but collapses operator guidance to one readyToParticipate flag that depends on both ERC-8004 verification and privacy registry registration."
patterns-established:
  - "Structured PROOF_REQUIRED engine responses: missing JOIN/BID proofs return error/detail/suggestion JSON."
  - "Participation readiness pre-flight: verify identity, privacy registry membership, and local AGENT_STATE_FILE before generating proofs."
requirements-completed: [ZKRQ-01, ZKRQ-02, ZKRQ-03, ZKRQ-04]
duration: 15min
completed: 2026-03-06
---

# Phase 9 Plan 01: ZK Enforcement Summary

**Default-on engine proof enforcement with MCP auto-generated JOIN/BID proofs and a single readiness signal for participation**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-06T07:00:00Z (approx)
- **Completed:** 2026-03-06T07:14:51Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Engine JOIN and BID validation now reject missing proofs with structured `PROOF_REQUIRED` responses, and `ENGINE_REQUIRE_PROOFS` defaults to enabled unless explicitly set to `false`.
- MCP `join_auction` and `place_bid` no longer expose `generateProof`; they auto-generate proofs from `AGENT_STATE_FILE` or return a fail-closed `ZK_STATE_REQUIRED` error when no proof source is available.
- `check_identity` now reports one actionable `readyToParticipate` flag while keeping diagnostic detail fields, and `.env.example` clearly separates required and optional configuration.

## Task Commits

Each task was committed atomically:

1. **Task 1: Engine default flip + MCP tool ZK enforcement** - `679790d` (feat)
2. **Task 2: Unify check_identity readiness + update .env.example** - `cd4d585` (feat)

## Files Created/Modified

- `engine/src/auction-room.ts` - defaults proof enforcement on and serializes structured proof-required errors
- `engine/src/handlers/actions.ts` - throws explicit proof-required errors for JOIN and BID before validation proceeds
- `mcp-server/src/lib/identity-check.ts` - adds participation readiness checks for privacy membership and local agent state availability
- `mcp-server/src/tools/join.ts` - removes `generateProof` and auto-generates membership proofs when no override is provided
- `mcp-server/src/tools/bid.ts` - removes `generateProof` and auto-generates bid-range proofs when no override is provided
- `mcp-server/src/tools/identity.ts` - collapses readiness output to a single `readyToParticipate` flag
- `mcp-server/.env.example` - groups mandatory ZK participation variables under `# Required`

## Decisions Made

- Defaulted proof enforcement to enabled unless explicitly disabled so the engine behaves fail-closed without extra configuration.
- Kept `proofPayload` as the advanced escape hatch for externally generated proofs while removing the boolean opt-in path.
- Left `check_identity` focused on remote verification only; local `AGENT_STATE_FILE` checks happen in MCP write-tool pre-flight instead.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Git staging and commit commands required escalated permissions because `.git` writes were blocked in the default sandbox path. The implementation and verification work itself stayed within the workspace.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase `09-02` can harden tests around the new default-on proof enforcement and MCP proof auto-generation flow.
- Phase `10` can rely on the unified `readyToParticipate` signal and the required env-var documentation when adding autonomous registration/deposit/withdraw tools.

## Self-Check: PASSED

- FOUND: `.planning/phases/09-zk-enforcement/09-01-SUMMARY.md`
- FOUND: `679790d`
- FOUND: `cd4d585`
