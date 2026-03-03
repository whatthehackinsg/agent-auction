# Phase 4: Frontend + Demo — Research

**Researched:** 2026-03-03
**Domain:** Next.js 16 / React 19 frontend — ZK proof display, activity feed badges, privacy explainer
**Confidence:** HIGH (all findings verified against live codebase)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **ZK verification badges (FRNT-01):** Badge wording on JOIN events is Claude's discretion. BID events show a verification badge AND a truncated `bidCommitment` hash (e.g. `0xab12...f9c3`). Events without ZK proofs (no zkNullifier/bidCommitment): Claude's discretion on whether to show "UNVERIFIED" dimmed label or nothing extra.
- **Nullifier indicators (FRNT-02):** JOIN events with zkNullifier show a **separate visual element** alongside the ZK badge — two distinct pieces of crypto evidence visible (badge + nullifier tag with truncated hash). NOT integrated into the badge.
- **Privacy explainer panel (FRNT-03):** Location is **both** — auction room gets a general "how ZK privacy works" panel; agent profile page gets per-agent ZK membership status (replacing existing placeholder). Tone: Technical with labels — real terms (Groth16, Poseidon, nullifier) with one-line plain-language explanations.
- **Visual identity:** Badge color is **gold/amber** — matches existing `zk.membership` panel accent. Reuse existing `Badge` component, no new visual primitives. Hash format: `0xab12...f9c3`. Prominence: eye-catching for judges.
- **Landing page:** Leave as-is. Focus effort on auction room.
- **Event data plumbing:** Frontend `AuctionEvent` interface in `useAuctionRoom` lacks `zkNullifier` and `bidCommitment` fields — must be added.

### Claude's Discretion

- Badge wording for JOIN events
- Whether non-ZK events show "UNVERIFIED" or nothing
- Auction room explainer panel visibility (always-visible vs collapsible)
- Agent profile ZK status card layout within existing placeholder structure
- Event type plumbing approach (extend AuctionEvent vs separate ZkEventData type)

### Deferred Ideas (OUT OF SCOPE)

- **DEMO-01**: Full E2E Base Sepolia demo — deferred, recorded when all work is complete
- **DEMO-02**: CCIP Private Transactions future vision narrative — deferred with DEMO-01
- Replay viewer ZK badges — follow-up enhancement
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FRNT-01 | Frontend shows ZK proof verification badge on bids and joins (not just string masking) | Extend `AuctionEvent` interface, add `zkNullifier`/`bidCommitment` fields; inject `Badge` into activity feed `<li>` render; requires engine `broadcastEvent` to thread ZK fields through |
| FRNT-02 | Frontend shows nullifier consumed indicator for verified participants | Separate `<span>` tag next to badge with truncated `zkNullifier` hash using existing `truncateHex()` utility |
| FRNT-03 | Frontend includes privacy explainer panel explaining ZK guarantees to spectators | Add `PixelPanel accent="gold"` explainer to auction room page; replace placeholder in `agents/[agentId]/page.tsx` `zk.membership` panel with real-data display |
| DEMO-01 | Full E2E Base Sepolia demo | **DEFERRED** — not in scope for this phase |
| DEMO-02 | CCIP Private Transactions future vision narrative | **DEFERRED** — not in scope for this phase |
</phase_requirements>

---

## Summary

Phase 4 is a pure frontend display phase. All ZK proof generation, engine verification, and on-chain settlement infrastructure is complete from Phases 1-3. The task is to make the already-verified ZK data *visible* in the spectator UI so hackathon judges can confirm the privacy layer is working.

The work involves three tight integration points: (1) extending the frontend `AuctionEvent` interface and engine `broadcastEvent` to carry `zkNullifier`/`bidCommitment` fields over WebSocket, (2) injecting gold/amber badge + nullifier tag elements into the existing activity feed `<li>` render block in the auction room page, and (3) adding a gold `PixelPanel` ZK explainer to the auction room and replacing the placeholder in the agent profile `zk.membership` panel.

A critical finding: **the engine's `broadcastEvent` method does not currently pass `zkNullifier` or `bidCommitment` to WebSocket clients** — these fields are stored in DO storage and D1 but are silently dropped at broadcast time. This engine change is a prerequisite for FRNT-01 and FRNT-02 and must be treated as a task in the plan. The fix is small: add the two optional fields to `broadcastEvent`'s parameter type and forward them through the masked event construction.

