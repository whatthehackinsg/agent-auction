---
phase: 04-frontend-demo
plan: 01
subsystem: engine, frontend
tags: [zk-proofs, websocket, data-plumbing, auction-room]
dependency_graph:
  requires: []
  provides: [zk-fields-in-websocket, auction-event-zk-interface]
  affects: [frontend ZK badges (04-02), nullifier indicators (04-03)]
tech_stack:
  added: []
  patterns: [conditional-spread, optional-type-extension, two-tier-websocket]
key_files:
  created: []
  modified:
    - engine/src/auction-room.ts
    - frontend/src/hooks/useAuctionRoom.ts
decisions:
  - zkNullifier and bidCommitment included in masked (public) WebSocket messages — they are cryptographic hashes, not identity-revealing
  - Conditional spread pattern used at ingestAction call site to preserve backward compatibility with non-ZK events
metrics:
  duration: ~5 min
  completed_date: "2026-03-03T15:36:49Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 4 Plan 1: ZK Field Data Plumbing Summary

ZK proof fields (zkNullifier, bidCommitment) threaded from engine Durable Object through WebSocket broadcast to frontend AuctionEvent interface, unblocking ZK badges and nullifier indicators in the activity feed.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Thread zkNullifier and bidCommitment through engine broadcastEvent | 9fd6af9 | engine/src/auction-room.ts |
| 2 | Extend frontend AuctionEvent interface with ZK fields | adc49b9 | frontend/src/hooks/useAuctionRoom.ts |

## What Was Built

Three surgical edits to `engine/src/auction-room.ts`:

1. Added `zkNullifier?: string` and `bidCommitment?: string` to the `broadcastEvent` parameter type (after `reason?: string` at line ~1137)
2. Added conditional guards in `maskedEvent` construction to forward both fields when present — these are cryptographic hashes safe for public broadcast
3. Updated the `ingestAction` call site (line ~658) to pass ZK fields via conditional spread: `...(zkNullifier ? { zkNullifier } : {})`

One additive edit to `frontend/src/hooks/useAuctionRoom.ts`:

- Extended `AuctionEvent` interface with `zkNullifier?: string` and `bidCommitment?: string`
- No `onmessage` handler changes needed — the existing spread operator `{ ...message }` passes through additional JSON fields automatically once the interface declares them

## Verification

- `cd engine && npm run typecheck` — passes, zero errors
- `cd frontend && npx tsc --noEmit` — passes, zero errors
- No other `broadcastEvent` call sites modified (CLOSE/EXTEND/etc. at lines 697, 799, 956, 993 are untouched)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- engine/src/auction-room.ts modified: FOUND
- frontend/src/hooks/useAuctionRoom.ts modified: FOUND
- Commit 9fd6af9: FOUND
- Commit adc49b9: FOUND
