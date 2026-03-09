# auction-engine

Cloudflare Worker auction engine for Agent Auction. It sequences actions, maintains per-auction room state in Durable Objects, persists history in D1, exposes replay bundles, and enforces the current identity/privacy/proof policy.

## What This Module Does

- assigns monotonic, gap-free `seq` numbers per auction room
- stores append-only auction history in D1
- serves public and participant-specific event views
- verifies JOIN and BID proofs with a Worker-safe Groth16 backend
- verifies bond deposits from transaction receipts and records them on-chain
- serves replay bundles for CRE settlement and post-auction audit

## Runtime Shape

```text
client
  -> Hono router
     -> D1 (auctions, events, bond_observations, x402_receipts, x402_entitlements)
     -> AuctionRoom Durable Object (ordering, snapshots, broadcast)
```

## Key Routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | health check |
| `GET` | `/auctions` | discovery list; x402-gated when discovery monetization is enabled |
| `GET` | `/stats` | aggregate platform stats |
| `POST` | `/auctions` | create auction |
| `GET` | `/auctions/:id` | auction details + room snapshot |
| `POST` | `/auctions/:id/action` | JOIN / BID / REVEAL / other room actions |
| `POST` | `/auctions/:id/close` | close auction with admin key |
| `POST` | `/auctions/:id/cancel` | timeout/cancel path |
| `POST` | `/admin/auctions/:id/retry-settlement` | retry settlement admin path |
| `GET` | `/auctions/:id/events` | ordered event log, gated by admin key or participant token |
| `GET` | `/auctions/:id/replay` | replay bundle bytes + content hash |
| `POST` | `/auctions/:id/bonds` | verify and record bond from tx receipt |
| `GET` | `/auctions/:id/bonds/:agentId` | bond observation status |
| `POST` | `/verify-identity` | ERC-8004 owner + privacy-root readiness check |
| `GET` | `/auctions/:id/stream` | two-tier WebSocket stream |

## Privacy and Access Control

- Discovery routes can be x402-gated when `ENGINE_X402_DISCOVERY=true`; the current deployed worker has this enabled.
- When x402 discovery is on, paid reads grant permanent entitlements keyed by `payer wallet + resource scope`.
- Supported scopes today are:
  - `discovery` for `GET /auctions`
  - `auction:<auctionId>` for `GET /auctions/:id`
- Repeat reads can present a short-lived signed access proof instead of paying again; the engine verifies that signature and checks D1 entitlements before allowing access.
- `X-ENGINE-ADMIN-KEY` bypasses discovery x402 and unlocks admin-only routes.
- `/auctions/:id/events` requires either admin access or a valid `participantToken`.
- Public WebSocket clients see masked identities.
- Participant views expose privacy-preserving nullifier-based data, not raw competitor identity.

## Bond Handling

The live bond flow is:

```text
USDC transfer to AuctionEscrow
  -> POST /auctions/:id/bonds with txHash
  -> engine verifies the Transfer log in the tx receipt
  -> AuctionEscrow.recordBond(...)
  -> D1 bond_observations marked CONFIRMED
```

`GET /auctions/:id/bonds/:agentId` reads the D1 observation state and returns `NONE`, `PENDING`, `CONFIRMED`, or `TIMEOUT`.

## ZK and Signature Verification

- proof enforcement is on by default unless `ENGINE_REQUIRE_PROOFS=false`
- JOIN and BID verification run through `src/lib/crypto.ts`
- the Worker runtime now uses `src/lib/snarkjs-runtime.ts`, which loads precompiled `.wasm` via Wrangler's `CompiledWasm` rule
- business checks stay unchanged: registry-root matching, capability commitment matching, nullifier handling, and bid-range semantics
- `ENGINE_ALLOW_INSECURE_STUBS=true` is still test-only and only relaxes signature behavior for local fixtures

## Setup

```bash
cd engine
npm install
npx wrangler d1 create auction-engine-db
npx wrangler d1 execute auction-engine-db --file=schema.sql
npx wrangler d1 execute auction-engine-db --remote --file=migrations/0005_add_x402_entitlements.sql
npm run dev
```

`wrangler.toml` already includes:

- `nodejs_compat`
- `CompiledWasm` support for `**/*.wasm`
- D1 binding `AUCTION_DB`
- Durable Object binding `AUCTION_ROOM`

## Important Environment / Bindings

| Name | Purpose |
|---|---|
| `AUCTION_DB` | D1 database binding |
| `AUCTION_ROOM` | Durable Object namespace |
| `SEQUENCER_PRIVATE_KEY` | sequencer signing key |
| `ENGINE_ADMIN_KEY` | admin bypass / close / retry access |
| `ENGINE_REQUIRE_PROOFS` | force mandatory ZK proof verification |
| `X402_MODE` | enable or disable the x402 runtime |
| `ENGINE_X402_DISCOVERY` | enable x402 on discovery endpoints |
| `ENGINE_X402_DISCOVERY_PRICE` | x402 price for `GET /auctions` |
| `ENGINE_X402_DETAIL_PRICE` | x402 price for `GET /auctions/:id` |
| `X402_RECEIVER_ADDRESS` | x402 payment receiver |
| `ENGINE_X402_ACCESS_MAX_AGE_SEC` | max age for signed x402 access proofs, default 300 seconds |
| `PINATA_API_KEY` | optional replay pinning |
| `BASE_SEPOLIA_RPC`, `PIMLICO_API_KEY` | demo script dependencies |

## Commands

```bash
npm run dev
npm run deploy
npm run typecheck
npm run test
npm run test:watch
npm run permissionless-demo
npm run agent-userop-demo
```

## Notes

- The engine exposes spectator-friendly aggregate fields like `bidCount`, `uniqueBidders`, `competitionLevel`, and `priceIncreasePct`.
- The x402 entitlement layer is read-only auth only; it does not change ERC-8004 ownership, ZK proof verification, room sequencing, or action semantics.
- The deployed Base Sepolia engine now points at the v4 settlement stack:
  - `AuctionRegistry`: `0xAe416531962709cb26886851888aEc80ef29bB45`
  - `AuctionEscrow`: `0x5a1af9fDD97162c184496519E40afCf864061329`
  - `AgentPrivacyRegistry`: `0x5b4f09A5D5188dCe1b1ba0caeDBcEb52CaCD1902`
- `GET /auctions/:id` now reconciles on-chain `SETTLED` state after CRE settlement so room snapshots do not stay stuck at `CLOSED`.
- A pre-existing `bond-watcher.test.ts` failure is still tracked as separate tech debt; the live engine bond path uses receipt verification, not the old log-polling helper.
- Replay bundles are part of the CRE settlement pipeline and the post-auction audit flow.
