---
phase: 10-autonomous-mcp-tools
plan: 03
subsystem: api
tags: [mcp, escrow, refunds, withdrawals, viem]
requires:
  - phase: 10-autonomous-mcp-tools
    provides: shared on-chain helpers plus multi-identity write-target resolution
provides:
  - claim_refund with auction-state preflight, idempotent already-withdrawable handling, and withdraw handoff
  - withdraw_funds with owner authorization checks, balance preflight, and full withdrawal summaries
affects: [phase-10-04-docs, mcp-server]
tech-stack:
  added: []
  patterns:
    - Exit tools that combine engine-side auction context with on-chain escrow preflights
    - Balance-first withdrawal UX: explain destination and withdrawable amount before spending gas
key-files:
  created:
    - mcp-server/src/tools/exits.ts
    - mcp-server/test/exits.test.ts
  modified:
    - mcp-server/src/index.ts
key-decisions:
  - "claim_refund only proceeds when the auction is SETTLED or CANCELLED, and settled winners are explicitly redirected to withdraw_funds instead."
  - "Already-withdrawable refund cases are treated as idempotent success states instead of low-level revert surfacing."
  - "withdraw_funds enforces ERC-8004 owner authorization in MCP before sending the escrow withdrawal transaction."
patterns-established:
  - "Exit tools return nextAction guidance so agents move from refund to withdraw without re-planning the flow."
  - "Preflight-first exit design avoids unnecessary RPC client creation and on-chain writes for obviously ineligible auctions."
requirements-completed: [TOOL-03, TOOL-04]
duration: 14min
completed: 2026-03-06
---

# Phase 10 Plan 03: Autonomous Exit Tools Summary

**Refund and withdrawal MCP tools that preflight auction/escrow state, avoid opaque reverts, and hand agents directly into the next exit action**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-06T19:29:00+08:00 (approx)
- **Completed:** 2026-03-06T19:43:00+08:00
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `claim_refund`, which checks auction state before touching escrow, blocks OPEN/CLOSED auctions, redirects settled winners away from refund, and returns an explicit handoff to `withdraw_funds` after success.
- Added `withdraw_funds`, which preflights owner authorization, current withdrawable balance, and designated wallet, then returns a full summary when funds are withdrawn.
- Added focused exit tests covering ineligible auctions, settled-loser refund success, already-withdrawable idempotence, empty-withdraw no-ops, authorization failures, and successful withdrawals.

## Task Commits

No commits were created during this local execution pass.

## Files Created/Modified

- `mcp-server/src/tools/exits.ts` - implements both exit tools using shared escrow and identity helpers
- `mcp-server/src/index.ts` - wires the exit tool module into the MCP server
- `mcp-server/test/exits.test.ts` - verifies refund eligibility, idempotence, authorization, and withdrawal summaries

## Decisions Made

- Treated already-withdrawable refund situations as successful idempotent states because the user-facing next step is still `withdraw_funds`, not another refund tx.
- Kept `withdraw_funds` owner-only in MCP even though the contract has an admin path, because this phase is about autonomous agent exits rather than operator admin tooling.
- Delayed RPC client creation in `claim_refund` until after engine-side auction status checks to avoid unnecessary on-chain setup for clearly ineligible auctions.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first implementation of `claim_refund` created RPC clients before checking engine auction status; the new exit tests caught that and the tool was tightened so OPEN/CLOSED failures short-circuit earlier.

## User Setup Required

None - exit tools only rely on the existing write-tool configuration (`AGENT_PRIVATE_KEY`, `AGENT_ID`, `BASE_SEPOLIA_RPC`).

## Next Phase Readiness

- Phase `10-04` can now document a complete autonomous lifecycle: register, bond, participate, claim refund, and withdraw funds.
- MCP prompts and README examples can reference real tool names instead of direct contract calls for post-auction exits.

## Self-Check: PASSED

- `cd mcp-server && npm run typecheck`
- `cd mcp-server && npx vitest run test/exits.test.ts`
- `cd mcp-server && npm test`
