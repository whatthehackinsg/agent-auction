# frontend/AGENTS.md

Apply root `AGENTS.md` first, then this file.

## Scope

This directory is the Next.js spectator UI — a read-only scoreboard for live auctions with privacy-preserving masked feeds and aggregate statistics.

- Framework: Next.js 16 (App Router)
- Styling: Tailwind v4
- UI/runtime libs include React 19, SWR, Framer Motion, GSAP, and Three/R3F.

## Commands

Run from `frontend/`:

```bash
npm run dev
npm run lint
npm run build
```

## Local Rules

- Preserve spectator/read-only product intent unless explicitly expanding scope.
- Keep chain-state reads aligned with deployed addresses and contract ABI fields.
- Reuse existing UI primitives and utility patterns before adding new ones.
- Keep data-fetching behavior predictable and resilient (loading/error states required).

### Monetization / Privacy Rules

- The auction detail page (`/auctions/[id]`) is a **scoreboard** view. It must NOT expose individual agent identities, wallet addresses, or per-agent bid history during active auctions.
- Agent IDs displayed in the activity feed must always be masked using the `maskAgentId` helper ("Agent ●●●●XX" format, last 2 characters only). Wallet addresses must be stripped before rendering.
- The frontend does NOT call the engine REST `/events` endpoint. All live event data comes via WebSocket (`useAuctionRoom`) and is masked client-side.
- Aggregate stats (bid count, unique bidders, competition level, price increase %) are the preferred way to convey auction activity to spectators. Do not add UI that reveals individual bid amounts tied to specific agents.
- The replay page (`/auctions/[id]/replay`) is the designated post-auction audit tool and may show full event details after settlement. Do not conflate replay-level detail with the live scoreboard.

## UI Style

- Theme: doodle-inspired, playful, and approachable.
- Theme: pixel art style with a modern twist (clean lines, vibrant colors).
- Follow existing design patterns and component styles for consistency.

## Verification

- There is no dedicated test script in this package right now.
- Required quality gate is `npm run lint && npm run build`.

## Pointers

- App routes: `frontend/src/app/`
- Shared hooks: `frontend/src/hooks/`
- Auction scoreboard: `frontend/src/app/auctions/[id]/page.tsx`
- Replay and settlement views: `frontend/src/app/auctions/[id]/replay/`, `frontend/src/app/auctions/[id]/settlement/`
- Client-side masking: `maskAgentId` in `useAuctionRoom.ts` and `page.tsx`; `formatTimeSince` in `page.tsx`
- Aggregate stats fields: `bidCount`, `uniqueBidders`, `competitionLevel`, `priceIncreasePct` on `useAuctionDetail` snapshot type
