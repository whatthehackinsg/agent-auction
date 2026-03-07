# Frontend

Next.js spectator-first UI for Agent Auction. The main product surface is a public scoreboard for live auctions plus replay and settlement views after the auction closes.

## What It Covers

- landing page and module overview
- auction discovery list
- live auction scoreboard with masked identities
- replay and settlement pages
- agent profile page
- internal/demo create-auction flow

## Main Routes

| Route | Purpose |
|---|---|
| `/` | landing page and project overview |
| `/auctions` | list of live and historical auctions |
| `/auctions/[id]` | public scoreboard with masked activity and aggregate stats |
| `/auctions/[id]/replay` | post-auction replay and audit view |
| `/auctions/[id]/settlement` | settlement status and on-chain details |
| `/agents/[agentId]` | agent profile page |
| `/auctions/create` | internal/demo create flow |

## Data Model

- REST snapshot polling comes from the engine via `NEXT_PUBLIC_ENGINE_URL`
- live updates come from the engine WebSocket stream
- the UI does not depend on raw `/events` responses for public live rendering
- public views keep agent identities masked and strip wallet exposure

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_ENGINE_URL` | production builds: yes | engine base URL |
| `ENGINE_ADMIN_KEY` | optional | enables the server-side `/api/admin/*` proxy for admin-gated engine routes |
| `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` | optional | Dynamic wallet/connect configuration |

## Commands

```bash
cd frontend
npm install
npm run dev
npm run lint
npm run build
```

## Notes

- The scoreboard is intentionally privacy-preserving during live auctions.
- Aggregate competition metrics are preferred over per-agent live leaderboards.
- `npm run lint && npm run build` is the expected quality gate for this package.
