# Phase 5: Frontend Auction Room Key Figures Dashboard - Research

**Researched:** 2026-03-04
**Domain:** Next.js frontend (React 19, SWR, Tailwind v4) + Cloudflare Workers / Hono engine endpoint
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Platform-wide aggregates only — NOT per-auction-room stats (those already exist in `auction.stats` PixelPanel)
- 6 key figures in a 2-row x 3-column grid:
  - Row 1: Total Auctions, USDC Bonded (total), Total Bids
  - Row 2: Active Auctions, Settled Auctions, Unique Agents
- Data sourced from engine D1 via a new `/stats` API endpoint
- Security: endpoint must NOT leak agent identities, wallet addresses, or per-agent data — aggregate counts only
- Individual stat cards (not a single panel or ticker)
- Each metric gets its own card with a big prominent number
- Count-up animation on page load — numbers tick from 0 to final value (~1s)
- Real-time updates — stats refresh live while the page is open (polling or WebSocket)
- Appears on BOTH the landing page and the auctions list page
- Landing page: below hero section, above modules section
- Auctions list page: top of page, above the auction cards
- Desktop: 3 columns x 2 rows grid
- Mobile: 2 columns x 3 rows grid (all 6 cards visible, reflowed)
- Zero state: show cards with 0 values when no auctions exist
- New `/stats` engine endpoint: aggregates from D1, cached (10-30s TTL), rate limiting, no x402 gating

### Claude's Discretion

- Accent color scheme per card (distinct colors per category vs uniform)
- Exact count-up animation library/approach
- Real-time update mechanism (polling interval vs WebSocket)
- Card internal layout details (icon placement, label typography)
- Cache TTL and rate limit thresholds
- Which existing components to reuse vs create new (PixelCard vs custom StatCard)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 5 adds a platform-wide "key figures" dashboard: six stat cards showing aggregate numbers across all auction rooms. The cards appear on both the landing page (between HeroSection and ModulesSection) and the auctions list page (above auction cards). The engine needs one new Hono route (`GET /stats`) that aggregates counts from the existing D1 `auctions` and `events` tables. The frontend needs a new hook (`usePlatformStats`), a reusable `StatCard` component built on `PixelPanel`, and a `PlatformStatsSection` wrapper component.

The project already uses SWR with 5-second polling for all data hooks (`useAuctions`, `useAuctionDetail`). This is the correct pattern for the stats hook. Count-up animation is Claude's discretion: the simplest correct approach is a pure React hook using `requestAnimationFrame` with no additional library, since GSAP is already available in the project but oriented toward scroll/character effects (the `Shuffle` component). A custom `useCountUp` hook avoids a new dependency while giving full control over the 0-to-final easing.

The visual language is fully defined: `PixelPanel` with `AccentTone` values (mint, gold, violet, rose) and the established Tailwind colour tokens. Six cards can use a repeating sequence of the four accent colours to give each card its own identity.

**Primary recommendation:** Engine adds `GET /stats` (pure D1 aggregate query, 10s TTL via `Cache-Control`), frontend adds `usePlatformStats` SWR hook + `StatCard` + `PlatformStatsSection`, inserted into `LandingPage.tsx` and `auctions/page.tsx`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SWR | already in project | Data fetching + polling | Used by all existing hooks (`useAuctions`, `useAuctionDetail`) |
| React 19 | already in project | Component rendering | Project standard |
| Next.js 16 | already in project | App router, client components | Project standard |
| Hono | already in engine | HTTP routing in Cloudflare Worker | All engine routes use Hono |
| Cloudflare D1 (SQLite) | already in engine | Data source for aggregates | All auction metadata lives here |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| GSAP (already installed) | already in project | Animation | Already used for Shuffle; count-up does NOT need GSAP — use native rAF instead |
| Tailwind v4 | already in project | Utility styles | All components use it |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom `useCountUp` hook (rAF) | `react-countup` npm package | Extra dependency not worth it — rAF approach is ~30 lines and matches project preference for self-contained logic |
| SWR polling | WebSocket | WebSocket adds setup complexity for read-only stats; polling every 10-15s is sufficient and matches existing hook pattern |
| `PixelPanel` as card base | New custom card | `PixelPanel` already has accent + border language; reuse avoids visual inconsistency |