**Primary recommendation:** Fix engine broadcast gap first, then extend the frontend `AuctionEvent` interface, then inject badges into the `<li>` render, then wire the explainer panels. Four discrete tasks, all low-risk incremental edits to existing files.

---

## Standard Stack

### Core (already installed — no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.1.6 | App router, pages | Project standard |
| React | 19.2.3 | UI rendering | Project standard |
| SWR | ^2.4.0 | Data fetching hooks (`useAgentProfile`) | Project standard |
| Tailwind CSS | ^4 | Utility classes, custom CSS vars | Project standard |

### Existing UI Primitives (already built — reuse these)

| Component | File | Relevant Props |
|-----------|------|---------------|
| `Badge` | `frontend/src/components/ui/Badge.tsx` | `variant: "live" \| "warn" \| "active" \| "default"` |
| `PixelPanel` | `frontend/src/components/landing/PixelPanel.tsx` | `accent: "mint" \| "gold" \| "violet" \| "rose"`, `headerLabel` |
| `truncateHex` | `frontend/src/lib/format.ts` | `truncateHex(value, head=6, tail=4)` |

### Color System (no new colors needed)

Gold/amber ZK color is `--color-accent: #f5c46e` and the glow utility `.text-glow-accent { text-shadow: 0 0 10px rgba(245,196,110,0.4) }` already exists in `globals.css`. The `accentStyles.gold` object in `accent.ts` provides:
- `border: "border-[#d7aa61]"`
- `label: "text-[#deb678]"`
- `value: "text-[#F5C46E]"`
- `dim: "text-[#7f6d4f]"`

For inline gold text on badges, use `className="text-[#F5C46E] text-glow-accent"` — consistent with how gold is used throughout.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reusing existing `Badge` | New ZkBadge component | Adding a new component adds no value — `Badge` with className override handles gold color |
| Extending existing `AuctionEvent` in hook | Separate `ZkEventData` type | Extending is simpler and keeps the event as one coherent object; CONTEXT.md marks this as Claude's discretion |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended File Touch List

```
engine/src/auction-room.ts               # Fix broadcastEvent — add zkNullifier/bidCommitment params
frontend/src/hooks/useAuctionRoom.ts     # Extend AuctionEvent interface with optional ZK fields
frontend/src/app/auctions/[id]/page.tsx  # Inject badges into <li> render; add ZK explainer PixelPanel
frontend/src/app/agents/[agentId]/page.tsx  # Replace zk.membership placeholder with real display
```

No new files are needed. All changes are additive edits to existing files.

### Pattern 1: Engine — Thread ZK Fields Through broadcastEvent

**What:** `broadcastEvent` in `engine/src/auction-room.ts` (line 1124) currently has no parameters for `zkNullifier` or `bidCommitment`. The call site at line 658 also omits them despite having them in scope via the stored event. Both the parameter type and the masked event construction need updating.

**The gap (exact lines):**
```typescript
// Line 1124 — broadcastEvent parameter type MISSING these fields:
private broadcastEvent(event: {
  // ...existing fields...
  // zkNullifier?: string  ← MISSING
  // bidCommitment?: string ← MISSING
}): void {

// Line 1148 — maskedEvent construction does NOT include ZK fields
// zkNullifier and bidCommitment are safe to include in public messages
// (they are cryptographic commitments — non-sensitive, like eventHash)

// Line 658 — call site does NOT pass ZK fields:
this.broadcastEvent({
  seq,
  eventHash: eventHashHex,
  actionType: action.type,
  agentId: action.agentId,
  amount: action.amount,
  timestamp: receivedAt,
  wallet: action.wallet,
  // zkNullifier,    ← MISSING (in scope from ingestAction params)
  // bidCommitment,  ← MISSING (in scope from ingestAction params)
})
```

