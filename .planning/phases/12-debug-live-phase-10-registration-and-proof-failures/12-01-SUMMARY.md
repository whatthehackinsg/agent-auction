---
phase: 12-debug-live-phase-10-registration-and-proof-failures
plan: 01
subsystem: api
tags: [mcp, onboarding, erc-8004, zk, readiness]
requires:
  - phase: 10-autonomous-mcp-tools
    provides: live UAT evidence for incorrect register_identity failure responses
provides:
  - reconciled register_identity success/failure contract based on final engine-visible readiness and local state-file presence
  - recovery warning metadata that distinguishes recovered onboarding from proven join success
  - targeted MCP regression coverage for recovered-ready and incomplete-onboarding branches
affects: [phase-12-02-join-proof-fix, verify-work, mcp-server]
tech-stack:
  added: []
  patterns:
    - Recovery-first onboarding responses that reconcile post-tx truth before surfacing MCP success or failure
    - Explicit distinction between identity readiness and fully proven join-path success
key-files:
  created: []
  modified:
    - mcp-server/src/tools/register-identity.ts
    - mcp-server/test/register-identity.test.ts
key-decisions:
  - "Recovered success now depends on a fresh /verify-identity postflight plus local state-file existence, not on the last intermediate step succeeding."
  - "register_identity warning output must stay honest about what was proven: identity/privacy visibility and local witness presence, not a completed JOIN."
patterns-established:
  - "Partial onboarding failures reconcile through the engine before returning an MCP result."
  - "Recovered-success responses include warning metadata instead of silently flattening the mismatch."
requirements-completed: [TOOL-01]
duration: 18min
completed: 2026-03-06
---

# Phase 12 Plan 01: Registration Truthfulness Summary

**Reconciled `register_identity` output now reflects final readiness truth and local witness availability instead of trusting intermediate onboarding failures**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-06T13:20:00Z (approx)
- **Completed:** 2026-03-06T13:37:40Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added a reconciliation path in `register_identity` so minted identities can recover to success-with-warning when `/verify-identity` confirms they are actually ready and the local `agent-N.json` exists.
- Added explicit incomplete-onboarding handling that returns `nextAction`, reconciled readiness details, and local state-file presence instead of a misleading hard failure.
- Tightened the response wording so recovered success is honest about the current gate: readiness is confirmed, but JOIN has not already been proven.

## Task Commits

No commits were created during this local execution pass.

## Files Created/Modified

- `mcp-server/src/tools/register-identity.ts` - reconciles partial failures through `/verify-identity`, returns recovered success with warning metadata, and fail-closes when local state is still missing or readiness remains incomplete
- `mcp-server/test/register-identity.test.ts` - covers recovered-ready success, incomplete onboarding recovery details, and the missing-state-file fail-closed branch

## Decisions Made

- Kept `/verify-identity` as the source of engine-visible readiness truth for this plan rather than broadening the contract to full JOIN validation inside `register_identity`.
- Required local state-file existence in addition to green readiness before recovered success can be returned.
- Made the warning payload explicit that readiness confirmation does not imply `join_auction` has already succeeded.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The delegated Wave 1 executor was interrupted after writing the core code changes. This local pass audited the resulting implementation, reran the targeted checks, and completed the missing summary/bookkeeping work.

## User Setup Required

None - no new setup beyond the existing `AGENT_PRIVATE_KEY` and `BASE_SEPOLIA_RPC` requirements for live onboarding.

## Next Phase Readiness

- Phase `12-02` can now assume `register_identity` tells the truth about reconciled onboarding outcomes instead of leaving JOIN debugging anchored to misleading registration failures.
- The remaining live issue is now cleanly isolated to proof-state alignment and engine/MCP diagnostics for `join_auction`.

## Self-Check: PASSED

- `cd mcp-server && npm run typecheck`
- `cd mcp-server && npx vitest run test/register-identity.test.ts`