**Installation:** No new packages needed. All required libraries are already installed.

---

## Architecture Patterns

### Recommended Project Structure

```
engine/src/index.ts           — add GET /stats route (inline, like GET /auctions)
engine/test/api.test.ts       — add stats route test cases

frontend/src/
├── hooks/
│   └── usePlatformStats.ts   — SWR hook, mirrors useAuctions.ts pattern
├── components/
│   ├── landing/
│   │   └── sections/
│   │       └── PlatformStatsSection.tsx   — landing page section wrapper
│   └── stats/
│       └── StatCard.tsx                   — single stat card (PixelPanel-based)
├── app/
│   └── auctions/
│       └── page.tsx                       — insert <PlatformStatsGrid> above auction list
└── lib/
    └── format.ts                          — add formatBigNumber() helper if needed
```

### Pattern 1: Engine GET /stats Route

**What:** A single Hono GET handler that runs three aggregate D1 queries and returns a flat JSON object. No auth, no x402. Response includes a `Cache-Control: public, max-age=10` header so Cloudflare's edge caches it for 10 seconds.

**When to use:** Simple aggregations that can be derived entirely from existing D1 tables without touching Durable Objects.

**Example:**
```typescript
// engine/src/index.ts — add after GET /auctions

app.get('/stats', async (c) => {
  const db = c.env.AUCTION_DB

  const [totals, bids, agents] = await Promise.all([
    // total/active/settled auction counts + sum of deposit_amount as USDC bonded proxy
    db.prepare(`
      SELECT
        COUNT(*) AS total_auctions,
        SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS active_auctions,
        SUM(CASE WHEN status = 3 THEN 1 ELSE 0 END) AS settled_auctions,
        SUM(CAST(deposit_amount AS INTEGER)) AS total_usdc_bonded
      FROM auctions
    `).first<{
      total_auctions: number
      active_auctions: number
      settled_auctions: number
      total_usdc_bonded: number | null
    }>(),

    // total BID events
    db.prepare(`
      SELECT COUNT(*) AS total_bids
      FROM events
      WHERE action_type = 'BID'
    `).first<{ total_bids: number }>(),

    // unique agent IDs across all events
    db.prepare(`
      SELECT COUNT(DISTINCT agent_id) AS unique_agents
      FROM events
    `).first<{ unique_agents: number }>(),
  ])

  return c.json(
    {
      totalAuctions: totals?.total_auctions ?? 0,
      activeAuctions: totals?.active_auctions ?? 0,
      settledAuctions: totals?.settled_auctions ?? 0,
      totalUsdcBonded: String(totals?.total_usdc_bonded ?? 0),
      totalBids: bids?.total_bids ?? 0,
      uniqueAgents: agents?.unique_agents ?? 0,
    },
    200,
    { 'Cache-Control': 'public, max-age=10, stale-while-revalidate=30' }
  )
})
```

**Security note:** `agent_id` in the `events` table is the numeric agent ID (not wallet address). `COUNT(DISTINCT agent_id)` is a count — no identity is exposed.

### Pattern 2: usePlatformStats Hook

**What:** SWR hook following the exact pattern of `useAuctions` — same `fetcher`, same `refreshInterval` approach.

**Example:**
```typescript
// frontend/src/hooks/usePlatformStats.ts
'use client'

import useSWR from 'swr'
import { fetcher } from '@/lib/api'

export interface PlatformStats {
  totalAuctions: number
  activeAuctions: number
  settledAuctions: number
  totalUsdcBonded: string   // base units string, like USDC amounts elsewhere
  totalBids: number
  uniqueAgents: number
}

export function usePlatformStats() {
  const { data, error, isLoading } = useSWR<PlatformStats>(
    '/stats',
    fetcher,
    { refreshInterval: 15_000 }  // 15s — matches 10s cache TTL with buffer
  )
  return {
    stats: data ?? null,
    isLoading,
    error,
  }
}
```

### Pattern 3: useCountUp Hook

**What:** Pure React hook using `requestAnimationFrame` to animate from 0 to a target number over ~1 second. No library dependency.

**When to use:** Whenever `stats` data arrives (initial load or update). Re-triggers animation when `target` changes by more than a threshold.

