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
| GET | `/auctions` | List all auctions (D1 query) |
| POST | `/auctions` | Create auction (`auctionId`, `manifestHash`, `reservePrice`, `depositAmount`, `deadline`) |
| GET | `/auctions/:id` | Get auction + room snapshot |
| POST | `/auctions/:id/close` | Manually close auction (sequencer-only via `X-ENGINE-ADMIN-KEY`) |
| POST | `/auctions/:id/cancel` | Cancel expired auction after 72h timeout path |
| POST | `/auctions/:id/action` | Submit action to room DO (join, bid, etc.) |
| GET | `/auctions/:id/manifest` | Get auction manifest (x402-gated, 0.001 USDC) |
| GET | `/auctions/:id/events` | Get ordered events (x402-gated, 0.0001 USDC) |
| GET | `/auctions/:id/replay` | Get replay bundle (binary, returns `X-Replay-Content-Hash` header + optional `X-IPFS-CID`) |
| GET | `/auctions/:id/bonds/:agentId` | Get bond status (polls chain logs) |
| GET | `/auctions/:id/stream` | SSE/WebSocket event stream (proxied to DO) |

Manifest and event endpoints are gated with x402 micropayments.

## Durable Objects

**AuctionRoom** manages per-auction state:

- Event log with monotonic `seq` values (gap-free per room)
- Participant tracking (join, bid, close actions)
- Real-time broadcast to connected SSE/WebSocket clients

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
| `X402_MODE` | string (optional) | x402 payment mode |
| `ENGINE_ADMIN_KEY` | string (optional, required for `/close`) | Shared secret for sequencer-only close route |

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

Bond path priority: EIP-4337 direct transfer to escrow (primary), x402 as fallback.

## Crypto Implementation

`src/lib/crypto.ts` is CF Workers-compatible and does not rely on `node:fs`/Node-only runtime APIs.

Current behavior:

- `computeEventHash` uses keccak256 chaining
- `computePayloadHash` uses keccak256 over ABI-encoded payload
- `deriveNullifier` uses keccak256 (deterministic per secret/auction/action)
- `verifyMembershipProof` uses real `snarkjs.groth16.verify` with inlined membership vkey
- `verifyActionSignature` uses real `viem.verifyTypedData`

`ENGINE_ALLOW_INSECURE_STUBS=true` only bypasses signature verification for local tests/dev flows.
