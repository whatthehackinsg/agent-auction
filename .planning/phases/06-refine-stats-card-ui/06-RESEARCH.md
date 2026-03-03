# Phase 6: Refine Stats Card UI - Research

**Researched:** 2026-03-04
**Domain:** CSS animations (shimmer, glow), Tailwind CSS v4 custom keyframes, React component refactoring
**Confidence:** HIGH

## Summary

This is a purely front-end CSS polish phase with no new dependencies, no API changes, and no logic changes. The work breaks into two orthogonal concerns: (1) adding idle shimmer + hover glow visual effects to `StatCard` via CSS keyframe animations and box-shadow transitions, and (2) extracting a 3-card auctions-page variant of `PlatformStatsSection` that reuses the same data hook and components.

The project already uses Tailwind CSS v4 with `@keyframes` defined directly in `globals.css` (outside `@theme`). The existing pattern of custom animation utility classes (e.g., `animate-route-scan`, `animate-pixel-twinkle`) and the `prefers-reduced-motion` media query block provide a clear template for adding shimmer and glow animations. No new libraries are needed.

**Primary recommendation:** Use `linear-gradient` + `background-position` animation on a `::before` pseudo-element for the border shimmer (maximum compatibility, simple implementation), and accent-derived `box-shadow` with CSS `transition` for the hover glow. Define keyframes in `globals.css` following the existing project pattern.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

1. **Visual Direction -- Keep Pixel Style + Add Effects**: Keep the existing `PixelPanel` base component. Do NOT redesign or replace it. Add visual effects on top:
   - Subtle idle shimmer: A faint traveling highlight across the card border when idle. CSS animation (not JS). "Always alive" feel -- stats feel like a live HUD, not static boxes.
   - Border glow on hover: Accent-colored `box-shadow` intensifies on hover. Neon feel matching each card's accent tone (mint/gold/violet/rose). Smooth transition in/out.
   - No loading skeleton (keep current 0->count-up behavior).
   - No pulse on value change (existing count-up animation is sufficient).

