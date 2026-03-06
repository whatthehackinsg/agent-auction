---
phase: 12-debug-live-phase-10-registration-and-proof-failures
plan: 02
subsystem: api
tags: [mcp, engine, zk, proof-diagnostics, base-sepolia]
requires:
  - phase: 12-debug-live-phase-10-registration-and-proof-failures
    plan: 01
    provides: truthful register_identity reconciliation
provides:
  - reasoned JOIN proof failures across engine and MCP
  - fail-closed detection of missing vs unreadable on-chain privacy proof state
  - MCP-side local-vs-on-chain proof-state comparison for auto-generated JOIN proofs
affects: [verify-work, join_auction, check_identity, base-sepolia-uat]
tech-stack:
  added: []
  patterns:
    - Structured fail-closed JOIN diagnostics instead of generic proof failures
    - MCP-side proof-state reconciliation against on-chain privacy state when BASE_SEPOLIA_RPC is configured
key-files:
  created: []
  modified:
    - engine/src/lib/identity.ts
    - engine/src/lib/crypto.ts
    - engine/src/handlers/actions.ts
    - engine/test/actions.test.ts
    - engine/test/join-proof.test.ts
    - mcp-server/src/lib/proof-generator.ts
    - mcp-server/src/tools/join.ts
    - mcp-server/test/join.test.ts
key-decisions:
  - "JOIN now rejects explicitly when per-agent privacy state is unreadable or incomplete instead of collapsing that into Invalid membership proof."
  - "MCP refines preflight PRIVACY_NOT_REGISTERED into real on-chain proof-state diagnostics when BASE_SEPOLIA_RPC is available."
  - "The live Base Sepolia blocker is the deployed AgentPrivacyRegistry contract shape, not the local witness math."
patterns-established:
  - "Engine membership verification returns stable reason strings: groth16_invalid, registry_root_mismatch, capability_commitment_mismatch, privacy_state_missing, privacy_state_unreadable."
  - "Auto-generated JOIN proofs anchor to validated on-chain Poseidon root when the per-agent proof state is readable."
requirements-completed: [TOOL-02, ZKRQ-01]
duration: 41min
completed: 2026-03-06
---

# Phase 12 Plan 02: Join Proof Diagnostics Summary

**JOIN failures are now diagnosable end to end, and live Base Sepolia evidence points to a legacy privacy-registry deployment mismatch rather than a silent proof bug**

## Performance

- **Duration:** 41 min
- **Started:** 2026-03-06T13:17:00Z (approx)
- **Completed:** 2026-03-06T13:58:26Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Extended engine membership verification so it returns stable failure reasons instead of a bare `valid=false`.
- Added fail-closed JOIN handling for `PRIVACY_STATE_MISSING` and `PRIVACY_STATE_UNREADABLE`, including the legacy global-root contract case.
- Added MCP-side comparison between the local `agent-N.json` witness and the on-chain per-agent proof state when `BASE_SEPOLIA_RPC` is configured.
- Refined join preflight so a generic `PRIVACY_NOT_REGISTERED` result can be upgraded into the actual on-chain root cause before the user sees it.

## Task Commits

No commits were created during this local execution pass.

## Files Created/Modified

- `engine/src/lib/identity.ts` - added discriminated per-agent privacy-state reads and legacy-global-root detection
- `engine/src/lib/crypto.ts` - added reasoned membership-proof verification results and mismatch details
- `engine/src/handlers/actions.ts` - maps proof-state failures into structured fail-closed JOIN errors
- `engine/test/actions.test.ts` - covers missing/unreadable privacy-state rejection and valid JOIN regression safety
- `engine/test/join-proof.test.ts` - covers `groth16_invalid`, `registry_root_mismatch`, and `capability_commitment_mismatch`
- `mcp-server/src/lib/proof-generator.ts` - added local proof-state computation plus on-chain proof-state reads/detection
- `mcp-server/src/tools/join.ts` - compares local vs on-chain proof state, parses structured engine errors, and upgrades preflight privacy failures into actionable JOIN diagnostics
- `mcp-server/test/join.test.ts` - covers pre-submit mismatch detection, unreadable legacy-registry guidance, and structured engine error passthrough

## Decisions Made

- Kept JOIN fail-closed. No manual override or proof bypass was introduced to force a live join through.
- Treated the current Base Sepolia privacy-registry deployment as an environment blocker that must be surfaced honestly, not hidden behind a generic proof error.
- Preserved the no-`BASE_SEPOLIA_RPC` path: when the RPC is absent, JOIN still relies on engine-side enforcement rather than weakening checks.

## Deviations from Plan

- The final live success criterion could not be completed because the configured Base Sepolia `AgentPrivacyRegistry` at `0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff` is still the legacy global-root deployment. It supports `getRoot()` / `agentCount()` but the per-agent getters required by the current JOIN path revert.

## Issues Encountered

- Live Base Sepolia reads for agent `1515` showed:
  - local state file: `/tmp/agent-auction-phase10-uat/agent-1515.json`
  - local Poseidon root: `14496776791783220509489969644252034286868294349187156661259482586319742527608`
  - local capability commitment: `14776124275662696026820666939511180056789979755141562500645596051861329713829`
  - legacy registry root at `0x857E...`: `0xca223b34b59d6362ccffa90e04ebaa12ea40bb6d5ef3d9b611e2231126cc50f2`
  - legacy agent count: `2`
  - `getAgentPoseidonRoot(1515)` reverted
  - `getAgentCapabilityCommitment(1515)` reverted
- This means the live blocker is the deployed contract/interface mismatch, not an unexplained local proof-generation failure.

## User Setup Required

- Redeploy or repoint `AgentPrivacyRegistry` to the per-agent contract that exposes:
  - `getAgentPoseidonRoot(uint256)`
  - `getAgentCapabilityCommitment(uint256)`
- After that, rerun `register_identity` for the target agent so local witness state and on-chain privacy registration are aligned, then retry `deposit_bond -> join_auction`.

## Next Phase Readiness

- The codebase now explains the live JOIN failure truthfully and fail-closed.
- A follow-up deploy/config phase is still required before Phase 12 can satisfy its live-success criterion on Base Sepolia.

## Self-Check: PASSED

- `cd engine && npm run typecheck && npm run test -- test/actions.test.ts test/join-proof.test.ts`
- `cd mcp-server && npm run typecheck && npx vitest run test/join.test.ts`
