---
phase: 6
title: Refine Stats Card UI
created: 2026-03-04
---

# Phase 6 Context: Refine Stats Card UI

## Goal

Polish the stat card visuals so they stand out from other cards (PixelCard, PixelPanel) and tailor the auctions page to show only 3 auction-relevant stats.

## Decisions

### 1. Visual Direction — Keep Pixel Style + Add Effects

Keep the existing `PixelPanel` base component. Do NOT redesign or replace it. Add visual effects on top:

- **Subtle idle shimmer**: A faint traveling highlight across the card border when idle. CSS animation (not JS). "Always alive" feel — stats feel like a live HUD, not static boxes.
- **Border glow on hover**: Accent-colored `box-shadow` intensifies on hover. Neon feel matching each card's accent tone (mint/gold/violet/rose). Smooth transition in/out.
- No loading skeleton (keep current 0→count-up behavior).
- No pulse on value change (existing count-up animation is sufficient).

### 2. Auctions Page — 3 Auction-Specific Stats

The auctions page (`/auctions`) shows only 3 stats (not the landing page's 6):

| Stat | Accent | headerLabel |
|------|--------|-------------|
| Total Auctions | mint | auctions.total |
| Active Auctions | rose | auctions.active |
| USDC Bonded | gold | bonds.total |

Layout: single row, 3 columns on desktop, stack or 1-col on mobile.

### 3. Landing Page — Unchanged

Landing page keeps all 6 stat cards with current layout (2-col mobile / 3-col desktop).

## Code Context

### Files to Modify

- `frontend/src/components/stats/StatCard.tsx` — Add shimmer + hover glow CSS
- `frontend/src/components/landing/sections/PlatformStatsSection.tsx` — Extract auctions-page variant (3 cards)
- `frontend/src/components/landing/accent.ts` — May need glow color values per accent tone
- `frontend/src/app/auctions/page.tsx` — Switch to 3-card variant

### Existing Patterns

- `PixelPanel` already accepts `accent` prop with 4 tone styles in `accent.ts`
- Each tone has `panel`, `border`, `label`, `value`, `dim` colors — glow colors should derive from these
- `useCountUp` hook handles number animation — no changes needed
- `UsdcStatCard` sub-component in `PlatformStatsSection` handles BigInt conversion

### Design Constraints

- Shimmer must be pure CSS (keyframe animation on pseudo-element or border gradient)
- Glow must use accent tone colors from `accentStyles` — not hardcoded
- Effects must not cause layout shift or jank on mobile
- Stat cards should still use `PixelPanel` as their base — effects are additive

## Deferred Ideas

None.