**Example:**
```typescript
// frontend/src/hooks/useCountUp.ts
'use client'

import { useEffect, useRef, useState } from 'react'

export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const fromRef = useRef(0)

  useEffect(() => {
    if (target === 0) { setValue(0); return }
    fromRef.current = value
    startRef.current = null

    const step = (now: number) => {
      if (startRef.current === null) startRef.current = now
      const elapsed = now - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      // ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(fromRef.current + (target - fromRef.current) * eased))
      if (progress < 1) rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])

  return value
}
```

### Pattern 4: StatCard Component

**What:** A single stat card built on `PixelPanel`. Big number up top, label below. Uses `useCountUp` for the animated value. Accepts an `AccentTone` prop.

**When to use:** Render one per metric inside the stats grid.

**Example:**
```typescript
// frontend/src/components/stats/StatCard.tsx
'use client'

import { PixelPanel } from '@/components/landing/PixelPanel'
import { AccentTone, accentStyles } from '@/components/landing/accent'
import { useCountUp } from '@/hooks/useCountUp'
import { cn } from '@/lib/utils'

interface StatCardProps {
  accent: AccentTone
  label: string
  value: number           // integer count
  displayValue?: string   // override for formatted values (e.g. USDC)
  sublabel?: string       // optional descriptor line
  headerLabel: string     // PixelPanel header text
}

export function StatCard({ accent, label, value, displayValue, sublabel, headerLabel }: StatCardProps) {
  const animated = useCountUp(value)
  const tone = accentStyles[accent]

  return (
    <PixelPanel accent={accent} headerLabel={headerLabel}>
      <div className="flex flex-col gap-1">
        <span className={cn('font-mono text-4xl font-bold tabular-nums leading-none', tone.value)}>
          {displayValue ?? animated.toLocaleString()}
        </span>
        <span className={cn('font-mono text-[10px] font-bold uppercase tracking-[0.14em] mt-2', tone.label)}>
          {label}
        </span>
        {sublabel ? (
          <span className={cn('font-mono text-[10px]', tone.muted)}>{sublabel}</span>
        ) : null}
      </div>
    </PixelPanel>
  )
}
```

### Pattern 5: PlatformStatsSection (Landing Page)

**What:** A `SectionShell`-wrapped grid of 6 `StatCard` components. Fetches via `usePlatformStats`. Handles loading (skeleton cards) and error states. Inserted between `<HeroSection />` and `<ProblemSection />` in `LandingPage.tsx`.

**Grid layout:** `grid grid-cols-2 md:grid-cols-3 gap-4` — gives 2-col on mobile, 3-col on desktop.

### Anti-Patterns to Avoid

- **Fetching `/stats` server-side in Next.js RSC:** The landing page sections are all currently client-rendered (no `'use server'` pattern), and the auctions page is `'use client'`. Keep stats client-side with SWR for consistent real-time updates.
- **Putting count-up logic inside `StatCard` with a `useEffect` on a local counter:** Extract to `useCountUp` hook so it is reusable and testable independently.
- **Using `deposit_amount` as a proxy for "USDC bonded" without clarifying it is the deposit requirement, not the actual escrowed amount:** The `deposit_amount` column is per-auction requirement. Document this in the API response comment. The actual on-chain escrow amounts live on `AuctionEscrow.sol` — querying the contract is out of scope for this phase. Use D1 `deposit_amount` sum as the "platform total required bond" figure and label it accordingly in the UI.
- **Querying all auctions + all events in the frontend hook:** D1 aggregate SQL on the engine side, not computation in the browser.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Data fetching + caching | Custom fetch with useState | SWR | Already used throughout project; handles deduplication, revalidation, error states |
| USDC formatting | Custom formatter | `formatUsdc()` from `@/lib/format` | Already handles base-unit → display conversion |
| Accent colour tokens | Inline Tailwind colours | `AccentTone` + `accentStyles` from `accent.ts` | Ensures visual consistency with rest of platform |
| Card border/panel chrome | Custom div | `PixelPanel` | Already handles border-left accent, header, HUD markers language |

---

## Common Pitfalls

### Pitfall 1: `deposit_amount` Is Not Actual Escrow Amount

**What goes wrong:** Labelling the sum of `deposit_amount` as "USDC Bonded" suggests real on-chain escrow. The D1 column is the per-auction bond *requirement* set at creation, not what agents actually deposited on-chain.