**Fix pattern:**
```typescript
// 1. Add to broadcastEvent parameter type:
private broadcastEvent(event: {
  // ...existing fields...
  zkNullifier?: string
  bidCommitment?: string
}): void {
  // ...
  // 2. In masked event construction, add:
  if (event.zkNullifier) maskedEvent.zkNullifier = event.zkNullifier
  if (event.bidCommitment) maskedEvent.bidCommitment = event.bidCommitment

// 3. At call site (line ~658), pass from ingestAction params:
this.broadcastEvent({
  // ...existing fields...
  ...(zkNullifier ? { zkNullifier } : {}),
  ...(bidCommitment ? { bidCommitment } : {}),
})
```

**Why `zkNullifier`/`bidCommitment` are safe in public broadcast:** They are cryptographic hash outputs, not identity-revealing data. The agentId is already masked; the nullifier and bid commitment add cryptographic evidence without deanonymizing the agent.

### Pattern 2: Frontend — Extend AuctionEvent Interface

**What:** The frontend's `AuctionEvent` interface in `useAuctionRoom.ts` (line 6) mirrors the engine type but is missing the two ZK fields.

```typescript
// Current interface (frontend/src/hooks/useAuctionRoom.ts line 6):
export interface AuctionEvent {
  type: string
  seq: number
  eventHash: string
  actionType: string
  agentId: string
  amount: string
  timestamp: number
  wallet?: string
}

// Extended interface — add these two optional fields:
export interface AuctionEvent {
  type: string
  seq: number
  eventHash: string
  actionType: string
  agentId: string
  amount: string
  timestamp: number
  wallet?: string
  zkNullifier?: string    // ← ADD
  bidCommitment?: string  // ← ADD
}
```

The `maskedMessage` spread in `onmessage` at line 58 already uses `{ ...message, agentId: maskAgentId(...), wallet: undefined }` — the ZK fields pass through automatically because they're non-sensitive and spread from `message`.

### Pattern 3: Activity Feed — Inject Badges into <li>

**What:** The activity feed render block in `frontend/src/app/auctions/[id]/page.tsx` (lines 138-175) currently renders each event as a `<li>` with action type label, timestamp, and a description line. ZK badges are injected as additional inline elements.

**Current render structure (simplified):**
```tsx
<li key={`evt-${e.seq}`} className="border border-[#2f415f] bg-[#101b27]/80 p-2 font-mono text-xs">
  <div className="flex items-center justify-between">
    <span className="text-[#6EE7B7]">
      {e.actionType === 'BID' ? 'New Bid' : e.actionType === 'JOIN' ? 'Agent Joined' : e.actionType}
    </span>
    <span className="text-[#5E5E7A]">{formatTimeSince(e.timestamp)}</span>
  </div>
  <p className="mt-1 text-[#EEEEF5]">
    {e.actionType === 'BID' ? <>{formatUsdc(e.amount)} by {maskAgentId(e.agentId)}</> : ...}
  </p>
</li>
```

**Injection pattern — add ZK evidence row below the description:**
```tsx
<li key={`evt-${e.seq}`} className="border border-[#2f415f] bg-[#101b27]/80 p-2 font-mono text-xs">
  <div className="flex items-center justify-between">
    <span className="text-[#6EE7B7]">
      {e.actionType === 'BID' ? 'New Bid' : e.actionType === 'JOIN' ? 'Agent Joined' : e.actionType}
    </span>
    <span className="text-[#5E5E7A]">{formatTimeSince(e.timestamp)}</span>
  </div>
  <p className="mt-1 text-[#EEEEF5]">
    {/* existing description line */}
  </p>
  {/* ZK evidence row — only renders when proof data is present */}
  {(e.zkNullifier || e.bidCommitment) && (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {/* ZK verified badge — always show when any ZK field present */}
      <Badge variant="warn" className="text-[#F5C46E] text-glow-accent">
        {e.actionType === 'JOIN' ? 'ZK PROVEN' : 'ZK VERIFIED'}
      </Badge>
      {/* Nullifier tag — JOIN events only (FRNT-02: separate element) */}
      {e.zkNullifier && (
        <span className="font-mono text-[10px] text-[#7f6d4f]">
          nullifier: {truncateHex(e.zkNullifier)}
        </span>
      )}
      {/* Bid commitment hash — BID events only (FRNT-01: truncated hash) */}
      {e.bidCommitment && e.bidCommitment !== '0' && (
        <span className="font-mono text-[10px] text-[#7f6d4f]">
          commit: {truncateHex(e.bidCommitment)}
        </span>
      )}
    </div>
  )}
</li>
```

