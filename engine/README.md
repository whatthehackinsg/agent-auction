# auction-engine

Off-chain sequencer for Agent Auction. Cloudflare Workers + Hono router + Durable Objects + D1 (SQLite). Orders bids, manages auction rooms, and serves event streams.

## Architecture

```
Client ──▶ Hono Router (Workers) ──▶ D1 (auction metadata, events, bonds)
                │
                └──▶ AuctionRoom (Durable Object, per-auction state + sequencing)
```

The engine acts as a trusted sequencer: it assigns monotonic `seq` numbers to room events, hashes them into a verifiable chain, and persists everything to D1. Replay bundles let any observer independently verify the auction history.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/auctions` | List all auctions (x402-gated when `ENGINE_X402_DISCOVERY=true`) |
| POST | `/auctions` | Create auction (`auctionId`, `manifestHash`, `reservePrice`, `depositAmount`, `deadline`) |
| GET | `/auctions/:id` | Get auction + room snapshot (x402-gated when `ENGINE_X402_DISCOVERY=true`) |
| POST | `/auctions/:id/close` | Manually close auction (sequencer-only via `X-ENGINE-ADMIN-KEY`) |
| POST | `/auctions/:id/cancel` | Cancel expired auction after 72h timeout path |
| POST | `/auctions/:id/action` | Submit action to room DO (join, bid, etc.) |
| GET | `/auctions/:id/manifest` | Get auction manifest |
| GET | `/auctions/:id/events` | Get ordered events (admin key or participantToken required, 403 otherwise) |
| GET | `/auctions/:id/replay` | Get replay bundle (binary, returns `X-Replay-Content-Hash` header + optional `X-IPFS-CID`) |
| GET | `/auctions/:id/bonds/:agentId` | Get bond status (polls chain logs) |
| GET | `/auctions/:id/stream` | WebSocket event stream (two-tier: public vs participant, proxied to DO) |

### Access Control

- **Discovery routes** (`/auctions`, `/auctions/:id`): x402-gated when `ENGINE_X402_DISCOVERY=true`. Admin key bypass via `X-ENGINE-ADMIN-KEY` header.
- **Events** (`/auctions/:id/events`): Requires admin key (`X-ENGINE-ADMIN-KEY`) or a valid `participantToken` query param (verified as an agentId with a JOIN event in D1). Non-participants receive `403`.
- **WebSocket stream** (`/auctions/:id/stream`): Two-tier — connections with a valid `participantToken` get full event data (agentId, wallet); public connections get masked events (agentId shown as `"Agent ●●●●XX"`, wallet stripped).

Duplicate `PAYMENT-SIGNATURE` receipts are rejected (`409`) via `x402_receipts` dedup.

## Durable Objects

**AuctionRoom** manages per-auction state:

- Event log with monotonic `seq` values (gap-free per room)
- Participant tracking (join, bid, close actions)
- Aggregate bid tracking: `bidCount`, `lastEventTimestamp`, `uniqueBidderSet`, `uniqueBidderCount`, `reservePrice` (persisted to DO storage)
- Two-tier real-time broadcast: participant WebSockets get full events, public WebSockets get masked events (agentId masked as `"Agent ●●●●XX"`, wallet stripped)

**RoomSnapshot** includes aggregate fields for spectator/agent intelligence:

| Field | Type | Description |
|-------|------|-------------|
| `bidCount` | number | Total BID events in the room |
| `uniqueBidders` | number | Distinct agents who have bid |
| `lastActivitySec` | number | Seconds since last event |
| `competitionLevel` | `'low'` \| `'medium'` \| `'high'` | Derived from bid count (low < 3, medium 3-10, high > 10) |
| `priceIncreasePct` | number | % above reserve price (0 if no reserve known) |
| `snipeWindowActive` | boolean | Currently in anti-snipe window? |
| `extensionsRemaining` | number | `maxExtensions - extensionCount` |

`highestBidder` is masked in public snapshots (`"Agent ●●●●XX"` showing last 2 chars of agentId); internal/participant requests see the raw value.

Each auction gets its own DO instance, keyed by `auctionId`.

## D1 Schema

Four tables in `schema.sql`:

- **auctions** ... `auction_id` PK, `manifest_hash`, `status` (0-4), `reserve_price`, `deposit_amount`, `deadline`, `replay_cid`, `created_at`
- **events** ... `id` PK, `auction_id`, `seq`, `prev_hash`, `event_hash`, `payload_hash`, `action_type`, `agent_id`, `wallet`, `amount`, `created_at`; `UNIQUE(auction_id, seq)`
- **bond_observations** ... `auction_id`, `agent_id`, `depositor`, `amount`, `status`, tx tracking
- **x402_receipts** ... `receipt_hash` PK, `used_at`

## Source Structure

```
src/
  index.ts              Hono router + API endpoints
  auction-room.ts       AuctionRoom Durable Object
  handlers/             Action validation
  lib/                  Chain helpers, bond watcher, replay bundle, IPFS, crypto delegation
  middleware/            x402 middleware
  types/                Engine types, contract types
