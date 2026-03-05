# Phase 8: Participant Privacy - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

**IMPORTANT: Roadmap swap decided** — ZK Enforcement (old Phase 9) should execute BEFORE this phase. All decisions below assume ZK proofs are mandatory and every participant has a zkNullifier.

<domain>
## Phase Boundary

Strip identity (agentId, wallet) from participant WebSocket events, replacing with zkNullifier. Agents self-recognize by matching their locally-known nullifier. Public WebSocket tier unchanged (no regression from v1.0). Uniform masking across all auction types (english + sealed-bid).

Requirements: PRIV-01, PRIV-02, PRIV-03

</domain>

<decisions>
## Implementation Decisions

### Masking Strategy
- One-for-all: uniform masking regardless of auction type (english or sealed-bid)
- Participant-tier events show `zkNullifier` instead of `agentId` and `wallet`
- Events without zkNullifier (shouldn't happen after ZK enforcement): drop from participant broadcast + warn log server-side
- Public tier: no changes (PRIV-03 — existing masked agentId behavior preserved)
- Storage (DO + D1): full data kept — masking is broadcast-only (CRE settlement needs real identity)

### Terminal Events
- CLOSE event: winner identified by zkNullifier only (no real agentId/wallet leak)
- Final price: visible to participants (public information, goes on-chain)
- System events (CANCEL, DEADLINE_EXTENDED, REVEAL_WINDOW_OPEN): pass through unmodified (agentId='0' is not a real identity)

### Snapshot + REST Masking
- `getSnapshot()` on participant WS connect: `highestBidder` replaced with zkNullifier of current leader
- `/replay` endpoint: privacy-masked for participant requests (zkNullifier instead of agentId/wallet)
- Replay auth: `participantToken` query param — same token used for WS upgrade. No token = full data (internal/CRE use)

### Participant Token Validation
- Engine validates `participantToken` on WS connect — checks it maps to a real participant in DO storage
- Invalid/missing token: connection gets public-tier events (not participant)

### Self-Recognition
- Client-side nullifier matching: agent compares `event.zkNullifier` to its locally-known nullifier
- No per-socket personalization on engine — engine broadcasts same masked data to all participant sockets
- MCP `monitor_auction` auto-annotates `isOwn: true` by comparing event nullifier to agent's nullifier from AGENT_STATE_FILE
- Own events show `{isOwn: true, zkNullifier: "..."}` — no agentId/wallet even for own events

### Monitor Design
- `monitor_auction` uses REST polling (not internal WebSocket)
- Calls GET snapshot + GET /replay?since=lastSeq with participantToken for privacy-masked responses
- LLM agents interact via request-response tool calls, not persistent streams

### Frontend
- No frontend changes — spectator UI uses public tier only, no regression

### Aggregate Fields
- All aggregate fields (bidCount, uniqueBidders, competitionLevel, priceIncreasePct, snipeWindowActive, extensionsRemaining) kept across all tiers — no identity info in aggregates

### Claude's Discretion
- HTTP status codes for token validation failures
- Exact implementation of nullifier-to-highestBidder tracking in snapshot
- Rate limiting on WS connections per participantToken (optional hardening)

</decisions>

<specifics>
## Specific Ideas

- "We do not allow non-ZK agents to attend" — ZK enforcement phase runs first, so participant privacy can assume nullifiers always exist
- REST poll for monitor_auction — LLMs can only receive batches, not persistent streams

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `engine/src/auction-room.ts` `broadcastEvent()` (~line 1197): existing two-tier broadcast — needs third masking path for participant privacy
- `engine/src/auction-room.ts` `maskAgentId()` (~line 1271): existing public-tier masking helper
- `engine/src/auction-room.ts` `getSnapshot()`: returns room state on WS connect — needs participant-aware variant
- WS tag system: `this.state.getWebSockets('participant')` / `this.state.getWebSockets('public')` — already separates tiers

### Established Patterns
- Two-tier broadcast: full JSON for participants, masked JSON for public (same `broadcastEvent` function)
- participantToken: returned from JOIN response, passed as WS query param, used for socket tagging
- AuctionEvent type: `zkNullifier?: string` field already exists on events

### Integration Points
- `broadcastEvent()` in auction-room.ts: core change — participant message construction
- `getSnapshot()` in auction-room.ts: needs participant-aware highestBidder
- `/replay` endpoint in index.ts: needs participantToken-based masking
- WS connect handler (~line 533): needs token validation against DO storage
- `mcp-server/src/tools/monitor.ts`: needs nullifier matching + isOwn annotation
- `mcp-server/src/tools/monitor.ts`: switch from WS to REST poll design

</code_context>

<deferred>
## Deferred Ideas

- Rate limiting per participantToken on WS — optional hardening, not core privacy
- Frontend privacy indicators — cosmetic, belongs in a future phase

</deferred>

---

*Phase: 08-participant-privacy*
*Context gathered: 2026-03-06*
