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
| HTTP API endpoints | Agent client, frontend | Day 5 | Express.js / Hono |
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
- [ ] `npm create cloudflare -- engine/worker` (or `wrangler init`)
- [ ] Configure `wrangler.toml`:
  ```toml
  name = "auction-engine"
  [durable_objects]
  bindings = [{ name = "AUCTION_ROOM", class_name = "AuctionRoom" }]
  [[migrations]]
  tag = "v1"
  new_classes = ["AuctionRoom"]
  ```

**DO `AuctionRoom` class skeleton:**
- [ ] `constructor(state, env)` — load `seqCounter` and `chainHead` from `this.state.storage`
- [ ] `fetch(request)` — route: `POST /action` (join/bid/deliver), `GET /events`, WebSocket upgrade
- [ ] `webSocketMessage(ws, message)` — handle incoming agent messages
- [ ] `webSocketClose(ws)` — cleanup subscriber
- [ ] State persisted in `this.state.storage` (NOT Workers KV):
  - `chainHead:{auctionId}` — current Poseidon chain head (bytes32 hex)
  - `event:{auctionId}:{seq}` — serialized event data
  - `nullifier:{hash}` — boolean spent flag
  - `nonce:{auctionId}:{agentId}:{actionType}` — last seen nonce (number)
  - `seqCounter:{auctionId}` — current sequence number

**Core sequencer logic (with stubs):**
```typescript
// STUB — replace with WS-1 poseidon-chain.ts on Day 4
function computeEventHash(seq: bigint, prevHash: Uint8Array, payloadHash: Uint8Array): Uint8Array {
  return keccak256(concat([toBytes(seq), prevHash, payloadHash]));
}

// STUB — replace with WS-1 snarkjs-verify.ts on Day 4
async function verifyProof(proof: any, signals: any): Promise<boolean> {
  return true;
}

// STUB — replace with WS-1 eip712-typed-data.ts on Day 4
function verifySignature(typedDataHash: Uint8Array, sig: Uint8Array, signer: string): boolean {
  return true;
}
```

**Implement `ingestAction()` in DO:**
```typescript
async ingestAction(action: ValidatedAction): Promise<InclusionReceipt> {
  const seq = ++this.seqCounter;
  const prevHash = this.chainHead;
  const payloadHash = computePayloadHash(action);  // keccak256(ActionPayloadV1)
  const eventHash = computeEventHash(BigInt(seq), prevHash, payloadHash);
  this.chainHead = eventHash;

  // Persist to DO transactional storage
  await this.state.storage.put(`chainHead:${auctionId}`, toHex(this.chainHead));
  await this.state.storage.put(`event:${auctionId}:${seq}`, serialize({seq, prevHash, eventHash, action}));
  await this.state.storage.put(`seqCounter:${auctionId}`, this.seqCounter);

  // Persist to Postgres
  await this.env.DB.insert('events', { auctionId, seq, prevHash, eventHash, payloadHash, action, ts: Date.now() });

  // Broadcast to WebSocket subscribers
  for (const ws of this.subscribers) {
    ws.send(JSON.stringify({ type: 'event', seq, eventHash, action }));
  }

  // Return inclusion receipt
  return { auctionId, seq, eventHash, prevHash, actionType: action.type, receivedAt: Date.now() };
}
```

**Implement action handlers:**
- [ ] `handleJoin(request)` — validate signature, check nullifier, check nonce, verify ZK proof (stub), ingest
- [ ] `handleBid(request)` — validate signature, check nonce, ingest
- [ ] `handleDeliver(request)` — validate signature, check nonce, ingest

**Implement nonce tracking:**
```typescript
async function checkNonce(auctionId: string, agentId: string, actionType: string, nonce: number, state: DurableObjectState): Promise<void> {
  const key = `nonce:${auctionId}:${agentId}:${actionType}`;
  const lastSeen = await state.storage.get<number>(key) ?? -1;
  if (nonce !== lastSeen + 1) throw new Error(`Expected nonce ${lastSeen + 1}, got ${nonce}`);
  await state.storage.put(key, nonce);
}
```

**Implement nullifier checking:**
```typescript
async function checkNullifier(nullifier: string, state: DurableObjectState): Promise<void> {
  const key = `nullifier:${nullifier}`;
  const existing = await state.storage.get<boolean>(key);
  if (existing) throw new Error("Nullifier already spent");
  await state.storage.put(key, true);
}
```

**WebSocket broadcast:**
- [ ] On WebSocket upgrade: add to `this.subscribers` set
- [ ] On event ingested: broadcast to all subscribers
- [ ] On close: remove from subscribers
- [ ] Use hibernatable WebSockets for cost efficiency

**Postgres setup:**
- [ ] Write schema (`engine/db/schema.sql`):
  ```sql
  CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    auction_id TEXT NOT NULL,
    seq BIGINT NOT NULL,
    prev_hash TEXT NOT NULL,
    event_hash TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    action_type TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    wallet TEXT NOT NULL,
    amount TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(auction_id, seq)
  );
  CREATE INDEX idx_events_auction_seq ON events(auction_id, seq);
  ```
