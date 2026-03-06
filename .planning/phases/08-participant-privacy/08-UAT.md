---
status: complete
phase: 08-participant-privacy
source: 08-01-SUMMARY.md, 08-02-SUMMARY.md
started: 2026-03-06T12:00:00Z
updated: 2026-03-06T12:30:00Z
---

## Tests

### 1. Participant WS receives zkNullifier instead of agentId
expected: Connect to auction WS with valid participantToken. When another agent JOINs or BIDs, the event payload contains `zkNullifier` field but NO `agentId` or `wallet` field.
result: pass
evidence: `websocket.test.ts > participant privacy masking > participant socket receives event with zkNullifier, without agentId or wallet`

### 2. Public WS still receives masked agentId (no regression)
expected: Connect to auction WS without participantToken. JOIN/BID events show `agentId: "Agent xxxxNN"` masked format and no wallet. Same as v1.0 behavior.
result: pass
evidence: `websocket.test.ts > participant privacy masking > public socket receives event with masked agentId (Agent xxxxNN), no wallet`

### 3. Invalid participantToken falls back to public tier
expected: Connect to WS with a bogus participantToken. Events received are public-tier (masked agentId), not participant-tier (zkNullifier).
result: pass
evidence: `websocket.test.ts > participant privacy masking > socket tagged as public (invalid token) receives masked event, not participant event`

### 4. Snapshot shows highestBidder as zkNullifier for participants
expected: Connect as participant. The initial snapshot message has `highestBidder` as a zkNullifier string (not a raw agentId number).
result: pass
evidence: `websocket.test.ts > participant privacy masking > snapshot with participantToken returns highestBidder as zkNullifier of current leader`

### 5. /events endpoint masks identity for participant token holders
expected: GET /auctions/:id/events?participantToken=xyz returns events with zkNullifier field instead of raw agentId, and no wallet field.
result: pass
evidence: `api.test.ts > GET /events with participantToken returns privacy-masked events (zkNullifier replaces agent_id, wallet omitted)`

### 6. System events (CLOSE/CANCEL/DEADLINE_EXTENDED) pass through to participants
expected: When auction closes, participant WS receives CLOSE event with final price and winner's zkNullifier. System events with agentId='0' are not dropped.
result: pass
evidence: `websocket.test.ts > CLOSE event on participant tier shows winner by zkNullifier only` + `api.test.ts > GET /events: system events (agent_id=0) pass through unmodified in participant response`

### 7. monitor_auction tool returns events with isOwn annotation
expected: Call monitor_auction MCP tool. Events matching the agent's own nullifier have `isOwn: true`. Other agents' events have `isOwn: false`. No agentId or wallet in any event.
result: pass
evidence: `monitor.test.ts > annotates events matching agent nullifier with isOwn: true` + `monitor.test.ts > annotates non-matching events with isOwn: false` + `monitor.test.ts > omits isOwn when AGENT_STATE_FILE is not configured`

### 8. get_auction_events returns zkNullifier, omits wallet
expected: Call get_auction_events MCP tool. Output events use `zkNullifier` as identity field. `wallet` field is absent from output.
result: pass
evidence: `events.test.ts > maps agent_id field as zkNullifier (not agentId) in output` + `events.test.ts > does not include wallet field in mapped event output`

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Test Suite Health

- Engine: 203/204 pass (1 pre-existing bond-watcher failure, unrelated to Phase 8)
- MCP server: 49/49 pass
- TypeScript: clean (both engine and mcp-server)

## Gaps

[none]
