# Phase 4: Frontend + Demo - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Surface ZK verification status in the spectator UI so hackathon judges can visually confirm the cryptographic privacy layer is working. Three frontend display requirements: ZK verification badges on activity feed events, nullifier consumed indicators, and a privacy explainer panel.

**Scope reduction:** DEMO-01 (live E2E Base Sepolia demo) and DEMO-02 (CCIP narrative) are **deferred** — real demo will be recorded when all work is complete. This phase focuses exclusively on frontend display: FRNT-01, FRNT-02, FRNT-03.

</domain>

<decisions>
## Implementation Decisions

### ZK verification badges (FRNT-01)
- Badge wording on JOIN events: Claude's discretion — pick what fits the pixel aesthetic and communicates clearly to non-crypto judges
- BID events: Show a verification badge AND a truncated bidCommitment hash (e.g. `0xab12...f9c3`) — judges see cryptographic output
- Events without ZK proofs (no zkNullifier/bidCommitment): Claude's discretion on whether to show "UNVERIFIED" dimmed label or nothing extra

### Nullifier indicators (FRNT-02)
- JOIN events with zkNullifier: Show as a **separate visual element** alongside the ZK badge — two distinct pieces of crypto evidence visible (badge + nullifier tag with truncated hash)
- This is NOT integrated into the badge; it's a distinct tag

### Privacy explainer panel (FRNT-03)
- **Location: Both** — auction room gets a general "how ZK privacy works" panel; agent profile page gets per-agent ZK membership status (replacing the existing placeholder)
- **Tone: Technical with labels** — use real terms (Groth16, Poseidon, nullifier) but with one-line plain-language explanations next to each term. Shows depth while remaining readable for hackathon judges.
- Visibility/collapsibility of auction room panel: Claude's discretion
- Agent profile ZK status card design: Claude's discretion (existing placeholder has `Badge variant="default">UNVERIFIED` — flip to verified when data exists)

### Visual identity
- **Badge color: Gold/amber** — matches the existing `zk.membership` panel accent ("gold"). Creates a consistent ZK visual language across the app.
- **Prominence: Eye-catching for judges** — bold badges, visible hashes, make the ZK layer impossible to miss
- **Hash format: `0xab12...f9c3`** — hex prefix + ellipsis, standard crypto convention
- **Style: Reuse existing Badge component** — keep it consistent with the current codebase, no new visual primitives

### Landing page
- Leave as-is — landing page ZK sections (ArchitectureSection, ModulesSection "ZK Privacy Layer") are already good enough. Focus effort on the auction room where judges see proofs in action.

### Event data plumbing
- Frontend `AuctionEvent` interface in `useAuctionRoom` currently lacks `zkNullifier` and `bidCommitment` fields that the engine sends via WebSocket
- Claude's discretion on approach (extend existing interface vs separate type)

### Claude's Discretion
- Badge wording for JOIN events
- Whether non-ZK events show "UNVERIFIED" or nothing
- Auction room explainer panel visibility (always-visible vs collapsible)
- Agent profile ZK status card layout within existing placeholder structure
- Event type plumbing approach (extend AuctionEvent vs separate ZkEventData type)

</decisions>

<specifics>
## Specific Ideas

- Judges land on the auction room page and should immediately see gold ZK badges on events — "eye-catching" was the explicit directive
- Nullifier tags are a separate element from badges, showing two distinct cryptographic evidences
- Explainer panel uses real crypto terms (Groth16, Poseidon, nullifier) but with plain-language annotations — "Technical with labels"
- Agent profile page already has a `zk.membership` PixelPanel with `accent="gold"` and an UNVERIFIED Badge — this placeholder gets wired to real data

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/components/ui/Badge.tsx`: Existing Badge component with `variant` prop — reuse for ZK badges
- `frontend/src/components/landing/PixelPanel.tsx`: Panel component with `accent` prop (supports "gold") — used for explainer panel
- `frontend/src/hooks/useAuctionRoom.ts`: WebSocket hook returning `events` array — needs `zkNullifier`/`bidCommitment` fields added to `AuctionEvent` interface
- `frontend/src/lib/format.ts`: Has `truncateHex()` utility — reuse for hash truncation
- `frontend/src/app/agents/[agentId]/page.tsx` lines 224-260: Existing `zk.membership` placeholder panel with UNVERIFIED Badge — wire to real data

### Established Patterns
- Pixel/retro aesthetic: PixelPanel, PixelCard, PixelButton, monospace fonts, dark navy background
- Event rendering: `<ul>` with sorted events, each as `<li>` with border + bg + mono text
- Agent masking: `maskAgentId()` function in both hook and page
- Color accents: violet (main), gold (ZK), cyan (stats)

### Integration Points
- `useAuctionRoom` hook WebSocket `onmessage` handler — where `zkNullifier`/`bidCommitment` get parsed from incoming JSON
- Activity feed `<li>` render block in `frontend/src/app/auctions/[id]/page.tsx` — where badges get injected
- Agent profile page `zk.membership` PixelPanel — placeholder to replace with real data
- Engine `AuctionEvent` type in `engine/src/types/engine.ts` lines 34-35 — source of truth for ZK fields

</code_context>

<deferred>
## Deferred Ideas

- **DEMO-01**: Full E2E Base Sepolia demo (agent registers → proofs → joins → bids → settles via CRE) — will be recorded when all work is complete
- **DEMO-02**: CCIP Private Transactions future vision narrative — deferred with DEMO-01
- Replay viewer ZK badges — not discussed, could be a follow-up enhancement

</deferred>

---

*Phase: 04-frontend-demo*
*Context gathered: 2026-03-03*
