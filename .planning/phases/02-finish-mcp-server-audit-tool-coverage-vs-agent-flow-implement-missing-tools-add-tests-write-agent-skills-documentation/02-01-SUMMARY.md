---
phase: 02-finish-mcp-server
plan: 01
subsystem: api
tags: [mcp, tools, error-handling, settlement, zod]

# Dependency graph
requires:
  - phase: 01-fix-nft-support-gaps
    provides: MCP server with 7 agent tools
provides:
  - check_settlement_status tool for post-auction monitoring
  - Shared toolError/toolSuccess response helpers
  - Structured error responses (code/detail/suggestion) across all tools
affects: [02-02, 02-03, agent-client]

# Tech tracking
tech-stack:
  added: []
  patterns: [structured-error-responses, tool-response-helpers]

key-files:
  created:
    - mcp-server/src/lib/tool-response.ts
    - mcp-server/src/tools/settlement.ts
  modified:
    - mcp-server/src/index.ts
    - mcp-server/src/tools/discover.ts
    - mcp-server/src/tools/details.ts
    - mcp-server/src/tools/bond.ts
    - mcp-server/src/tools/events.ts
    - mcp-server/src/tools/reveal.ts

key-decisions:
  - "Settlement tool is read-only (no signer config) — uses existing GET /auctions/:id endpoint"
  - "Error code taxonomy: AUCTION_NOT_FOUND, ENGINE_ERROR, MISSING_CONFIG, PARTICIPANT_REQUIRED, REVEAL_MISMATCH, REVEAL_WINDOW_CLOSED, BOND_NOT_CONFIRMED"
  - "toolError returns {success: false, error: {code, detail, suggestion}} — agents can programmatically handle errors"

patterns-established:
  - "toolError pattern: all MCP tool error paths return structured {code, detail, suggestion} via shared helper"
  - "toolSuccess pattern: wrap happy-path data with {success: true, ...data} via shared helper"

requirements-completed: [MCP-TOOL-01, MCP-ERR-01, MCP-ZOD-01]

# Metrics
duration: 3min
completed: 2026-03-04
---

# Phase 02 Plan 01: Settlement Tool and Error Standardization Summary

**check_settlement_status tool with contextual suggestions, plus structured toolError/toolSuccess responses across all 8 MCP tools**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-04T15:47:57Z
- **Completed:** 2026-03-04T15:50:57Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- New check_settlement_status tool returns focused settlement view (status label, isSettled, winner info, contextual suggestion)
- Shared toolError/toolSuccess helpers eliminate raw error strings across all tools
- All 5 updated tools (discover, details, bond x2, events, reveal) now return structured errors with code, detail, and suggestion
- Zero `throw new Error` remaining in tool error paths — agents can programmatically parse all errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared tool-response helpers and check_settlement_status tool** - `d37317e` (feat)
2. **Task 2: Standardize error responses and Zod .describe() across all tools** - `53c3f73` (feat)

## Files Created/Modified
- `mcp-server/src/lib/tool-response.ts` - Shared toolError and toolSuccess helper functions
- `mcp-server/src/tools/settlement.ts` - check_settlement_status tool with status-dependent suggestions
- `mcp-server/src/index.ts` - Registration of settlement tool
- `mcp-server/src/tools/discover.ts` - Wrapped engine.get with ENGINE_ERROR handling
- `mcp-server/src/tools/details.ts` - Added AUCTION_NOT_FOUND and ENGINE_ERROR handling
- `mcp-server/src/tools/bond.ts` - Replaced throws with MISSING_CONFIG, added ENGINE_ERROR and BOND_NOT_CONFIRMED
- `mcp-server/src/tools/events.ts` - Added PARTICIPANT_REQUIRED and ENGINE_ERROR handling
- `mcp-server/src/tools/reveal.ts` - Added MISSING_CONFIG, REVEAL_MISMATCH, REVEAL_WINDOW_CLOSED, ENGINE_ERROR

## Decisions Made
- Settlement tool is read-only (no signer config) — reuses existing GET /auctions/:id endpoint and extracts a focused view
- Error code taxonomy standardized: AUCTION_NOT_FOUND, ENGINE_ERROR, MISSING_CONFIG, PARTICIPANT_REQUIRED, REVEAL_MISMATCH, REVEAL_WINDOW_CLOSED, BOND_NOT_CONFIRMED
- toolError returns `{success: false, error: {code, detail, suggestion}}` — agents can programmatically handle errors and take corrective action
- join.ts and bid.ts left unchanged — they already have structured error handling via zkError pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 8 MCP tools now registered (discover, details, join, bid, bond x2, events, reveal, settlement)
- All tools return structured errors — ready for test suite in plan 02-02
- toolError/toolSuccess helpers available for any future tools

## Self-Check: PASSED

- All 8 files verified present on disk
- Commit d37317e verified in git log
- Commit 53c3f73 verified in git log

---
*Phase: 02-finish-mcp-server*
*Completed: 2026-03-04*
