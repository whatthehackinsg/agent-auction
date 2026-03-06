---
phase: 10-autonomous-mcp-tools
plan: 04
subsystem: docs
tags: [mcp, prompts, docs, env, lifecycle]
requires:
  - phase: 10-autonomous-mcp-tools
    provides: final autonomous tool surface for registration, bonding, participation, refunds, and withdrawals
provides:
  - MCP prompts that teach the autonomous Phase 10 lifecycle in the right tool order
  - README and env docs aligned with the actual on-chain MCP surface
affects: [phase-11-skill-rewrite, mcp-server]
tech-stack:
  added: []
  patterns:
    - MCP-local docs point agents to autonomous tools first and relegate manual fallbacks to advanced guidance
key-files:
  created: []
  modified:
    - mcp-server/src/prompts.ts
    - mcp-server/README.md
    - mcp-server/.env.example
key-decisions:
  - "Prompt guidance now treats register_identity -> deposit_bond -> join_auction -> place_bid -> claim_refund/withdraw_funds as the normal MCP lifecycle."
  - "post_bond remains documented, but only as the advanced/manual fallback when a transfer already happened outside the autonomous path."
  - "Phase 10 doc updates stay inside the mcp-server boundary and do not rewrite standalone skill docs reserved for Phase 11."
patterns-established:
  - "Prompt and README language reflects the privacy boundary accurately: write tools may target explicit agentId values, while read-side outputs remain masked or nullifier-based."
requirements-completed: []
duration: 10min
completed: 2026-03-06
---

# Phase 10 Plan 04: MCP Guidance Summary

**MCP-server-local prompts and docs now teach the autonomous registration, bonding, participation, refund, and withdrawal loop instead of the old manual transfer flow**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-06T19:43:00+08:00 (approx)
- **Completed:** 2026-03-06T19:53:00+08:00
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Updated MCP prompts so the primary workflow now starts with `register_identity`, uses `deposit_bond` as the default bond path, and routes post-auction exits through `claim_refund` and `withdraw_funds`.
- Refreshed the README tool table, environment variable docs, source-structure notes, and lifecycle example so they match the real Phase 10 tool surface.
- Updated `.env.example` to document the final on-chain MCP config surface, including `BASE_SEPOLIA_RPC`, `AGENT_STATE_DIR`, and optional `BOND_FUNDING_PRIVATE_KEY`.

## Task Commits

No commits were created during this local execution pass.

## Files Created/Modified

- `mcp-server/src/prompts.ts` - rewrites MCP guidance around the autonomous Phase 10 lifecycle and new error cases
- `mcp-server/README.md` - documents the expanded tool set, autonomous lifecycle, and final env surface
- `mcp-server/.env.example` - reflects the real config required for autonomous on-chain MCP tools

## Decisions Made

- Kept manual transfer proof handling in the docs, but only as the advanced fallback path behind `post_bond`.
- Updated prompt language to remove the old human-assisted refund/bond phrasing without expanding into the broader skill-doc rewrite reserved for Phase 11.
- Included the privacy boundary explicitly in prompt guidance so write-side explicit `agentId` support does not read as a regression in the masked read-side model.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The docs verification for “old manual phrasing removed” required interpreting an empty `rg` result as success rather than failure, since `rg` exits with status 1 when no matches are found.

## User Setup Required

None - documentation only.

## Next Phase Readiness

- Phase `10` now has prompts, README, env docs, and implementation aligned around the same autonomous tool surface.
- Phase `11` can focus on the broader skill rewrite without needing to revisit MCP-server-local lifecycle wording first.

## Self-Check: PASSED

- `cd mcp-server && npx tsc --noEmit`
- `cd mcp-server && rg -n "register_identity|deposit_bond|claim_refund|withdraw_funds|BOND_FUNDING_PRIVATE_KEY" src/prompts.ts README.md .env.example`
- verified that `rg -n "ask your human operator|call claimRefund\\(\\) directly" src/prompts.ts README.md .env.example` returns no matches