**Note on `Badge variant`:** The existing `Badge` variants are `"live" | "warn" | "active" | "default"`. `"warn"` uses `text-accent text-glow-accent` — which maps to the gold/amber color (`--color-accent: #f5c46e`). This is exactly the gold visual identity required. No new variant needed; override with `className` if needed for fine-tuning.

**Note on `bidCommitment !== '0'`:** The engine only populates `bidCommitment` when the value is non-zero (per STATE.md decision: "Only populate bidCommitment when bidRangeResult.bidCommitment !== '0'"). Frontend should also guard against this.

### Pattern 4: Agent Profile — Replace zk.membership Placeholder

**What:** In `frontend/src/app/agents/[agentId]/page.tsx` (lines 224-260), the `zk.membership` `PixelPanel` with `accent="gold"` currently shows a static `<Badge variant="default">UNVERIFIED</Badge>` placeholder.

**Current placeholder:**
```tsx
<PixelPanel accent="gold" headerLabel="zk.membership">
  <div className="space-y-2">
    <div className="flex items-center gap-2">
      <Badge variant="default">UNVERIFIED</Badge>
    </div>
    <p className="font-mono text-xs text-[#5E5E7A]">
      {'// ZK membership proof status — awaiting AgentPrivacyRegistry integration'}
    </p>
    <p className="font-mono text-[10px] text-[#7f6d4f]">
      {'// will show: Merkle root, nullifier status, proof verification timestamp'}
    </p>
  </div>
</PixelPanel>
```

**Replacement pattern — derive ZK status from existing participation events:**
```tsx
{/* Derive ZK status from participation events — events with zkNullifier = ZK-verified */}
{(() => {
  const zkEvents = participations.flatMap(p =>
    p.events.filter(ev => ev.zk_nullifier) // EventRow uses snake_case from D1
  )
  const isZkVerified = zkEvents.length > 0
  const latestNullifier = zkEvents[zkEvents.length - 1]?.zk_nullifier
  return (
    <PixelPanel accent="gold" headerLabel="zk.membership">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant={isZkVerified ? 'warn' : 'default'}>
            {isZkVerified ? 'VERIFIED' : 'UNVERIFIED'}
          </Badge>
          {isZkVerified && (
            <span className="font-mono text-[10px] text-[#F5C46E]">Groth16</span>
          )}
        </div>
        {isZkVerified && latestNullifier ? (
          <p className="font-mono text-[10px] text-[#7f6d4f]">
            nullifier: {truncateHex(latestNullifier)}
          </p>
        ) : null}
        <p className="font-mono text-xs text-[#5E5E7A]">
          {isZkVerified
            ? `// RegistryMembership proof verified — ${zkEvents.length} ZK join(s) on-record`
            : '// no ZK membership proof on record for this agent'}
        </p>
        <p className="font-mono text-[10px] text-[#7f6d4f]">
          {'// Groth16 (BN254) · Poseidon hash chain · nullifier prevents double-join'}
        </p>
      </div>
    </PixelPanel>
  )
})()}
```

**Key data source note:** `useAgentProfile` returns `participations[].events` as `EventRow[]` where fields are **snake_case** from D1 (`zk_nullifier`, `bid_commitment`). The D1 schema does NOT store `zk_nullifier` — checking the D1 INSERT statement at auction-room.ts line ~630 confirms the INSERT only writes `(auction_id, seq, prev_hash, event_hash, payload_hash, action_type, agent_id, wallet, amount)`. ZK fields are stored in **DO storage** only, not D1. Therefore, the agent profile page cannot derive ZK status from `EventRow` data.

**This is a second critical finding: D1 events table does not store zk_nullifier/bidCommitment.** The agent profile ZK status panel must derive its data from a different source — either (a) a new engine endpoint that reads DO storage events, or (b) inferring from whether the agent has any JOIN events at all (as a soft signal), or (c) leaving the panel as static "technical glossary" content and calling it a discretion call. The simplest correct approach: make the `zk.membership` panel a static technical explainer showing circuit specifications (Groth16, BN254, Poseidon), not live per-agent data, since per-agent ZK status requires a new API endpoint that doesn't exist.

### Pattern 5: Auction Room ZK Explainer Panel (FRNT-03)

**What:** A new `PixelPanel accent="gold"` in the auction room page that explains ZK guarantees. This is pure static content — no data fetching needed.

```tsx
<PixelPanel accent="gold" headerLabel="zk.privacy">
  <div className="space-y-3 font-mono text-xs">
    <p className="text-[#deb678] font-bold">// how ZK privacy works in this auction</p>
    <div className="space-y-2 text-[#b4a58a]">
      <p><span className="text-[#F5C46E]">Groth16</span> — zk-SNARK proof system (BN254 curve). Agents prove statements without revealing inputs.</p>
      <p><span className="text-[#F5C46E]">RegistryMembership</span> — proves agent is in the privacy registry without revealing which agent.</p>
      <p><span className="text-[#F5C46E]">BidRange</span> — proves bid is within [reserve, budget] without revealing the exact amount.</p>
      <p><span className="text-[#F5C46E]">Poseidon</span> — ZK-friendly hash function. Used for Merkle trees and nullifiers.</p>
      <p><span className="text-[#F5C46E]">nullifier</span> — single-use token that prevents an agent from joining twice.</p>
    </div>
  </div>
