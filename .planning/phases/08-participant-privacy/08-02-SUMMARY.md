---
phase: 08-participant-privacy
plan: 02
subsystem: mcp-server
tags: [mcp, privacy, nullifier, rest-polling, self-recognition, poseidon]

# Dependency graph
requires:
  - phase: 08-participant-privacy-01
    provides: Engine privacy masking (WebSocket + REST endpoints return zkNullifier instead of agentId)
provides:
  - monitor_auction MCP tool with REST polling and nullifier-based self-recognition
  - Privacy-masked get_auction_events output (zkNullifier, no wallet)
affects: [09-spectator-websocket, 10-agent-strategy, 11-skill-rewrite]

# Tech tracking
tech-stack:
  added: []
  patterns: [nullifier-based self-recognition, privacy-masked tool output, TDD for MCP tools]

key-files:
  created:
    - mcp-server/src/tools/monitor.ts
    - mcp-server/test/monitor.test.ts
  modified:
    - mcp-server/src/tools/events.ts
    - mcp-server/test/events.test.ts
    - mcp-server/src/index.ts

key-decisions:
  - "Self-recognition uses Set of hex-encoded nullifiers computed from agentSecret + auctionId"
  - "isOwn annotation omitted (not false) when AGENT_STATE_FILE is absent -- graceful degradation"
  - "Events tool maps agent_id to zkNullifier field, wallet intentionally omitted from output"

patterns-established:
  - "Nullifier self-recognition: compute own JOIN+BID nullifiers, compare against event agent_id"
  - "Privacy-masked tool output: use zkNullifier as identity field, never expose agentId or wallet"

requirements-completed: [PRIV-02]

# Metrics
duration: 4m
completed: 2026-03-05
---

# Phase 8 Plan 2: MCP Privacy Tools Summary

**REST-polling monitor_auction tool with Poseidon nullifier self-recognition, and privacy-masked get_auction_events returning zkNullifier instead of agentId**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-05T19:22:39Z
- **Completed:** 2026-03-05T19:26:59Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- New `monitor_auction` tool: polls engine snapshot + events via REST with participantToken, annotates own events with `isOwn: true` via nullifier match
- Updated `get_auction_events` to return privacy-masked output: `zkNullifier` replaces `agentId`, `wallet` omitted
- 12 new tests (6 monitor, 6 events) all passing; total MCP test suite at 49 tests
- Graceful degradation: when AGENT_STATE_FILE is not configured, `isOwn` annotation is omitted entirely

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1: monitor_auction tool** - RED: `82631b4` (test) -> GREEN: `592f617` (feat)
2. **Task 2: privacy-masked events** - RED: `a51af63` (test) -> GREEN: `44e7512` (feat)

## Files Created/Modified
- `mcp-server/src/tools/monitor.ts` - New monitor_auction tool: REST polling + nullifier self-recognition
- `mcp-server/test/monitor.test.ts` - 6 tests covering polling, self-recognition, degradation, filtering, config errors
- `mcp-server/src/tools/events.ts` - Updated to output zkNullifier field, omit wallet, updated description
- `mcp-server/test/events.test.ts` - Updated + 2 new tests for privacy-masked output
- `mcp-server/src/index.ts` - Wire registerMonitorTool into server factory

## Decisions Made
- Self-recognition computes both JOIN and BID nullifiers upfront using `deriveNullifierBigInt` and stores them in a Set for O(1) lookup per event
- `isOwn` field is conditionally spread (omitted entirely, not set to false) when agent state is unavailable -- avoids misleading data
- Events tool description updated to clearly state "privacy-masked" and "zkNullifier only" to guide agent behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 08 (participant privacy) fully complete: engine masking (Plan 01) + MCP tools (Plan 02)
- All 49 MCP server tests pass, TypeScript clean
- Ready for Phase 09 (spectator WebSocket) or subsequent phases

## Self-Check: PASSED

All 5 files verified on disk. All 4 commit hashes found in git log.

---
*Phase: 08-participant-privacy*
*Completed: 2026-03-05*
