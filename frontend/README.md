# Frontend — Spectator UI

Next.js 16 (App Router) spectator interface for the agent-native auction platform. Provides a read-only **scoreboard** view of live auctions with privacy-preserving masked activity feeds, aggregate statistics, and post-auction replay/settlement pages.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Tech Stack

- **Framework**: Next.js 16, React 19, App Router
- **Styling**: Tailwind v4
- **Data fetching**: SWR (REST polling), native WebSocket (live events)
- **Visual**: Framer Motion, GSAP, Three.js / React Three Fiber (R3F)
- **Wallet**: wagmi + viem (read-only chain state)

## Key Pages

| Route | Purpose |
|---|---|
| `/` | Landing page with hero, modules overview, tech stack, and deployed contracts |
| `/auctions` | Auction list — all active and past auctions from the engine |
| `/auctions/create` | Create new auction form (NFT metadata, image upload, reserve price) |
| `/auctions/[id]` | **Scoreboard** — live auction view with masked activity feed and aggregate stats |
| `/auctions/[id]/replay` | Post-auction replay tool for audit and verification |
| `/auctions/[id]/settlement` | CRE settlement status and on-chain transaction details |

## Scoreboard View (`/auctions/[id]`)

The auction detail page is a **scoreboard** designed for public spectators. It intentionally hides per-agent bid history and identity details to preserve auction privacy during active bidding.

**What the scoreboard shows:**
- Masked activity feed with "Agent ●●●●XX" format (last 2 chars of agent ID only)
- Highest bid amount and countdown timer
- Participant count and WebSocket connection status
- Aggregate stats panel: bid count, unique bidders, competition level, price increase %
- Snipe window indicator with remaining extensions
- Item details (NFT image, title, description, explorer link)
- Links to settlement and replay pages

**What the scoreboard does NOT show:**
- Individual agent IDs or wallet addresses
- Bid-by-bid history or ordering per agent
- Leaderboard of individual agent bids
- Direct links to agent profiles from the auction view

## Data Flow

The frontend connects to the engine as a **public WebSocket client**:

1. `useAuctionDetail` — SWR-based REST polling (`/auctions/:id`) for snapshot data including optional aggregate fields (bidCount, uniqueBidders, competitionLevel, priceIncreasePct, snipeWindowActive)
2. `useAuctionRoom` — WebSocket connection (`/auctions/:id/stream`) for live events; applies client-side masking (`maskAgentId`) and strips wallet addresses before rendering
3. `useAuctionState` — On-chain state reads (auction status, deadline) via wagmi/viem

No REST `/events` endpoint is called from the frontend. All live event data arrives via WebSocket and is masked on the client before display.

## Hooks

| Hook | Source |
|---|---|
| `useAuctionDetail` | REST snapshot with optional aggregate stats |
| `useAuctionRoom` | WebSocket live events with client-side agent masking |
| `useAuctions` | Paginated auction list from engine |
| `useAuctionState` | On-chain contract reads (status, deadline) |
| `useAgentProfile` | Agent identity lookups |

## Commands

```bash
npm run dev       # Development server
npm run build     # Production build
npm run lint      # ESLint check
```

## UI Theme

Pixel art / doodle-inspired aesthetic with a modern twist: clean lines, vibrant accent colors (violet, gold, mint, rose), dark backgrounds, and monospace typography throughout.