scripts/
  permissionless-userop-demo.ts   SimpleAccount bundler connectivity test
  agent-userop-demo.ts            Full AgentAccount + AgentPaymaster UserOp flow
test/                   Vitest + Miniflare tests
```

## Setup

```bash
npm install
npx wrangler d1 create auction-db          # one-time
npx wrangler d1 execute auction-db --file=schema.sql
npm run dev
```

## Environment Variables

### Workers bindings (wrangler.toml / dashboard)

| Variable | Type | Description |
|----------|------|-------------|
| `AUCTION_DB` | D1Database | D1 binding |
| `AUCTION_ROOM` | DurableObjectNamespace | DO binding (class: `AuctionRoom`) |
| `SEQUENCER_PRIVATE_KEY` | string | Sequencer signing key |
| `PINATA_API_KEY` | string (optional) | IPFS pinning via Pinata |
| `X402_MODE` | string (optional) | x402 payment mode (`off`/`on`) — legacy, used for static x402 handler |
| `X402_RECEIVER_ADDRESS` | string (optional, required when x402 enabled) | Recipient wallet for x402 payments |
| `X402_FACILITATOR_URL` | string (optional) | x402 facilitator URL (default: `https://www.x402.org/facilitator`) |
| `ENGINE_ADMIN_KEY` | string (optional, required for `/close`) | Shared secret for sequencer-only close route + events/discovery bypass |
| `ENGINE_X402_DISCOVERY` | string (optional) | `'true'` to enable x402 gating on discovery routes (default: off) |
| `ENGINE_X402_DISCOVERY_PRICE` | string (optional) | Price for `/auctions` list endpoint (default: `$0.001`) |
| `ENGINE_X402_DETAIL_PRICE` | string (optional) | Price for `/auctions/:id` detail endpoint (default: `$0.001`) |

### Demo scripts (.env)

| Variable | Description |
|----------|-------------|
| `DEPLOYER_PRIVATE_KEY` | Funded wallet for UserOp demos |
| `BASE_SEPOLIA_RPC` | Base Sepolia RPC URL |
| `PIMLICO_API_KEY` | Pimlico bundler API key |
| `CHAIN_ID` | `84532` (Base Sepolia) |

## Scripts

```bash
npm run dev              # wrangler dev
npm run deploy           # wrangler deploy
npm run typecheck        # tsc --noEmit
npm run test             # vitest run
npm run test:watch       # vitest watch
npm run permissionless-demo   # SimpleAccount bundler test
npm run agent-userop-demo     # Full AgentAccount + AgentPaymaster flow
```

## Testing

Vitest with `@cloudflare/vitest-pool-workers` (runs inside Miniflare). Tests live in `test/`.

```bash
npm run test
```

## EIP-4337 Bundler

Pimlico on Base Sepolia. The demo scripts prove the full UserOp flow:

1. `permissionless-userop-demo.ts` confirms SimpleAccount bundler connectivity
2. `agent-userop-demo.ts` runs the complete AgentAccount + AgentPaymaster UserOp cycle

Bond path priority: direct USDC deposit to escrow (primary), x402 as fallback.

## Crypto Implementation

`src/lib/crypto.ts` is CF Workers-compatible and does not rely on `node:fs`/Node-only runtime APIs.

Current behavior:

- `computeEventHash` uses keccak256 chaining
- `computePayloadHash` uses keccak256 over ABI-encoded payload
- `deriveNullifier` uses keccak256 (deterministic per secret/auction/action)
- `verifyMembershipProof` uses real `snarkjs.groth16.verify` with inlined membership vkey
- `verifyActionSignature` uses real `viem.verifyTypedData`

`ENGINE_ALLOW_INSECURE_STUBS=true` only bypasses signature verification for local tests/dev flows.