**Why it happens:** It is the closest proxy available in D1 without an on-chain read.

**How to avoid:** Label the card "USDC Required" or "Total Bond Required" in the UI, not "USDC Bonded". Or acknowledge in a tooltip/sublabel that this is the total required across all auctions.

**Warning signs:** Judges asking why the number doesn't match what they see on BaseScan.

### Pitfall 2: `unique_agents` Counts agent_id Column — Which Is a String

**What goes wrong:** `agent_id` in the `events` table is stored as `TEXT` (see schema). `COUNT(DISTINCT agent_id)` will work correctly for string values, but if agent IDs include both numeric strings ('1', '2') and hex-format agent IDs from different flows, the count may overcount unique real-world agents.

**Why it happens:** The `events` table was designed for the engine's internal sequencing and accepts any `agent_id` string from the request body.

**How to avoid:** Verify with a quick `SELECT DISTINCT agent_id FROM events LIMIT 20` against the real D1 to confirm the format is consistent before shipping. If mixed formats are found, add a `WHERE action_type IN ('JOIN', 'BID')` filter to only count participating agents.

### Pitfall 3: Count-Up Animates Again on Every SWR Refetch

**What goes wrong:** `useCountUp` re-runs its `useEffect` whenever `target` changes. Since SWR polls every 15 seconds, the number animates from its previous value to the new one every poll — which is actually desirable for incremental changes but could look jarring if a large value re-animates unnecessarily.

**Why it happens:** SWR returns the same object reference only if data hasn't changed. If the server returns fresh JSON each time, SWR will trigger a re-render even when values are identical.

**How to avoid:** In `useCountUp`, only restart animation if `Math.abs(target - prevTarget) > 0`. Add a `prevTarget` ref check before kicking off the RAF loop. This means stable numbers don't re-animate on every poll — only genuine changes do.

### Pitfall 4: Landing Page Is a Server Component

**What goes wrong:** `LandingPage.tsx` currently has no `'use client'` directive. Adding `usePlatformStats` (which is `'use client'`) directly into `LandingPage.tsx` would break server rendering.

**Why it happens:** The landing page renders static content; the stats section needs client-side data fetching.

**How to avoid:** Create `PlatformStatsSection.tsx` as its own `'use client'` component. Insert `<PlatformStatsSection />` into `LandingPage.tsx` — Next.js will correctly treat it as a client island within a server component tree.

### Pitfall 5: Cloudflare D1 `SUM` Returns `null` on Empty Table

**What goes wrong:** `SUM(CAST(deposit_amount AS INTEGER))` returns `null` when there are no rows, not `0`. The TypeScript type needs to handle `null` explicitly.

**Why it happens:** Standard SQL aggregate behaviour — SUM of empty set is NULL.

**How to avoid:** Use `?? 0` in the engine route handler (already shown in code example above). On the frontend, treat `null` stats as all-zeros with a fallback default in the hook.

---

## Code Examples

### D1 Aggregate Query — Verified Against Schema

```typescript
// Source: verified against engine/schema.sql
// auctions table columns: auction_id, status, deposit_amount, created_at
// events table columns: auction_id, action_type, agent_id
// status enum: NONE=0, OPEN=1, CLOSED=2, SETTLED=3, CANCELLED=4

const totals = await db.prepare(`
  SELECT
    COUNT(*) AS total_auctions,
    SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS active_auctions,
    SUM(CASE WHEN status = 3 THEN 1 ELSE 0 END) AS settled_auctions,
    SUM(CAST(deposit_amount AS INTEGER)) AS total_usdc_bonded
  FROM auctions
`).first<{
  total_auctions: number
  active_auctions: number
  settled_auctions: number
  total_usdc_bonded: number | null
}>()
```

### SWR Hook — Follows useAuctions.ts Pattern Exactly

```typescript
// Source: verified against frontend/src/hooks/useAuctions.ts
import useSWR from 'swr'
import { fetcher } from '@/lib/api'
// fetcher prepends API_BASE_URL (NEXT_PUBLIC_ENGINE_URL) automatically
```

### LandingPage.tsx Insertion Point

```typescript
// Source: verified against frontend/src/components/landing/LandingPage.tsx
// Current order: HeroSection → ProblemSection → ArchitectureSection → ...
// New order:     HeroSection → PlatformStatsSection → ProblemSection → ...

import { PlatformStatsSection } from "./sections/PlatformStatsSection";
// ...
<HeroSection />
<PlatformStatsSection />   // INSERT HERE
<ProblemSection />
```

