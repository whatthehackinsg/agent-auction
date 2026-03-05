---
phase: 08-participant-privacy
plan: 01
subsystem: engine
tags: [privacy, websocket, zkNullifier, durable-objects, d1, participant-masking]

# Dependency graph
requires:
  - phase: 07-identity-verification
    provides: wallet verification, identity pre-flight on JOIN/BID
provides:
  - Three-tier WebSocket broadcast (participant privacy, public masked, internal raw)
  - Participant-aware snapshot with zkNullifier-based highestBidder
  - Privacy-masked /events endpoint for participant token holders
  - D1 zk_nullifier column for event persistence
  - agentNullifierMap for CLOSE event winner privacy
affects: [08-participant-privacy, 09-discovery-gating, mcp-server, agent-client]

# Tech tracking
tech-stack:
  added: []
  patterns: [three-tier-broadcast, participant-privacy-masking, system-event-passthrough]

key-files:
  created:
    - engine/migrations/0004_add_zk_nullifier_to_events.sql
  modified:
    - engine/src/auction-room.ts
    - engine/src/index.ts
    - engine/schema.sql
    - engine/test/websocket.test.ts
    - engine/test/api.test.ts
    - engine/test/auction-mechanics.test.ts
    - engine/test/sequencer.test.ts

key-decisions:
  - "System events (agentId='0') pass through to participant sockets unmodified -- CLOSE/CANCEL/DEADLINE_EXTENDED are not privacy-sensitive"
  - "agentNullifierMap persisted to DO storage for robustness across hibernation wakes"
  - "D1 events table gets zk_nullifier column (migration 0004) rather than joining with DO storage -- simpler query path"

patterns-established:
  - "Three-tier broadcast: participant (zkNullifier only), public (masked agentId), system events bypass privacy filter"
  - "Participant token validation against D1 JOIN events before tagging WebSocket or returning snapshot"

requirements-completed: [PRIV-01, PRIV-03]

# Metrics
duration: 12min
completed: 2026-03-05
---

# Phase 08 Plan 01: Participant Privacy Masking Summary

**Three-tier WebSocket broadcast with zkNullifier-only participant events, privacy-aware snapshots, and masked /events endpoint**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-05T19:07:22Z
- **Completed:** 2026-03-05T19:19:25Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- broadcastEvent sends three tiers: participant (zkNullifier only, no agentId/wallet), public (masked agentId, no wallet), with system events passing through to both tiers
- handleSnapshot returns highestBidder as zkNullifier for validated participant requests, masked agentId for public
- GET /events with participantToken returns privacy-masked events (agent_id replaced by zk_nullifier, wallet omitted)
- D1 events table now stores zk_nullifier column for queryable privacy data
- handleStream validates participantToken against D1 JOIN events (invalid tokens fall back to public tier)
- 10 new tests added (7 WebSocket privacy + 3 /events privacy), all 203 passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Three-tier broadcast + participant-aware snapshot + WS token validation** - `557f8d2` (feat)
2. **Task 2: Privacy-mask /events endpoint for participant requests** - `fac5e4d` (feat)

_Both tasks used TDD: failing tests written first, then implementation to pass._

## Files Created/Modified
- `engine/src/auction-room.ts` - Three-tier broadcast, highestBidderNullifier tracking, agentNullifierMap, participant-aware snapshot, WS token validation
- `engine/src/index.ts` - Privacy masking on GET /events for participant token holders
- `engine/schema.sql` - Added zk_nullifier TEXT column to events table
- `engine/migrations/0004_add_zk_nullifier_to_events.sql` - D1 migration for zk_nullifier column
- `engine/test/websocket.test.ts` - 7 new privacy masking tests + updated existing tests for zkNullifier
- `engine/test/api.test.ts` - 3 new /events privacy tests
- `engine/test/auction-mechanics.test.ts` - Updated CLOSE test for participant-tier privacy format
- `engine/test/sequencer.test.ts` - Updated D1 INSERT binding assertion for zk_nullifier

## Decisions Made
- System events (agentId='0') pass through to participant sockets unmodified -- CLOSE, CANCEL, DEADLINE_EXTENDED are not privacy-sensitive and must be delivered to all tiers
- agentNullifierMap persisted to DO storage (not just in-memory) for robustness across Durable Object hibernation wakes
- D1 events table gets zk_nullifier column via migration rather than joining with DO storage -- simpler query path for /events endpoint

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] System events dropped from participant broadcast**
- **Found during:** Task 1 (three-tier broadcast implementation)
- **Issue:** Initial implementation dropped ALL events without zkNullifier from participant sockets, including system events (CLOSE, CANCEL, DEADLINE_EXTENDED) which have agentId='0' and legitimately lack zkNullifier
- **Fix:** Added system event passthrough check (`event.agentId === '0'`) before the zkNullifier requirement
- **Files modified:** engine/src/auction-room.ts
- **Verification:** auction-mechanics.test.ts CANCEL and CLOSE tests pass with participant sockets
- **Committed in:** 557f8d2 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential correctness fix. Without it, participant sockets would miss auction lifecycle events.

## Issues Encountered
None beyond the deviation documented above.

## User Setup Required
None - no external service configuration required. Migration 0004 will be applied automatically on next `wrangler d1 migrations apply`.

## Next Phase Readiness
- Participant privacy masking complete for WebSocket, snapshot, and /events
- Ready for Phase 08 Plan 02 (additional privacy hardening or integration testing)
- All 203 engine tests passing (1 pre-existing bond-watcher failure unrelated to this phase)

---
*Phase: 08-participant-privacy*
*Completed: 2026-03-05*