</PixelPanel>
```

**Placement:** In the right-hand column (`<div className="space-y-4">`) below the existing `current.highest` and `on-chain.state` panels.

### Anti-Patterns to Avoid

- **Querying DO storage from the frontend:** DO storage is internal; only accessible through the engine's HTTP/WebSocket API. The agent profile ZK status cannot be read directly from DO. Must use existing REST endpoints or a new one.
- **Adding `variant="zk"` to Badge:** Do not modify the Badge component's variant union. Use `variant="warn"` (which is gold/amber) plus a `className` override if needed.
- **Blocking on D1 schema migration:** D1 columns for `zk_nullifier`/`bid_commitment` would require a schema migration that is outside this phase's scope. Avoid this path.
- **Fetching AgentPrivacyRegistry on-chain from the frontend:** The existing engine already reads `getRoot()` during JOIN verification. The frontend should not make direct RPC calls to Base Sepolia.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hash truncation display | Custom slice logic | `truncateHex()` in `frontend/src/lib/format.ts` | Already handles edge cases, consistent `0xab12...f9c3` format |
| Gold badge styling | New CSS or component | `Badge variant="warn"` (maps to `text-accent text-glow-accent` = gold) | Existing system |
| Panel with gold accent | Custom div styling | `PixelPanel accent="gold"` | Maintains visual consistency |
| ZK-verified indicator | New icon/component | `Badge` text content ("ZK PROVEN", "VERIFIED") | No icon library in project |

**Key insight:** Every visual primitive needed already exists. This phase is 100% composition of existing components.

---

## Common Pitfalls

### Pitfall 1: ZK Fields Never Arrive at the Browser

**What goes wrong:** Developer adds ZK fields to the frontend `AuctionEvent` interface, checks `e.zkNullifier` in the render, and sees nothing — badges never appear.

**Why it happens:** The engine's `broadcastEvent` method (line 1124) does not include `zkNullifier`/`bidCommitment` in its parameter type, and the call site at line 658 does not pass them. The fields are stored in DO storage but silently dropped before WebSocket broadcast.

**How to avoid:** Fix the engine first, before touching the frontend. Verify the fix by checking WebSocket messages in browser DevTools to confirm `zkNullifier` appears in JOIN event payloads.

**Warning signs:** If badges never appear on any events even when running the agent-client demo with proofs enabled.

### Pitfall 2: D1 Table Missing ZK Columns

**What goes wrong:** Trying to derive agent profile ZK status from `EventRow` data (which comes from D1), expecting `ev.zk_nullifier` to be populated.

**Why it happens:** The D1 INSERT statement only persists core fields. ZK fields are stored in DO storage (key-value, not D1 SQL). `useAgentProfile` fetches from the REST API which queries D1.

**How to avoid:** Make the agent profile `zk.membership` panel static technical content, or add a new engine endpoint that reads DO storage events for a given agent (outside this phase scope). The simplest solution: replace the placeholder comment text with real circuit specs (Groth16, BN254, Poseidon, etc.) and leave agent-specific ZK status as "requires participation in a live auction with ZK proofs enabled."

**Warning signs:** `ev.zk_nullifier` is always `undefined` on `EventRow` objects.

### Pitfall 3: bidCommitment '0' Sentinel Leaking Into UI

**What goes wrong:** A bid commitment hash of `"0"` appears in the activity feed as a ZK badge even though it's the fallback value for non-ZK bids.

**Why it happens:** The engine conditionally sets `bidCommitment` only when the value is non-zero (STATE.md decision). But if the guard is missing on the frontend, any numeric `"0"` or empty commitment shows as "ZK VERIFIED."

**How to avoid:** Guard with `e.bidCommitment && e.bidCommitment !== '0'` before rendering the bid commitment tag.

### Pitfall 4: Badge variant="warn" Color Mismatch

**What goes wrong:** Developer expects gold color from `Badge` but uses `variant="active"` (primary/green) or `variant="default"` (muted gray).

**Why it happens:** The color mapping is non-obvious:
- `"warn"` → `text-accent text-glow-accent` → gold (#f5c46e) — CORRECT for ZK badges
- `"active"` → `text-primary text-glow-primary` → mint green (#6ee7b7)
- `"default"` → `text-text-muted` → gray (#9b9bb8)

**How to avoid:** Use `variant="warn"` for all ZK verification badges.

### Pitfall 5: TypeScript Errors from Engine broadcastEvent Change

**What goes wrong:** Adding `zkNullifier?` to `broadcastEvent`'s parameter type triggers TypeScript errors at all other call sites if they don't spread correctly.

**Why it happens:** The method is called in 6+ places. All existing call sites use object literals, so adding optional fields won't break them — but verify with `npm run typecheck` in the engine directory.

**How to avoid:** Run `npm run typecheck` in `engine/` after the broadcastEvent change before moving to frontend work.

---

## Code Examples

### Existing truncateHex usage pattern

```typescript
// Source: frontend/src/lib/format.ts line 1
export function truncateHex(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 3) return value
  return `${value.slice(0, head)}...${value.slice(-tail)}`
}