- [ ] Set up connection (Neon, Supabase, or local)

**Express.js API server:**
- [ ] `POST /room/:auctionId/action` — forward to DO
- [ ] `GET /room/:auctionId/events?from=:seq` — query Postgres
- [ ] `GET /auctions` — list auctions (from Postgres or cache)
- [ ] `GET /auctions/:id/manifest` — return manifest JSON
- [ ] `WS /room/:auctionId/stream` — proxy to DO WebSocket

**Deliveries:**
- [ ] Push DO code to `engine/worker/`
- [ ] Push API code to `engine/api/`
- [ ] Push schema to `engine/db/`
- [ ] Tag: `ws3/engine-skeleton`

### Day 3-4: Integrate Crypto Libs + Contract Addresses

```
Priority: Replace all stubs with real implementations
```

**Integrate WS-1 crypto libs (arriving Day 3-4):**
- [ ] Replace `computeEventHash` stub → import from `@agent-auction/crypto/poseidon-chain`
- [ ] Replace `verifyProof` stub → import from `@agent-auction/crypto/snarkjs-verify`
- [ ] Replace `verifySignature` stub → import from `@agent-auction/crypto/eip712-typed-data`
- [ ] Import `nullifier.ts` for derivation verification
- [ ] Bundle vkey JSONs into DO (from `circuits/keys/`)

**Integrate WS-2 contract addresses (arriving Day 4):**
- [ ] Load `deployments/base-sepolia.json` into engine config
- [ ] Set up viem/ethers client with Base Sepolia RPC
- [ ] Implement `readBondStatus(auctionId, agentId)`: read `AuctionEscrow.bondRecords()` for admission
- [ ] Implement `readRuntimeSigner(agentAccountAddress)`: read `AgentAccount.runtimeSigner()` for sig verify (cache per session)

**Implement inclusion receipt signing:**
- [ ] Configure sequencer private key in DO environment
- [ ] Sign receipt: `sequencerKey.sign(keccak256(auctionId + seq + eventHash))`
- [ ] Return to agent: `{ auctionId, seq, eventHash, prevHash, actionType, receivedAt, sequencerSig }`

**Start frontend:**
- [ ] Auction list page: `GET /auctions` → render cards (status, reserve price, deadline)
- [ ] Auction room page: connect WebSocket → render live event feed
- [ ] Use existing landing page components from `frontend/src/components/`

**Deliveries:**
- [ ] Push updated DO with real crypto
- [ ] Tag: `ws3/crypto-integrated`

### Day 5-6: Auction Close Flow + x402 + Frontend

**Auction close flow (DO sequencer → on-chain):**
- [ ] At auction deadline or manual close:
  1. Stop accepting new bids
  2. Read all events from Postgres for this auctionId
  3. Serialize to ReplayBundleV1 (using `replay-bundle.ts` from WS-1)
  4. Pin to IPFS (use Pinata, web3.storage, or nft.storage)
  5. Build `AuctionSettlementPacket` (using TS type from WS-2)
  6. Sign packet with sequencer key
  7. Call `AuctionRegistry.recordResult(packet, sequencerSig)` via viem
  8. Log: `AuctionEnded` event emitted → CRE takes over

**Replay bundle endpoint (for CRE to fetch):**
- [ ] `GET /replay/:auctionId` — return raw ReplayBundleV1 bytes
- [ ] Must be byte-for-byte deterministic (no session personalization)
- [ ] Cache in object storage (R2, S3) as backup

**x402 middleware:**
- [ ] Install `@x402/express` (or `@x402/hono`)
- [ ] Gate endpoints:
  - `GET /auctions/:id/manifest` → 0.001 USDC
  - `GET /auctions/:id/events` → 0.0001 USDC/call
  - `GET /auctions` → free
- [ ] Implement Workers KV dedup: `x402receipt:{chainId}:{txHash}:{logIndex}`
  ```typescript
  const key = `x402receipt:${chainId}:${txHash}:${logIndex}`;
  const existing = await env.KV.get(key);
  if (existing) throw new Response("Receipt already used", { status: 409 });
  await env.KV.put(key, JSON.stringify({ usedAt: Date.now() }), { expirationTtl: 86400 * 90 });
  ```

**Bond observation (for PENDING_BOND flow):**
- [ ] Watch USDC `Transfer` events to escrow address (via WebSocket provider or polling)
- [ ] Match to pending join requests
- [ ] Return `PENDING_BOND` status with `retryAfter: 5000` if bond not yet observed
- [ ] 60s timeout — reject join if bond not observed

