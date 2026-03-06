---
phase: 10-autonomous-mcp-tools
plan: 02
subsystem: api
tags: [mcp, bonding, usdc, viem, multi-identity]
requires:
  - phase: 10-autonomous-mcp-tools
    provides: shared on-chain helpers and agent-N.json persistence from register_identity
provides:
  - Explicit per-call agent targeting for MCP write tools without swapping global env
  - deposit_bond as the default autonomous USDC transfer plus engine acknowledgement flow
  - post_bond preserved as an explicit manual fallback with target agentId support
affects: [phase-10-03-exits, phase-10-04-docs, mcp-server]
tech-stack:
  added: []
  patterns:
    - Shared write-target resolution for agentId, signer wallet, and state-file routing
    - Idempotent bond flows that short-circuit on existing PENDING or CONFIRMED state
key-files:
  created:
    - mcp-server/src/lib/agent-target.ts
  modified:
    - mcp-server/src/lib/config.ts
    - mcp-server/src/tools/join.ts
    - mcp-server/src/tools/bid.ts
    - mcp-server/src/tools/bond.ts
    - mcp-server/test/helpers.ts
    - mcp-server/test/join.test.ts
    - mcp-server/test/bid.test.ts
    - mcp-server/test/bond.test.ts
key-decisions:
  - "Explicit agent targeting is per-tool and uses AGENT_* env values only as defaults, so newly registered identities can be used immediately in the same MCP process."
  - "deposit_bond follows the real deployed path: direct USDC transfer to AuctionEscrow plus engine receipt verification, with no placeholder approve() or escrow deposit call."
  - "Funding-wallet overrides are allowed but fail early if the selected signer is not the ERC-8004 owner for the target agent."
patterns-established:
  - "resolveWriteTarget()/resolveBondTarget() centralize multi-identity routing and agent-N.json path selection."
  - "Bond tools return nextAction guidance so agents know whether to proceed to join_auction or re-check get_bond_status."
requirements-completed: [TOOL-02]
duration: 18min
completed: 2026-03-06
---

# Phase 10 Plan 02: Multi-Identity Bonding Summary

**Per-call agent targeting for MCP write tools plus an autonomous bond flow that transfers USDC to escrow and records the receipt with the engine**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-06T19:21:00+08:00 (approx)
- **Completed:** 2026-03-06T19:39:00+08:00
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added shared write-target resolution so `join_auction`, `place_bid`, and `post_bond` can target an explicit `agentId` and `agentStateFile` without restarting the MCP server or mutating env.
- Added `deposit_bond` as the normal bond path: it checks existing bond state, auto-loads the auction deposit amount, transfers USDC to escrow, submits the tx hash to the engine, and returns either `CONFIRMED` or a guided `PENDING` response.
- Preserved fail-closed behavior from Phase 09 while expanding tests to cover explicit identity overrides, idempotent bond handling, and manual `post_bond` fallback targeting.

## Task Commits

No commits were created during this local execution pass.

## Files Created/Modified

- `mcp-server/src/lib/config.ts` - adds optional `BOND_FUNDING_PRIVATE_KEY` parsing alongside existing MCP config
- `mcp-server/src/lib/agent-target.ts` - resolves explicit `agentId`, signer wallet, funding signer, and state-file path per tool call
- `mcp-server/src/tools/join.ts` - supports explicit `agentId` and `agentStateFile` overrides for participation
- `mcp-server/src/tools/bid.ts` - supports explicit `agentId` and `agentStateFile` overrides for bidding
- `mcp-server/src/tools/bond.ts` - adds `deposit_bond`, upgrades `post_bond` targeting, and keeps `get_bond_status` aligned
- `mcp-server/test/helpers.ts` - extends shared config defaults for bond-funding-aware tests
- `mcp-server/test/join.test.ts` - verifies multi-identity join overrides
- `mcp-server/test/bid.test.ts` - verifies multi-identity bid overrides
- `mcp-server/test/bond.test.ts` - verifies autonomous bond flow, idempotence, pending guidance, and manual fallback targeting

## Decisions Made

- Kept multi-identity targeting at the tool-input layer instead of introducing global mutable "active agent" state.
- Reused on-chain owner checks before funding transfers so mismatched funding-wallet overrides fail before USDC moves.
- Returned simple machine-readable `nextAction` fields from bond responses to steer agents into `join_auction` or `get_bond_status`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- TypeScript rejected use of the overloaded config helper from the new target-resolver module, so the final resolver performs the same validation inline instead of calling `requireSignerConfig()` with overrides.

## User Setup Required

None - `BOND_FUNDING_PRIVATE_KEY` is optional and only needed for advanced funding-wallet routing.

## Next Phase Readiness

- Phase `10-03` can reuse `mcp-server/src/lib/onchain.ts` plus `resolveWriteTarget()` to build refund and withdrawal flows without re-solving identity targeting.
- The docs/prompt phase can now describe `deposit_bond` as the default path while keeping `post_bond` as the manual fallback.

## Self-Check: PASSED

- `cd mcp-server && npm run typecheck`
- `cd mcp-server && npx vitest run test/join.test.ts test/bid.test.ts test/bond.test.ts`
- `cd mcp-server && npm test`