### Auctions Page Insertion Point

```typescript
// Source: verified against frontend/src/app/auctions/page.tsx
// Current: <AuctionShell><section className="mb-6">...</section>{auction cards}
// New:     <AuctionShell><PlatformStatsSection /><section ...>{auction cards}
```

### Accent Colour Assignment for 6 Cards

```typescript
// Source: verified against frontend/src/components/landing/accent.ts
// Four tones: mint, gold, violet, rose
const STAT_ACCENTS: AccentTone[] = ['mint', 'gold', 'violet', 'rose', 'mint', 'gold']
// Row 1: Total Auctions (mint), USDC Bonded (gold), Total Bids (violet)
// Row 2: Active Auctions (rose), Settled Auctions (mint), Unique Agents (gold)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate stats fetch per metric | Single `/stats` endpoint, one fetch for all 6 numbers | This phase | One network round-trip for the whole dashboard |
| No platform-wide aggregate view | `/stats` D1 aggregate query | This phase | Judges can see platform activity at a glance |

**No deprecated patterns apply** — this phase introduces entirely new functionality.

---

## Open Questions

1. **USDC Bonded label accuracy**
   - What we know: D1 `deposit_amount` is the required bond per auction, not the actual on-chain deposited amount
   - What's unclear: Whether judges will distinguish "required" vs "actually deposited"
   - Recommendation: Label as "Bond Required" or "Total Bond (USDC)" in the UI with a sublabel `// platform total` to set expectations

2. **Rate limiting on `/stats`**
   - What we know: The CONTEXT.md says rate limiting is desired; Cloudflare Workers have no built-in rate limiter in the free tier
   - What's unclear: Whether the Cloudflare Rate Limiting product (paid) is configured on this deployment
   - Recommendation: Rely on the 10-second `Cache-Control` header as the primary throttle for this hackathon phase — CDN-level caching means most requests never hit D1. Add a comment in code noting where a rate limiter could plug in.

3. **`unique_agents` data quality**
   - What we know: `agent_id` is TEXT in `events` and comes from request bodies
   - What's unclear: Whether mixed-format IDs (numeric vs hex) exist in the real D1
   - Recommendation: Add a `WHERE action_type IN ('JOIN', 'BID')` filter to the unique agent query to restrict to meaningful participation events

---

## Sources

### Primary (HIGH confidence)

- Verified directly against `/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/engine/schema.sql` — D1 table columns, types, status enum
- Verified against `engine/src/index.ts` — Hono route patterns, D1 query style, response shape
- Verified against `frontend/src/hooks/useAuctions.ts` — SWR hook pattern, `fetcher` import
- Verified against `frontend/src/hooks/useAuctionDetail.ts` — SWR refreshInterval pattern
- Verified against `frontend/src/components/landing/LandingPage.tsx` — section insertion points
- Verified against `frontend/src/components/landing/PixelPanel.tsx` — component API
- Verified against `frontend/src/components/landing/accent.ts` — AccentTone system
- Verified against `frontend/src/components/landing/SectionShell.tsx` — section wrapper pattern
- Verified against `frontend/src/app/auctions/page.tsx` — auctions list insertion point
- Verified against `frontend/src/lib/format.ts` — existing formatUsdc utility
- Verified against `frontend/src/lib/api.ts` — fetcher, API_BASE_URL pattern

### Secondary (MEDIUM confidence)

- Count-up animation approach: custom rAF hook is a well-established React pattern; no external verification needed — implementation is straightforward

### Tertiary (LOW confidence)

- Cloudflare D1 `Cache-Control` behaviour on Worker responses: standard HTTP, but D1-backed Worker routes may not be edge-cached depending on Cloudflare plan tier. Mark LOW — verify in deployment if caching is critical.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project, verified against source
- Architecture: HIGH — patterns derived from existing code, not speculation
- D1 queries: HIGH — verified against schema.sql column names and types
- Pitfalls: HIGH — derived from actual code inspection (null SUM, client component boundary)
- Count-up animation: MEDIUM — custom rAF approach is standard; specific easing is discretion

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable stack — dependencies unlikely to change)
