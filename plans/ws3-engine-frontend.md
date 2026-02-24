# WS-3: Auction Engine + API + Frontend + Demo

**Owner:** AI Engineer 2
**Directories owned:** `engine/`, `frontend/`, `agent-client/`
**Source of truth:** `docs/full_contract_arch(amended).md` Sections 7, 8, 13

---

## Mission

Build the off-chain auction engine (Cloudflare DO sequencer), HTTP/MCP API, Next.js frontend, and agent demo client. You are the integration hub — you consume libraries from WS-1 (crypto) and contract addresses from WS-2 (on-chain), and wire them into a working system that judges see in the demo.

---

## What You Deliver

| Artifact | Consumer | Deadline | Format |
|----------|----------|----------|--------|
| DO sequencer (running) | All (auction engine) | Day 4 | Cloudflare Worker |
| HTTP API endpoints | Agent client, frontend | Day 5 | ~~Express.js~~ Hono |
| Replay bundle endpoint | WS-2 (CRE fetches) | Day 6 | `GET /replay/{auctionId}` |
| Next.js frontend | Demo judges | Day 8 | Deployed URL |
| Agent demo client | Demo video | Day 8 | TS script |
| Demo video | Submission | Day 10 | 3-5 min video |

---

## What You Receive

| Artifact | From | Expected | Purpose |
|----------|------|----------|---------|
| vkey JSON files | WS-1 | Day 2 | Bundle into DO for snarkjs verify |
| `poseidon-chain.ts` | WS-1 | Day 4 | Replace keccak256 stub with real Poseidon |
| `snarkjs-verify.ts` | WS-1 | Day 4 | Replace `return true` stub with real ZK verify |
| `eip712-typed-data.ts` | WS-1 | Day 4 | Verify agent signatures in DO |
| `nullifier.ts` | WS-1 | Day 4 | Check nullifiers in DO |
| `replay-bundle.ts` | WS-1 | Day 6 | Serialize events at auction close |
| `proof-generator.ts` | WS-1 | Day 6 | Agent client generates ZK proofs |
| Contract ABIs | WS-2 | Day 2 | Read contract state from engine |
| `deployments/base-sepolia.json` | WS-2 | Day 4 | Configure all contract addresses |
| `AuctionSettlementPacket` TS type | WS-2 | Day 4 | Build packet in DO at close |
| Bundler endpoint | WS-2 | Day 4 | Agent client sends UserOps |
| CRE workflow config | WS-2 | Day 6 | For escrow configuration reference |

---

## Day-by-Day Tasks

### Day 1-2: DO Sequencer Skeleton (No Dependencies)

```
Priority: Build the shell now, plug in real crypto + contracts on Day 4
Use stubs: ZK verify returns true, Poseidon replaced by keccak256, contract calls mocked
```

**Cloudflare Worker + Durable Object setup:**
- [x] `npm create cloudflare -- engine/worker` (or `wrangler init`)
- [x] Configure `wrangler.toml`:
  ```toml
  name = "auction-engine"
  [durable_objects]
  bindings = [{ name = "AUCTION_ROOM", class_name = "AuctionRoom" }]
  [[migrations]]
  tag = "v1"
  new_classes = ["AuctionRoom"]
  ```

**DO `AuctionRoom` class skeleton:**
- [x] `constructor(state, env)` — load `seqCounter` and `chainHead` from `this.state.storage`
- [x] `fetch(request)` — route: `POST /action` (join/bid/deliver), `GET /events`, WebSocket upgrade
- [x] `webSocketMessage(ws, message)` — handle incoming agent messages
- [x] `webSocketClose(ws)` — cleanup subscriber
- [x] State persisted in `this.state.storage` _(deviation: uses D1 instead of Postgres for persistence)_:
  - `chainHead:{auctionId}` — current Poseidon chain head (bytes32 hex)
  - `event:{auctionId}:{seq}` — serialized event data
  - `nullifier:{hash}` — boolean spent flag
  - `nonce:{auctionId}:{agentId}:{actionType}` — last seen nonce (number)
  - `seqCounter:{auctionId}` — current sequence number

**Core sequencer logic (with stubs):**
- [x] _(stubs implemented, now replaced with @agent-auction/crypto real implementations)_

**Implement `ingestAction()` in DO:**
- [x] _(engine/src/auction-room.ts, 539 lines)_

**Implement action handlers:**
- [x] `handleJoin(request)` — validate signature, check nullifier, check nonce, verify ZK proof (stub), ingest
- [x] `handleBid(request)` — validate signature, check nonce, ingest
- [x] `handleDeliver(request)` — validate signature, check nonce, ingest

**Implement nonce tracking:**
- [x] _(in engine/src/handlers/actions.ts)_