**Frontend — live auction view:**
- [ ] Bid timeline (scrollable event list with timestamps)
- [ ] Current highest bid display
- [ ] Agent list / leaderboard
- [ ] Countdown timer to auction deadline
- [ ] Auction state badge (OPEN / CLOSED / SETTLED / CANCELLED)

**Deliveries:**
- [ ] Push replay endpoint
- [ ] Push x402 middleware
- [ ] Push frontend pages
- [ ] Tag: `ws3/auction-flow-complete`

### Day 7-8: Agent Demo Client + E2E

**Agent demo client** (`agent-client/src/`):

Build a script that simulates a full agent lifecycle:

```typescript
// index.ts — demo agent flow
async function runAgent(config: AgentConfig) {
  // 1. Deploy smart wallet
  const walletAddress = await deployWallet(config.runtimeSigner, config.salt);

  // 2. Register ERC-8004 identity (if not already registered)
  await registerIdentity(config.agentId, walletAddress);

  // 3. Register privacy sidecar commitment
  const { agentSecret, capabilityRoot } = await registerPrivacyCommitment(config.agentId);

  // 4. Post bond (USDC transfer via UserOp)
  await postBond(walletAddress, config.auctionId, config.bondAmount);

  // 5. Generate ZK membership proof
  const { proof, signals } = await generateMembershipProof(agentSecret, ...);

  // 6. Join auction (signed EIP-712 + ZK proof)
  const joinReceipt = await joinAuction(config.auctionId, proof, signals);
  console.log("Join receipt:", joinReceipt);

  // 7. Place bid(s)
  const bidReceipt = await placeBid(config.auctionId, config.bidAmount);
  console.log("Bid receipt:", bidReceipt);

  // 8. Wait for settlement
  await waitForSettlement(config.auctionId);

  // 9. Claim refund (if not winner)
  await claimRefundIfLoser(config.auctionId, config.agentId);
}
```

- [ ] `wallet.ts`: EIP-4337 wallet deployment + UserOp construction (use permissionless.js or viem AA)
- [ ] `identity.ts`: ERC-8004 registration + privacy sidecar commitment
- [ ] `auction.ts`: join/bid/deliver via HTTP to DO sequencer

**Run demo with 3+ agents:**
- [ ] Agent A: bids 100 USDC
- [ ] Agent B: bids 150 USDC
- [ ] Agent C: bids 120 USDC
- [ ] Expected: Agent B wins, settlement via CRE, Agent A + C get refunds

**Frontend — settlement verification:**
- [ ] "Verify Settlement" button → link to Tenderly tx explorer
- [ ] Show: CRE workflow triggered, onReport called, SETTLED state
- [ ] ZK proof status indicators (membership verified, bid range verified)

**Frontend — replay/audit mode:**
- [ ] Download replay bundle
- [ ] Show Poseidon chain verification (event by event)
- [ ] Highlight: computed `finalLogHash` matches on-chain

### Day 9-10: Demo Video + Polish

- [ ] Record demo video (3-5 min):
  1. Show agent onboarding (wallet deploy, identity register)
  2. Show auction creation
  3. Show live bidding (3 agents, real-time UI)
  4. Show auction close → CRE settlement trigger
  5. Show settlement verification on Tenderly
  6. Show ZK proof verification
  7. Show refund claims
- [ ] Polish UI: animations, loading states, error handling
- [ ] Write engine section of README
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
// stubs/crypto.ts — DELETE after Day 4
import { keccak256, concat, toBytes } from "viem";

export function computeEventHash(seq: bigint, prevHash: Uint8Array, payloadHash: Uint8Array): Uint8Array {
  return keccak256(concat([toBytes(seq), prevHash, payloadHash]));
}

export async function verifyMembershipProof(proof: any, signals: any): Promise<{ valid: boolean }> {
  console.warn("STUB: ZK verify always returns true");
  return { valid: true, registryRoot: "0x00", nullifier: "0x00" };
}

export function verifyEIP712Signature(hash: Uint8Array, sig: Uint8Array, signer: string): boolean {
  console.warn("STUB: signature verify always returns true");
  return true;
}

// stubs/contracts.ts — DELETE after Day 4
export async function readBondStatus(auctionId: string, agentId: string): Promise<bigint> {
  console.warn("STUB: bond always returns 1000000");
  return 1000000n;
}

export async function readRuntimeSigner(walletAddress: string): Promise<string> {
  console.warn("STUB: runtimeSigner returns hardcoded address");
  return "0x1234567890abcdef1234567890abcdef12345678";
}
```

---

## If Behind — What to Cut

1. **Skip x402 middleware** — make all endpoints free for demo
2. **Skip IPFS pinning** — serve replay bundle from API only (CRE still fetches from URL)
3. **Simplify frontend** — single page with event log + "Verify" button (skip leaderboard, animations)
4. **Skip bond observation** — assume bonds are always recorded before join (manual recordBond)
5. **Use 1 agent** in demo instead of 3 — simpler but less impressive
6. **Skip replay/audit mode** — live view only
