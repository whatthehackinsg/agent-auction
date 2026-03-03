# Phase 5: Frontend Auction Room Key Figures Dashboard - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

A platform-wide key figures dashboard showing big aggregate numbers across ALL auction rooms — total auctions, USDC bonded, bids placed, agent participation. Displayed as individual stat cards on both the landing page (below hero, above modules) and the auctions list page. This is a spectator-facing component for hackathon judges to see platform scale at a glance.

**Not in scope:** Per-auction-room stats (already exist in `auction.stats` PixelPanel), new auction capabilities, or modifications to existing per-room panels.

</domain>

<decisions>
## Implementation Decisions

### Metrics scope
- Platform-wide aggregates, NOT per-auction-room stats (those already exist)
- 6 key figures in a 2-row x 3-column grid:
  - Row 1: Total Auctions, USDC Bonded (total), Total Bids
  - Row 2: Active Auctions, Settled Auctions, Unique Agents
- Data sourced from engine D1 via a new `/stats` API endpoint
- Security: endpoint must NOT leak agent identities, wallet addresses, or per-agent data — aggregate counts only

### Visual presentation
- Individual stat cards (not a single panel or ticker)
- Each metric gets its own card with a big prominent number
- Count-up animation on page load — numbers tick from 0 to final value (~1s)
- Real-time updates — stats refresh live while the page is open (polling or WebSocket)

### Layout & placement
- Appears on BOTH the landing page and the auctions list page
- Landing page: below hero section, above modules section
- Auctions list page: top of page, above the auction cards
- Desktop: 3 columns x 2 rows grid
- Mobile: 2 columns x 3 rows grid (all 6 cards visible, reflowed)

### Zero state
- Show cards with 0 values when no auctions exist — numbers animate up when auctions start

### Security & API design
- New `/stats` endpoint on the engine — aggregates from D1
- Cached response (10-30s TTL) + rate limiting — no sensitive data exposed
- Only aggregate counts and totals, no identity-revealing information
- No x402 gating — public endpoint for demo accessibility

### Claude's Discretion
- Accent color scheme per card (distinct colors per category vs uniform)
- Exact count-up animation library/approach
- Real-time update mechanism (polling interval vs WebSocket)
- Card internal layout details (icon placement, label typography)
- Cache TTL and rate limit thresholds
- Which existing components to reuse vs create new (PixelCard vs custom StatCard)

</decisions>

<specifics>
## Specific Ideas

- "Big numbers" — the user explicitly wants large, prominent figures that show platform activity at a glance
- Individual stat cards like a dashboard — each metric gets its own spotlight
- Eye-catching for hackathon judges (carrying forward from Phase 4)
- Numbers must count up on load for visual impact
- Real-time updates — judges watching the demo should see numbers change as auctions progress

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PixelCard` (`frontend/src/components/ui/PixelCard.tsx`): Existing card component with title prop — could be base for stat cards
- `PixelPanel` (`frontend/src/components/landing/PixelPanel.tsx`): Used throughout for panels with accent colors (gold, mint, violet, rose)
- `Badge` (`frontend/src/components/ui/Badge.tsx`): For status indicators on cards
- `formatUsdc` (`frontend/src/lib/format.ts`): USDC formatting utility already exists
- `Shuffle` effect (`frontend/src/components/effects/Shuffle.tsx`): Could be relevant for count-up animation

### Established Patterns
- PixelPanel accent colors: gold, mint, violet, rose — consistent visual language
- Data fetching via custom hooks (`useAuctionDetail`, `useAuctionRoom`) — new `usePlatformStats` hook would follow same pattern
- Landing page sections are modular components in `frontend/src/components/landing/sections/`

### Integration Points
- Landing page: `LandingPage.tsx` renders sections — new stats section inserts between HeroSection and ModulesSection
- Auctions list: `frontend/src/app/auctions/page.tsx` — stats component goes above auction cards
- Engine API: new `/stats` route in `engine/src/index.ts` (Hono router), queries D1 for aggregates
- Engine D1: `auctions` table has status, bid data — aggregate queries needed

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-frontend-auction-room-key-figures-dashboard*
*Context gathered: 2026-03-04*