**Implement nullifier checking:**
- [x] _(in engine/src/handlers/actions.ts)_

**WebSocket broadcast:**
- [x] On WebSocket upgrade: add to subscribers set
- [x] On event ingested: broadcast to all subscribers
- [x] On close: remove from subscribers
- [x] Use hibernatable WebSockets for cost efficiency

**~~Postgres~~ D1 setup:**
- [x] _(deviation: uses Cloudflare D1 instead of Postgres — native to CF Workers)_

**~~Express.js~~ Hono API server:**
- [x] _(deviation: uses Hono, native to CF Workers, instead of Express.js)_
- [x] `POST /room/:auctionId/action` — forward to DO
- [x] `GET /room/:auctionId/events?from=:seq` — query events
- [x] `GET /auctions` — list auctions
- [x] `GET /auctions/:id/manifest` — return manifest JSON
- [x] `WS /room/:auctionId/stream` — proxy to DO WebSocket

**Deliveries:**
- [x] Push DO code to `engine/src/` _(deviation: flat structure, not engine/worker/)_
- [ ] Tag: `ws3/engine-skeleton` _(no git tags used)_

### Day 3-4: Integrate Crypto Libs + Contract Addresses

```
Priority: Replace all stubs with real implementations
```

**Integrate WS-1 crypto libs (arriving Day 3-4):**
- [x] Replace `computeEventHash` stub → import from `@agent-auction/crypto` _(via engine/src/lib/crypto.ts wrapper)_
- [x] ~~Replace `verifyProof` stub~~ Kept as fail-closed stub _(CF Workers can't load vkeys via node:fs)_
- [x] ~~Replace `verifySignature` stub~~ Kept as fail-closed stub _(API mismatch — engine passes hash+sig+signer, package expects structured EIP-712 data)_
- [x] Import `nullifier.ts` for derivation verification _(via @agent-auction/crypto wrapper)_
- [ ] Bundle vkey JSONs into DO _(not applicable — ZK verify kept as stub)_

**Integrate WS-2 contract addresses (arriving Day 4):**
- [x] Load `deployments/base-sepolia.json` into engine config _(engine/src/lib/addresses.ts)_
- [x] Set up viem client with Base Sepolia RPC _(engine/src/lib/chain-client.ts)_
- [ ] Implement `readBondStatus(auctionId, agentId)`: read `AuctionEscrow.bondRecords()` _(not evidenced — bonds managed via admin recordBond)_
- [ ] Implement `readRuntimeSigner(agentAccountAddress)`: read `AgentAccount.runtimeSigner()` _(sig verify uses EIP-712 stub)_

**Implement inclusion receipt signing:**
- [x] Configure sequencer private key in DO environment _(engine/src/lib/inclusion-receipt.ts, 55 lines)_
- [x] Sign receipt
- [x] Return to agent with sequencer signature

**Start frontend:**
- [x] Auction list page: `GET /auctions` → render cards _(frontend/src/app/auctions/page.tsx)_
- [x] Auction room page: connect WebSocket → render live event feed _(frontend/src/app/auctions/[id]/page.tsx)_
- [x] Use existing landing page components

**Deliveries:**
- [x] Push updated DO with real crypto
- [ ] Tag: `ws3/crypto-integrated` _(no git tags used)_

### Day 5-6: Auction Close Flow + x402 + Frontend

**Auction close flow (DO sequencer → on-chain):**
- [x] At auction deadline or manual close: _(engine/src/lib/settlement.ts, 43 lines)_
  1. [x] Stop accepting new bids
  2. [x] Read all events for this auctionId
  3. [x] Serialize to ReplayBundleV1 _(engine/src/lib/replay-bundle.ts — delegates to @agent-auction/crypto)_
  4. [x] Pin to IPFS _(engine/src/lib/ipfs.ts, 91 lines)_
  5. [x] Build `AuctionSettlementPacket`
  6. [x] Sign packet with sequencer key
  7. [x] Call `AuctionRegistry.recordResult(packet, sequencerSig)` via viem
  8. [x] Log: `AuctionEnded` event emitted → CRE takes over

**Replay bundle endpoint (for CRE to fetch):**
- [x] `GET /replay/:auctionId` — return raw ReplayBundleV1 bytes
- [x] Must be byte-for-byte deterministic (no session personalization)
- [x] Cache in object storage _(IPFS + R2)_

**x402 middleware:**
- [x] ~~Install `@x402/express`~~ Implement `@x402/hono` equivalent _(engine/src/middleware/x402.ts, 67 lines)_
- [x] Gate endpoints with x402 pricing
- [x] Implement dedup via Workers KV

**Bond observation (for PENDING_BOND flow):**
- [x] Watch USDC `Transfer` events to escrow address _(engine/src/lib/bond-watcher.ts, 248 lines)_
- [x] Match to pending join requests
- [x] Return `PENDING_BOND` status with `retryAfter` if bond not yet observed
- [x] Timeout — reject join if bond not observed

**Frontend — live auction view:**
- [ ] Bid timeline (scrollable event list with timestamps) _(beads nlk/b5d open — WIP)_
- [ ] Current highest bid display _(WIP)_
- [ ] Agent list / leaderboard _(WIP)_
- [ ] Countdown timer to auction deadline _(WIP)_
- [ ] Auction state badge (OPEN / CLOSED / SETTLED / CANCELLED) _(WIP)_

**Deliveries:**
- [x] Push replay endpoint
- [x] Push x402 middleware
- [ ] Push frontend pages _(scaffolded, functionality WIP)_
- [ ] Tag: `ws3/auction-flow-complete` _(no git tags used)_

### Day 7-8: Agent Demo Client + E2E

**Agent demo client** (`agent-client/src/`):

Build a script that simulates a full agent lifecycle:

- [x] _(agent-client/src/index.ts — 160 lines, full lifecycle script)_

- [x] `wallet.ts`: EIP-4337 wallet deployment + UserOp construction _(155 lines)_
- [x] `identity.ts`: ERC-8004 registration + privacy sidecar commitment _(54 lines)_
- [x] `auction.ts`: join/bid/deliver via HTTP to DO sequencer _(215 lines)_

**Run demo with 3+ agents:**
- [ ] Agent A: bids 100 USDC
- [ ] Agent B: bids 150 USDC
- [ ] Agent C: bids 120 USDC
- [ ] Expected: Agent B wins, settlement via CRE, Agent A + C get refunds

**Frontend — settlement verification:**
- [x] "Verify Settlement" button → link to Basescan tx explorer _(frontend/src/app/auctions/[id]/settlement/)_
- [ ] Show: CRE workflow triggered, onReport called, SETTLED state _(WIP)_
- [ ] ZK proof status indicators _(ZK stubs mean no real proof status)_

**Frontend — replay/audit mode:**
- [x] Page exists _(frontend/src/app/auctions/[id]/replay/)_
- [ ] Show Poseidon chain verification (event by event) _(WIP)_
- [ ] Highlight: computed `finalLogHash` matches on-chain _(WIP)_

### Day 9-10: Demo Video + Polish

- [ ] Record demo video (3-5 min):
  1. Show agent onboarding (wallet deploy, identity register)
  2. Show auction creation
  3. Show live bidding (3 agents, real-time UI)
  4. Show auction close → CRE settlement trigger
  5. Show settlement verification on Basescan
  6. Show ZK proof verification
  7. Show refund claims
- [ ] Polish UI: animations, loading states, error handling
- [x] Write engine section of README
- [ ] Final integration test

---

## Technical References

| Item | Source |
|------|--------|
| Cloudflare DO docs | https://developers.cloudflare.com/durable-objects/ |
| Hibernatable WebSockets | https://developers.cloudflare.com/durable-objects/best-practices/websockets/ |
| Wrangler CLI | https://developers.cloudflare.com/workers/wrangler/ |
| @x402/express | https://docs.cdp.coinbase.com/x402/welcome |
| permissionless.js (EIP-4337) | https://docs.pimlico.io/permissionless |
| viem | https://viem.sh/ |
| Pinata (IPFS) | https://www.pinata.cloud/ |

---

## Stub Pattern (Days 1-3)

Until WS-1 and WS-2 deliver their artifacts, use these stubs:

```typescript
// stubs/crypto.ts — ✅ REPLACED with @agent-auction/crypto wrappers (engine/src/lib/crypto.ts)
// computeEventHash, computePayloadHash, deriveNullifier now delegate to real Poseidon

// stubs kept (CF Workers incompatible):
// verifyMembershipProof — needs node:fs for vkey loading → fail-closed stub
// verifyEIP712Signature — API mismatch → fail-closed stub

// stubs/contracts.ts — partially replaced with engine/src/lib/chain-client.ts + addresses.ts
```

---

## If Behind — What to Cut

1. **Skip x402 middleware** — make all endpoints free for demo _(implemented but can be disabled)_
2. **Skip IPFS pinning** — serve replay bundle from API only (CRE still fetches from URL) _(implemented)_
3. **Simplify frontend** — single page with event log + "Verify" button (skip leaderboard, animations) _(current state — can proceed with minimal UI)_
4. **Skip bond observation** — assume bonds are always recorded before join (manual recordBond) _(implemented)_
5. **Use 1 agent** in demo instead of 3 — simpler but less impressive
6. **Skip replay/audit mode** — live view only _(page scaffolded)_