2. **Auctions Page -- 3 Auction-Specific Stats**: The auctions page (`/auctions`) shows only 3 stats (not the landing page's 6):
   - Total Auctions (mint, `auctions.total`)
   - Active Auctions (rose, `auctions.active`)
   - USDC Bonded (gold, `bonds.total`)
   - Layout: single row, 3 columns on desktop, stack or 1-col on mobile.

3. **Landing Page -- Unchanged**: Landing page keeps all 6 stat cards with current layout (2-col mobile / 3-col desktop).

### Design Constraints (from CONTEXT.md)
- Shimmer must be pure CSS (keyframe animation on pseudo-element or border gradient)
- Glow must use accent tone colors from `accentStyles` -- not hardcoded
- Effects must not cause layout shift or jank on mobile
- Stat cards should still use `PixelPanel` as their base -- effects are additive

### Deferred Ideas (OUT OF SCOPE)
None.

</user_constraints>

## Standard Stack

### Core (Already in Project -- No New Dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind CSS | v4 | Utility-first CSS with `@theme` variables | Already project standard |
| React | 19.2.3 | Component framework | Already project standard |
| Next.js | 16.1.6 | App router | Already project standard |

### Supporting (Already in Project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tailwind-merge` | 3.5.0 | Merge/deduplicate TW classes | Used via `cn()` utility |
| `clsx` | 2.1.1 | Conditional class names | Used via `cn()` utility |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS `@keyframes` shimmer | `conic-gradient` + `@property` rotating border | More visually dramatic but heavier; `@property` is Baseline since July 2024 (Firefox 128+) but unnecessary complexity for a subtle shimmer |
| CSS `box-shadow` transition | Framer Motion `animate` | Already in deps but JS-driven animation is overkill for a simple shadow transition; CSS transitions are more performant |
| Custom CSS in `globals.css` | Tailwind `@theme` block `--animate-*` | Could use `@theme` for tree-shaking, but project already defines all animations outside `@theme` -- follow existing pattern |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Current Component Tree

```
LandingPage
  └── PlatformStatsSection (6 cards, grid 2-col / 3-col)
        ├── StatCard x5 (each wraps PixelPanel)
        └── UsdcStatCard x1 (custom BigInt handling, wraps StatCard)

AuctionsPage
  └── PlatformStatsSection (same 6 cards -- WILL CHANGE to 3)
```

### Target Component Tree

```
LandingPage
  └── PlatformStatsSection (6 cards, unchanged)
        ├── StatCard x5
        └── UsdcStatCard x1

AuctionsPage
  └── AuctionStatsSection (NEW -- 3 cards, grid 1-col / 3-col)
        ├── StatCard (Total Auctions, mint)
        ├── StatCard (Active Auctions, rose)
        └── UsdcStatCard (USDC Bonded, gold)

StatCard (MODIFIED -- shimmer + glow effects)
  └── PixelPanel (UNCHANGED -- base component)
        └── ::before pseudo-element (NEW -- shimmer overlay)
```

### Recommended File Structure

```
frontend/src/
├── components/
│   ├── stats/
│   │   └── StatCard.tsx            # MODIFY: add shimmer + glow wrapper
│   └── landing/
│       ├── accent.ts               # MODIFY: add glowColor per tone
│       ├── PixelPanel.tsx           # UNCHANGED
│       └── sections/
│           ├── PlatformStatsSection.tsx   # MODIFY: export UsdcStatCard
│           └── AuctionStatsSection.tsx    # NEW: 3-card variant
├── app/
│   ├── auctions/
│   │   └── page.tsx                # MODIFY: swap PlatformStatsSection -> AuctionStatsSection
│   └── globals.css                 # MODIFY: add shimmer + glow keyframes
└── hooks/
    └── usePlatformStats.ts         # UNCHANGED
```

### Pattern 1: Shimmer via `::before` Pseudo-Element + `linear-gradient`

**What:** A faint traveling highlight that sweeps across the card border continuously. Implemented as a CSS `::before` pseudo-element with an animated `linear-gradient` using `background-position` keyframes.

**When to use:** Idle state of every `StatCard` instance.

**Why this approach over alternatives:**
- `linear-gradient` + `background-position` is universally supported (no `@property` needed)
- `::before` pseudo-element avoids adding DOM nodes (React component stays clean)
- `background-position` animation runs on the compositor thread (GPU-accelerated, no layout/paint)
- The project's `PixelPanel` uses `<article>` element with `relative` positioning -- a pseudo-element on the `StatCard` wrapper (not inside `PixelPanel`) avoids modifying the shared base component

**Implementation approach:**

The shimmer effect wraps around the card via a `::before` pseudo-element positioned with `inset: -1px` (overlapping the border area). The pseudo-element uses a `linear-gradient` with a transparent-to-accent-to-transparent pattern, and `background-size` set much wider than the element. The `@keyframes` animation shifts `background-position` from left to right in a loop.

```css
/* globals.css -- shimmer keyframe */
@keyframes stat-shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.animate-stat-shimmer {
  animation: stat-shimmer 4s ease-in-out infinite;
}
```

The pseudo-element approach in the React component:

```tsx
// StatCard.tsx -- conceptual structure
<div className="relative">
  {/* Shimmer pseudo-element via CSS class */}
  <div className="stat-card-shimmer pointer-events-none absolute inset-[-1px] z-0 overflow-hidden">
    {/* Animated gradient overlay on border area only */}
  </div>
  <PixelPanel accent={accent} headerLabel={headerLabel} className="relative z-10">
    {/* content */}
  </PixelPanel>
</div>
```

**Alternative (pure CSS pseudo-element):** If the wrapper `div` has `position: relative` and `overflow: hidden`, a `::before` pseudo-element can be styled entirely in CSS without extra DOM. However, since `PixelPanel` already uses `relative` positioning internally, the shimmer wrapper must be a parent `div` above `PixelPanel`.

**Key detail:** The shimmer should be *faint* -- use very low opacity (0.15-0.25) on the gradient highlight to achieve "always alive" without being distracting. The accent color for each tone provides the shimmer tint.

### Pattern 2: Hover Glow via `box-shadow` Transition

**What:** Accent-colored `box-shadow` that intensifies on hover, creating a neon glow effect.

**When to use:** Hover state of every `StatCard`.

**Implementation approach:**

Add a subtle resting glow and intensify it on hover using CSS transitions. The glow color derives from each accent tone's existing border color.

```css
/* Conceptual -- applied via inline style or dynamic class */
/* Idle state */
box-shadow: 0 0 8px 0 rgba(accent, 0.15), inset 0 0 8px 0 rgba(accent, 0.05);

/* Hover state */
box-shadow: 0 0 20px 2px rgba(accent, 0.35), inset 0 0 12px 0 rgba(accent, 0.1);

transition: box-shadow 0.3s ease-in-out;
```

**Why inline styles for glow:** The glow color must be dynamic per accent tone. Tailwind's `shadow-*` utilities don't support arbitrary `rgba()` with variable colors cleanly. The cleanest approach is to add a `glow` property to each accent tone in `accent.ts` containing the raw hex or rgba value, then apply `box-shadow` via `style` prop.

**Accent glow colors (derived from existing border colors):**

| Tone | Border Color | Glow Color (for box-shadow) |
|------|-------------|---------------------------|
| mint | `#58c7ad` | `rgba(88, 199, 173, VAR)` |
| gold | `#d7aa61` | `rgba(215, 170, 97, VAR)` |
| violet | `#b79bf0` | `rgba(183, 155, 240, VAR)` |
| rose | `#d68da6` | `rgba(214, 141, 166, VAR)` |

### Pattern 3: Auctions Page Stats Extraction

**What:** A new `AuctionStatsSection` component that shows 3 auction-specific stats in a single row.

**When to use:** `/auctions` page only.

**Implementation approach:**

```tsx
// AuctionStatsSection.tsx
export function AuctionStatsSection({ className }: { className?: string }) {
  const { stats, isLoading, error } = usePlatformStats()
  if (error) return null

  return (
    <SectionShell tag="[ :: AUCTION_STATS :: ]" showBraces={false} className={cn('py-8 md:py-12', className)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
        <StatCard accent="mint" label="Total Auctions" value={isLoading ? 0 : (stats?.totalAuctions ?? 0)} headerLabel="auctions.total" />
        <StatCard accent="rose" label="Active Auctions" value={isLoading ? 0 : (stats?.activeAuctions ?? 0)} headerLabel="auctions.active" />
        <UsdcStatCard value={stats?.totalUsdcBonded ?? '0'} isLoading={isLoading} />
      </div>
    </SectionShell>
  )
}
```

**Key detail:** `UsdcStatCard` is currently a private function inside `PlatformStatsSection.tsx`. It needs to be exported (or moved to a shared location) so `AuctionStatsSection` can reuse it. Moving it to `StatCard.tsx` or a new `UsdcStatCard.tsx` are both viable; keeping it in `PlatformStatsSection.tsx` and just adding `export` is simplest.

### Anti-Patterns to Avoid

- **Modifying `PixelPanel` for stat-specific effects:** `PixelPanel` is used across the entire app (auction rooms, error panels, etc.). Shimmer/glow effects are specific to stat cards -- keep them in `StatCard`.
- **JavaScript-driven shimmer animation:** The user explicitly requires pure CSS. No `useEffect`/`requestAnimationFrame` for shimmer.
- **Hardcoded glow colors:** Glow must derive from `accentStyles` tone values, not inline hex strings repeated across components.
- **`@property` + `conic-gradient` for shimmer:** While now Baseline (Firefox 128+, July 2024), this is over-engineered for a subtle idle shimmer. `linear-gradient` + `background-position` is simpler and universally supported.
- **Layout-shifting animations:** Shimmer must use `transform`/`opacity`/`box-shadow` or `background-position` only -- never `width`/`height`/`margin`/`padding`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Conditional class merging | Manual string concatenation | `cn()` (clsx + tailwind-merge) | Already used everywhere in project |
| Accent color lookup | Switch statements per component | `accentStyles[accent]` from `accent.ts` | Single source of truth for all tone colors |
| Data fetching for stats | Custom fetch logic | `usePlatformStats()` hook (SWR) | Already handles loading/error/cache |
| Count-up animation | Custom animation | `useCountUp()` hook | Already implemented with RAF + easing |

## Common Pitfalls

### Pitfall 1: Pseudo-Element Overflow Clipping

**What goes wrong:** The shimmer pseudo-element extends beyond the card boundary (to overlap the border), but `overflow: hidden` on the card or a parent clips it.
**Why it happens:** `PixelPanel` uses `relative` positioning but doesn't set `overflow`. Parent layout containers might.
**How to avoid:** Add a shimmer wrapper `div` with `position: relative; overflow: hidden` around `PixelPanel`. The shimmer pseudo-element lives on this wrapper, not on `PixelPanel` itself.
**Warning signs:** Shimmer appears inside the card content area instead of along the border.

### Pitfall 2: Box-Shadow Causing Layout Shift

**What goes wrong:** Adding `box-shadow` on hover causes neighboring cards in the grid to shift.
**Why it happens:** `box-shadow` does NOT affect layout (it's paint-only), so this shouldn't happen. But if the hover also adds `outline`, `border-width` changes, or `transform: scale()`, those DO affect layout.
**How to avoid:** Use only `box-shadow` for the glow. Do not change `border-width`, `padding`, or add `transform: scale()` on hover.
**Warning signs:** Cards "jumping" on hover in the grid layout.

### Pitfall 3: Shimmer Performance on Mobile

**What goes wrong:** Continuous shimmer animation causes battery drain or frame drops on low-end mobile devices.
**Why it happens:** `background-position` animations are generally GPU-composited, but if the gradient is complex or the element forces a repaint, it can be expensive.
**How to avoid:** (1) Use `will-change: background-position` on the shimmer element. (2) Keep gradient stops simple (3 stops max). (3) Honor `prefers-reduced-motion` -- the project already has a `@media (prefers-reduced-motion: reduce)` block in `globals.css` that disables animations. Add the shimmer class to this block.
**Warning signs:** `requestAnimationFrame` budget exceeded in Chrome DevTools Performance tab.

### Pitfall 4: `UsdcStatCard` Not Exported

**What goes wrong:** The `AuctionStatsSection` can't use `UsdcStatCard` because it's a module-private function.
**Why it happens:** It was written as a local helper inside `PlatformStatsSection.tsx`.
**How to avoid:** Export it from `PlatformStatsSection.tsx` or move it to a shared file.
**Warning signs:** TypeScript import error.

### Pitfall 5: Tailwind v4 Purging Custom Classes

**What goes wrong:** Custom CSS classes defined in `globals.css` but only referenced via dynamic string interpolation get purged.
**Why it happens:** Tailwind v4 scans source files for class names. If a class name is constructed dynamically (e.g., `` `animate-${name}` ``), Tailwind can't detect it.
**How to avoid:** Use complete, static class names in JSX. The shimmer and glow utility classes should be full strings, not dynamically constructed.
**Warning signs:** Animation works in dev but disappears in production build.

## Code Examples

### Example 1: Adding Glow Color to `accent.ts`

```typescript
// accent.ts -- add glowRgb property to each tone
export const accentStyles: Record<AccentTone, {
  panel: string;
  border: string;
  headerRule: string;
  label: string;
  value: string;
  muted: string;
  dim: string;
  chip: string;
  glowRgb: string;  // NEW: raw RGB values for box-shadow
}> = {
  mint: {
    // ... existing properties
    glowRgb: '88, 199, 173',  // from border #58c7ad
  },
  gold: {
    // ... existing properties
    glowRgb: '215, 170, 97',  // from border #d7aa61
  },
  violet: {
    // ... existing properties
    glowRgb: '183, 155, 240',  // from border #b79bf0
  },
  rose: {
    // ... existing properties
    glowRgb: '214, 141, 166',  // from border #d68da6
  },
};
```

### Example 2: Shimmer Keyframe in `globals.css`

```css
/* Add to globals.css -- shimmer animation for stat cards */
@keyframes stat-shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.animate-stat-shimmer {
  animation: stat-shimmer 4s ease-in-out infinite;
}

/* Add to existing prefers-reduced-motion block */
@media (prefers-reduced-motion: reduce) {
  /* ... existing selectors ... */
  .animate-stat-shimmer {
    animation: none !important;
  }
}
```

### Example 3: StatCard with Shimmer + Glow

```tsx
// StatCard.tsx -- complete revised component
'use client'
import { PixelPanel } from '@/components/landing/PixelPanel'
import { type AccentTone, accentStyles } from '@/components/landing/accent'
import { useCountUp } from '@/hooks/useCountUp'
import { cn } from '@/lib/utils'

interface StatCardProps {
  accent: AccentTone
  label: string
  value: number
  displayValue?: string
  headerLabel: string
}

export function StatCard({ accent, label, value, displayValue, headerLabel }: StatCardProps) {
  const animated = useCountUp(value)
  const tone = accentStyles[accent]

  return (
    <div
      className="group relative"
      style={{
        '--glow-rgb': tone.glowRgb,
        boxShadow: `0 0 8px 0 rgba(${tone.glowRgb}, 0.12)`,
        transition: 'box-shadow 0.3s ease-in-out',
      } as React.CSSProperties}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow =
          `0 0 20px 2px rgba(${tone.glowRgb}, 0.35), inset 0 0 12px 0 rgba(${tone.glowRgb}, 0.08)`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow =
          `0 0 8px 0 rgba(${tone.glowRgb}, 0.12)`
      }}
    >
      {/* Shimmer overlay -- travels along the border */}
      <div
        className="animate-stat-shimmer pointer-events-none absolute inset-0 z-20 overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(90deg, transparent 0%, rgba(${tone.glowRgb}, 0.15) 50%, transparent 100%)`,
            backgroundSize: '200% 100%',
            maskImage: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            maskComposite: 'exclude',
            WebkitMaskComposite: 'xor',
            padding: '2px',
          }}
        />
      </div>

      <PixelPanel accent={accent} headerLabel={headerLabel} className="relative z-10">
        <div className="flex flex-col gap-1">
          <span className={cn('font-mono text-3xl font-bold tabular-nums leading-none md:text-4xl', tone.value)}>
            {displayValue ?? animated.toLocaleString()}
          </span>
          <span className={cn('font-mono text-[10px] font-bold uppercase tracking-[0.14em] mt-2', tone.label)}>
            {label}
          </span>
        </div>
      </PixelPanel>
    </div>
  )
}
```

**Note:** The example above uses `onMouseEnter`/`onMouseLeave` for the glow, but a pure CSS approach using `group-hover:` on the wrapper with a CSS variable for `box-shadow` is also viable and preferred. The planner should choose the cleanest implementation -- the CSS-only approach would use the `style` prop for the idle glow and a custom CSS class with `:hover` selector for the intensified glow.

### Example 4: Mask-Composite Border-Only Shimmer

The `mask-composite: exclude` technique creates a "hollow" mask that only shows the shimmer along the border edge, not inside the card content area. This is the key to making the shimmer appear as a traveling border highlight rather than a content overlay.

```css
/* The mask technique: */
mask-image:
  linear-gradient(#fff 0 0) content-box,   /* inner mask (content area) */
  linear-gradient(#fff 0 0);                /* outer mask (full element) */
mask-composite: exclude;          /* subtract inner from outer = border only */
-webkit-mask-composite: xor;     /* Safari equivalent */
padding: 2px;                    /* controls shimmer "border" thickness */
```

Browser support: `mask-composite: exclude` is Baseline since March 2023 (Chrome 120, Firefox 53, Safari 15.4). Safe to use.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@keyframes` in `tailwind.config.js` | `@keyframes` in CSS (globals.css or `@theme` block) | Tailwind v4 (Jan 2025) | No config file needed; project already follows this |
| `border-image` for animated borders | `conic-gradient` + `@property` | Baseline July 2024 | Available but overkill for this use case |
| Vendor-prefixed masks (`-webkit-mask`) | Standard `mask-composite: exclude` | Baseline March 2023 | Still include `-webkit-mask-composite: xor` for safety |

**Not needed for this phase:**
- `@property` (would enable conic-gradient rotation, but `linear-gradient` + `background-position` is simpler)
- New animation libraries (Framer Motion is in deps but CSS is more appropriate here)
- GSAP (in deps for landing page animations, but too heavy for simple shimmer/glow)

## Open Questions

1. **Shimmer implementation: pseudo-element vs. extra div**
   - What we know: `PixelPanel` uses `relative` positioning internally, so a `::before` on `PixelPanel` would work CSS-wise, but we can't add it without modifying the shared component
   - What's unclear: Whether an extra wrapper `div` around `PixelPanel` introduces any layout/spacing issues in the grid
   - Recommendation: Use wrapper `div` approach (keeps `PixelPanel` untouched per user requirement). Test grid spacing in both landing and auctions layouts.

2. **Hover glow: CSS-only vs. JS event handlers**
   - What we know: The glow color must be dynamic per accent tone. Pure Tailwind utility classes don't support arbitrary `rgba()` with variable values.
   - What's unclear: Whether inline `style` with CSS custom properties + `:hover` pseudo-class works (inline styles don't support `:hover` directly)
   - Recommendation: Define 4 CSS classes (`.stat-glow-mint`, `.stat-glow-gold`, `.stat-glow-violet`, `.stat-glow-rose`) in `globals.css` with both idle and `:hover` states. Use static class names to avoid Tailwind purging issues.

3. **UsdcStatCard extraction strategy**
   - What we know: It's currently a private function in `PlatformStatsSection.tsx`. The auctions variant needs it too.
   - What's unclear: Whether to export from current location or move to a shared file
   - Recommendation: Move to `frontend/src/components/stats/UsdcStatCard.tsx` alongside `StatCard.tsx` for clean co-location. Import into both section components.

## Sources

### Primary (HIGH confidence)
- Project source code: `frontend/src/components/stats/StatCard.tsx`, `frontend/src/components/landing/PixelPanel.tsx`, `frontend/src/components/landing/accent.ts`, `frontend/src/app/globals.css` -- direct inspection of current implementation
- Project source code: `frontend/src/components/landing/sections/PlatformStatsSection.tsx`, `frontend/src/app/auctions/page.tsx` -- current component composition
- Tailwind CSS v4 docs -- animation utilities, `@theme` block syntax
- MDN -- `mask-composite`, `@property` browser support

### Secondary (MEDIUM confidence)
- [Tailwind CSS animation docs](https://tailwindcss.com/docs/animation) -- v4 `@theme` keyframe pattern
- [web.dev @property baseline announcement](https://web.dev/blog/at-property-baseline) -- Firefox 128 shipped `@property` July 2024
- [Let's Build UI - Animate Borders in CSS](https://www.letsbuildui.dev/articles/how-to-animate-borders-in-css/) -- `linear-gradient` + `background-position` technique
- [Tailwind CSS v4 keyframes discussion #15133](https://github.com/tailwindlabs/tailwindcss/discussions/15133) -- `@keyframes` inside vs. outside `@theme`

### Tertiary (LOW confidence)
- None -- all findings verified against project source or official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all tools already in project
- Architecture: HIGH -- clear component tree, straightforward extraction pattern
- CSS techniques (shimmer): HIGH -- `linear-gradient` + `background-position` is well-established, `mask-composite: exclude` is Baseline since 2023
- CSS techniques (glow): HIGH -- `box-shadow` + `transition` is fundamental CSS
- Pitfalls: HIGH -- based on direct inspection of project code and known CSS animation constraints

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable CSS techniques, no expiration concern)
