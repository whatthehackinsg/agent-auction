---
phase: 11-internal-skill-and-prompt-cleanup
plan: 02
subsystem: mcp-server+internal-docs
tags: [cleanup, prompts, docs, mcp, zk]
requires:
  - phase: 11-internal-skill-and-prompt-cleanup
    plan: 01
    provides: removal of stale local skill artifacts and current `check_identity` guidance
provides:
  - live MCP helper text aligned with the post-Phase-13 lifecycle
  - canonical internal README note and historical-record explanation
  - removal of stale manual privacy-bootstrap wording from active join/bid preflight errors
affects: [phase-11-uat, mcp-server]
tech-stack:
  added: []
  patterns:
    - Live prompts and helper text describe the fail-closed proof path explicitly instead of implying optional proof generation
    - Internal cleanup may extend to newly discovered active helper surfaces when they still emit stale operator guidance
key-files:
  created: []
  modified:
    - mcp-server/src/tools/settlement.ts
    - mcp-server/src/prompts.ts
    - mcp-server/src/lib/identity-check.ts
    - mcp-server/README.md
    - mcp-server/AGENTS.md
    - docs/zk-fix-deployment-steps.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
key-decisions:
  - "`mcp-server/README.md` is now the canonical internal landing page, with a brief note that preserved `.planning/**` history may still mention removed skill files."
  - "JOIN and BID guidance now explicitly describes `AGENT_STATE_FILE` as the normal fail-closed proof source and `proofPayload` as the advanced override."
  - "Cancelled and post-auction guidance now hands agents to `claim_refund` and `withdraw_funds`, not raw contract calls."
patterns-established:
  - "When an active helper library still emits stale operator guidance, Phase 11 cleanup can absorb it even if it was not listed in the original file table."
requirements-completed:
  - SKIL-02
  - SKIL-03
duration: 25m
completed: 2026-03-07
---

# Phase 11 Plan 02: Live Helper Surface Cleanup Summary

**Active MCP prompts, module docs, and preflight guidance now match the current autonomous lifecycle instead of older manual flows**

## Performance

- **Duration:** ~25m
- **Completed:** 2026-03-07T08:27:00+08:00
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Updated settlement guidance so cancelled auctions point agents to `claim_refund` and `withdraw_funds` instead of raw `claimRefund()` contract advice.
- Tightened the prompt templates around the current fail-closed JOIN/BID flow, explicitly calling out `AGENT_STATE_FILE` as the normal proof source and `proofPayload` as the advanced override.
- Promoted `mcp-server/README.md` to the clear internal landing page and added the brief note explaining why preserved `.planning/**` records may still mention removed legacy skill files.
- Refreshed `mcp-server/AGENTS.md` so the local module instructions match the real 15-tool MCP surface, current env vars, and the `deposit_bond` primary / `post_bond` fallback split.
- Updated `docs/zk-fix-deployment-steps.md` to describe sealed-bid verification without the retired proof toggle wording.
- Cleaned one extra live surface discovered during execution: `mcp-server/src/lib/identity-check.ts` no longer tells JOIN/BID callers to run manual `prepareOnboarding()` / `registerOnChain()` steps.

## Task Commits

No commits were created during this local execution pass.

## Files Created/Modified

- `mcp-server/src/tools/settlement.ts` - updated cancelled-auction next-step guidance
- `mcp-server/src/prompts.ts` - made JOIN/BID proof behavior explicit in the current autonomous workflow
- `mcp-server/src/lib/identity-check.ts` - replaced stale manual privacy-bootstrap recovery text with current MCP recovery guidance
- `mcp-server/README.md` - marked it as the canonical internal landing page and added the historical-record note
- `mcp-server/AGENTS.md` - refreshed module-local instructions, commands, tool families, and env vars
- `docs/zk-fix-deployment-steps.md` - removed retired proof-toggle wording from the sealed-bid verification section
- `.planning/ROADMAP.md` - recorded the new Phase 11 plan inventory and execution status
- `.planning/STATE.md` - recorded Phase 11 execution completion and readiness for verification

## Decisions Made

- Kept Phase 11 internal-only: the cleanup stops at repo-local prompts/docs and does not define the external AgentKit standard or public playbook.
- Treated `mcp-server/src/lib/identity-check.ts` as in scope because stale JOIN/BID preflight recovery text would otherwise survive in active tool errors.

## Deviations from Plan

- Minor scope extension: `mcp-server/src/lib/identity-check.ts` was added after the initial scan exposed live stale privacy-bootstrap guidance there.

## Issues Encountered

- The first stale-term grep sweep caught two non-behavioral leftovers: an explanatory warning in `mcp-server/AGENTS.md` and helper-function names in the deployment doc. Both were rewritten so the active-surface verification is literal-clean.

## User Setup Required

None.

## Next Phase Readiness

- Phase 11 execution is complete.
- The next step is `$gsd-verify-work 11` to confirm the internal cleanup from a verification/UAT perspective before marking the phase complete.

## Self-Check: PASSED

- `cd mcp-server && npx tsc --noEmit`
- `cd mcp-server && npx vitest run test/identity.test.ts test/join.test.ts test/bid.test.ts`
- `cd /Volumes/MainSSD/HomeData/zengy/workspace/auction-design && if rg -n "selfRegister\\(|generateProof|claimRefund\\(|registerOnChain\\(|prepareOnboarding\\(" mcp-server/src/tools/identity.ts mcp-server/src/tools/settlement.ts mcp-server/src/prompts.ts mcp-server/README.md mcp-server/AGENTS.md docs/zk-fix-deployment-steps.md mcp-server/src/lib/identity-check.ts; then exit 1; else echo "stale internal guidance removed"; fi`
- `cd /Volumes/MainSSD/HomeData/zengy/workspace/auction-design && rg -n "register_identity|deposit_bond|claim_refund|withdraw_funds|AGENT_STATE_FILE|proofPayload|\\.planning/\\*\\*" mcp-server/src/tools/identity.ts mcp-server/src/tools/settlement.ts mcp-server/src/prompts.ts mcp-server/README.md mcp-server/AGENTS.md docs/zk-fix-deployment-steps.md mcp-server/src/lib/identity-check.ts`
