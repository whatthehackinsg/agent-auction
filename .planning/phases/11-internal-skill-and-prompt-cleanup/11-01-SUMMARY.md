---
phase: 11-internal-skill-and-prompt-cleanup
plan: 01
subsystem: mcp-server+internal-docs
tags: [cleanup, mcp, identity, docs]
requires:
  - phase: 13-redeploy-agentprivacyregistry-and-repoint-base-sepolia-config
    provides: stabilized post-Worker-fix MCP toolchain
provides:
  - removal of the stale `.claude/skills/auction/*` tree
  - current `check_identity` missing-step guidance
  - regression coverage for the active readiness helper
affects: [phase-11-02, mcp-server]
tech-stack:
  added: []
  patterns:
    - Internal cleanup deletes stale local skill artifacts instead of preserving active-looking redirects
    - Active readiness guidance points agents to MCP tools first, not retired contract-level bootstrap steps
key-files:
  created:
    - mcp-server/test/identity.test.ts
  modified:
    - mcp-server/src/tools/identity.ts
  deleted:
    - .claude/skills/auction/SKILL.md
    - .claude/skills/auction/bond-management/SKILL.md
    - .claude/skills/auction/sealed-bid/SKILL.md
key-decisions:
  - "The old repo-internal `.claude/skills/auction/*` tree is removed outright with no redirect stubs or archive copies."
  - "`check_identity` now treats `register_identity` as the preferred MCP recovery path instead of teaching `selfRegister(uint256)` or hardcoded legacy registry addresses."
patterns-established:
  - "Wave 1 cleanup keeps historical `.planning/**` records untouched while removing only active stale guidance surfaces."
requirements-completed:
  - SKIL-01
duration: 20m
completed: 2026-03-07
---

# Phase 11 Plan 01: Skill Tree Removal and Identity Guidance Summary

**The stale repo-internal auction skill tree is gone, and `check_identity` now points to the live MCP onboarding path**

## Performance

- **Duration:** ~20m
- **Completed:** 2026-03-07T08:22:00+08:00
- **Tasks:** 2
- **Files modified:** 5 active files plus removal of the empty legacy skill tree

## Accomplishments

- Deleted the stale `.claude/skills/auction/` skill files that still taught `selfRegister`, optional proofs, and manual bond flows as normal behavior.
- Removed the now-empty `.claude/skills/auction/` directory tree after deleting its stale skill files.
- Updated `mcp-server/src/tools/identity.ts` so `check_identity` now points agents to `register_identity` and the post-Phase-10 onboarding path instead of retired contract-level steps.
- Added `mcp-server/test/identity.test.ts` to lock the new readiness guidance in place.

## Task Commits

No commits were created during this local execution pass.

## Files Created/Modified

- `.claude/skills/auction/SKILL.md` - deleted stale internal guidance
- `.claude/skills/auction/bond-management/SKILL.md` - deleted stale internal guidance
- `.claude/skills/auction/sealed-bid/SKILL.md` - deleted stale internal guidance
- `mcp-server/src/tools/identity.ts` - rewrote missing-step guidance around `register_identity`
- `mcp-server/test/identity.test.ts` - added regression coverage for the current readiness output

## Decisions Made

- Preferred tool-level recovery is now `register_identity`, even for partially configured identities, because that is the current supported MCP onboarding surface.
- Phase 11 keeps the cleanup narrow: delete stale local skill artifacts now, and leave any public-facing replacement skill work to later phases.

## Deviations from Plan

None - plan executed as intended.

## Issues Encountered

- The existing mock-engine helper intercepted `/verify-identity` in a way that made the first test draft misleading, so the final regression file uses focused inline engine stubs for clearer readiness cases.

## User Setup Required

None.

## Next Phase Readiness

- Wave 1 is complete.
- Wave 2 can now clean the remaining live MCP prompts and docs without the old local skill tree competing as an active source of truth.

## Self-Check: PASSED

- `cd mcp-server && npm run typecheck`
- `cd mcp-server && npx vitest run test/identity.test.ts`
- `cd /Volumes/MainSSD/HomeData/zengy/workspace/auction-design && test ! -e .claude/skills/auction/SKILL.md && test ! -e .claude/skills/auction/bond-management/SKILL.md && test ! -e .claude/skills/auction/sealed-bid/SKILL.md`