// Usage (produces "0xab12...f9c3" for a full hash):
truncateHex('0xab12345678901234567890f9c3')
// → "0xab12...f9c3"
```

### Badge component — gold (warn) variant

```tsx
// Source: frontend/src/components/ui/Badge.tsx
// variant="warn" maps to text-accent text-glow-accent = gold/amber
<Badge variant="warn">ZK PROVEN</Badge>
// Renders: [ZK PROVEN] with gold text + amber glow

// For inline override if needed:
<Badge variant="warn" className="text-[#F5C46E]">ZK VERIFIED</Badge>
```

### PixelPanel gold accent

```tsx
// Source: frontend/src/components/landing/PixelPanel.tsx + accent.ts
// accent="gold" applies:
//   border: border-[#d7aa61]
//   panel bg: bg-[#241b10]/90
//   label text: text-[#deb678]
<PixelPanel accent="gold" headerLabel="zk.privacy">
  {/* content */}
</PixelPanel>
```

### Engine broadcastEvent fix (minimal diff)

```typescript
// Source: engine/src/auction-room.ts line 1124
// Add to parameter type:
private broadcastEvent(event: {
  seq?: number
  eventHash?: string
  actionType: string
  agentId: string
  amount: string
  wallet?: string
  timestamp: number
  deadline?: number
  oldDeadline?: number
  extensionCount?: number
  maxExtensions?: number
  extensionsRemaining?: number
  reason?: string
  zkNullifier?: string    // ADD THIS
  bidCommitment?: string  // ADD THIS
}): void {
  // ...existing fullMessage construction stays the same (spread includes ZK fields)...

  // In masked event construction, add after existing guards:
  if (event.zkNullifier) maskedEvent.zkNullifier = event.zkNullifier
  if (event.bidCommitment) maskedEvent.bidCommitment = event.bidCommitment
```

```typescript
// Source: engine/src/auction-room.ts line ~658 (ingestAction broadcast call)
this.broadcastEvent({
  seq,
  eventHash: eventHashHex,
  actionType: action.type,
  agentId: action.agentId,
  amount: action.amount,
  timestamp: receivedAt,
  wallet: action.wallet,
  ...(zkNullifier ? { zkNullifier } : {}),    // ADD THIS
  ...(bidCommitment ? { bidCommitment } : {}), // ADD THIS
})
```

---

## State of the Art

| Old Approach | Current Approach | Impact for This Phase |
|--------------|------------------|-----------------------|
| Polling REST API for events | WebSocket push (`/auctions/:id/stream`) | ZK fields must travel in WebSocket messages, not just REST responses |
| Static badge text | Live ZK field presence check | Badges only appear when actual proof data is present |
| Placeholder comment in `zk.membership` panel | Replace with circuit specs + conditional verified/unverified state | Works without new API endpoint |

**Deprecated/outdated:**
- The `// will show: Merkle root, nullifier status, proof verification timestamp` placeholder comment: replaced with actual content in FRNT-03.

---

## Open Questions

1. **Should the agent profile ZK panel show per-agent live status, or static circuit specs?**
   - What we know: D1 doesn't store ZK fields; DO does. `useAgentProfile` reads D1. A new engine endpoint would be needed for per-agent ZK status.
   - What's unclear: Whether the planner wants to add that endpoint in scope, or simplify to static content.
   - Recommendation: Static circuit spec content for the panel body + conditional VERIFIED/UNVERIFIED badge derived from whether the agent has any JOIN events at all (rough proxy, since engine only allows joins with valid ZK proof when `ENGINE_REQUIRE_PROOFS=true`). This avoids a new endpoint.

2. **Should the auction room ZK explainer panel be collapsible or always-visible?**
   - What we know: CONTEXT.md marks this as Claude's discretion.
   - Recommendation: Always-visible collapsed summary (2-3 lines) in a gold PixelPanel — matches how `current.highest` and `on-chain.state` panels work. Judges see it immediately without interaction.

3. **Will there be live ZK events to demonstrate FRNT-01/FRNT-02 visually?**
   - What we know: DEMO-01 is deferred. Badges only appear when real ZK-proof events are broadcast.
   - What's unclear: Whether the plan should include a "seed test events" task for local testing.
   - Recommendation: Include a local-dev note in the plan that the agent-client demo (`cd agent-client && npm run start`) generates real ZK JOIN/BID events that trigger badges.

---

## Sources

### Primary (HIGH confidence — verified against live codebase)

- `engine/src/auction-room.ts` lines 1124-1180 — `broadcastEvent` method signature and masked event construction (missing ZK fields confirmed)
- `engine/src/auction-room.ts` lines 556-660 — `ingestAction` method; confirmed `zkNullifier`/`bidCommitment` available at call site but not forwarded
- `frontend/src/hooks/useAuctionRoom.ts` — `AuctionEvent` interface missing ZK fields; `onmessage` spread pattern
- `frontend/src/app/auctions/[id]/page.tsx` lines 138-175 — activity feed `<li>` render block; exact injection point
- `frontend/src/app/agents/[agentId]/page.tsx` lines 224-260 — `zk.membership` placeholder
- `frontend/src/components/ui/Badge.tsx` — variant map; `"warn"` = gold/amber
- `frontend/src/components/landing/accent.ts` — gold accent color values
- `frontend/src/lib/format.ts` — `truncateHex()` signature and behavior
- `frontend/src/app/globals.css` — `.text-glow-accent` CSS definition
- `engine/src/auction-room.ts` lines 615-635 — D1 INSERT confirms `zk_nullifier`/`bid_commitment` NOT stored in SQL

### Secondary (MEDIUM confidence)

- `engine/src/types/engine.ts` lines 34-35 — engine `AuctionEvent` interface authoritative definition of `zkNullifier?`/`bidCommitment?`
- `engine/src/lib/crypto.ts` lines 308-430 — bid commitment signal index and non-zero guard logic

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against package.json and all source files
- Architecture patterns: HIGH — based on direct codebase inspection, not inference
- Pitfalls: HIGH — Pitfall 1 and 2 are confirmed code-level gaps found in research, not speculative
- Agent profile ZK status: MEDIUM — resolution requires a planner decision on static-vs-dynamic approach

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable codebase; no fast-moving dependencies)
