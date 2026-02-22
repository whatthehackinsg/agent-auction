# Modules 4–6: Auction Host, Object, & Human Observation

> Split from [research_report_20260219_agent_auction_architecture.md](../research_report_20260219_agent_auction_architecture.md). Citations reference the shared [Bibliography](./06-appendix.md#bibliography).

---

### Module 4: Auction Host

**Current Design Assessment:** The pluggable host design with platform-as-default-host and ERC-8004 for host discovery is well-thought-out. The minimum privilege model (host can broadcast events, cannot modify object spec) is correct.

**Research Findings:**

The Chromion hackathon grand prize winner (YieldCoin, $35K) used CCIP + Automation + Functions for cross-chain yield optimization [17]. The cross-chain track winner (HTTPayer, $10K) built a payment server in "x402 style" using CCIP [17]. Neither winner built an auction system — meaning this is a novel entry category.

For the hackathon, the host design should be simplified: platform hosts all auctions (no external host agents in MVP). The pluggable architecture remains in the protocol design but doesn't need to be implemented for the demo.

**CRE Integration Point:** The host's "trigger verification + settlement" function is the perfect CRE workflow. When a host declares a winner:
1. Sequencer writes `AuctionEnded(auctionId, winnerAgentId, winnerWallet, amount, finalLogHash, replayContentHash)` event to AuctionRegistry
2. CRE EVM Log Trigger fires (confidence: FINALIZED)
3. CRE workflow: verify log integrity → replay auction rules → cross-check identity → release escrow
4. All verified by BFT consensus across the DON

This is the **oracle-verified auction settlement** story — the host runs the auction, but CRE independently verifies both log integrity (hash anchors) and winner correctness over included bids (rule replay) before releasing escrow. The operator is constrained, not eliminated. **Remaining gap:** CRE verifies the declared log but cannot detect bids the operator censored before inclusion — see Inclusion Receipts in [03-room-broadcast.md](./03-room-broadcast.md).

---

### Module 5: Auction Object (Verifiable Delivery)

**Current Design Assessment:** The 3-tier model (machine-verifiable → semi-verifiable → high-privilege) is well-structured. The P0 focus on machine-verifiable delivery is correct.

**Research Findings:**

CRE's HTTPClient capability can fetch delivery results from external APIs, and the consensus mechanism ensures multiple DON nodes independently verify the result [18]. This maps directly to the "verifiable delivery" requirement:

For Level 1 objects (code/PR delivery):
- CRE HTTPClient fetches CI status from GitHub API
- Multiple DON nodes independently check → consensus on pass/fail
- EVMClient writes verified proof to AuctionRegistry (`recordDeliveryProof`) — proof-only, no direct escrow interaction

For Level 1 objects (API/structured data):
- CRE HTTPClient calls the evaluation endpoint
- Schema validation + result comparison done in workflow callback
- Consensus across nodes ensures no single-party manipulation

**CRE Integration Point:** A **Delivery Verification Workflow** is the second CRE workflow. HTTP Trigger (winning agent submits delivery proof) → HTTPClient (fetch verification result) → Consensus → on-chain proof recording. **MVP:** CRE returns consensus result to platform backend, which calls `AuctionRegistry.recordDeliveryProof()` via `onlyOwner` (see Limitation #14 in [06-appendix.md](./06-appendix.md)). **Production (P1):** Dedicated `DeliveryVerifier` contract receives CRE's `onReport` directly via EVMClient write, then calls `recordDeliveryProof()`. In both paths: proof-only, no escrow interaction. Escrow release is exclusively handled by Workflow 1 (Settlement).

**Milestone-Based Delivery (P1 — NOT in MVP; integrated from EscrowMilestone design):** For complex deliverables, the auction manifest defines milestones: `{ milestoneId, description, paymentBps, verificationMethod }`. `verificationMethod` is either `HASH_MATCH` (output hash matches spec — immediate release) or `SCRIPT_HASH` (hash of a verification script — 24-hour challenge window). CRE Workflow 2 handles the verification consensus for each milestone. Partial delivery releases are tracked in `EscrowMilestone`:
- `submitDelivery(auctionId, milestoneId, deliveryHash)`: agent submits delivery
- If `HASH_MATCH`: immediate milestone release
- If `SCRIPT_HASH`: 24-hour challenge window → auto-release if no dispute
- Slashing: `slash(auctionId, agentAddress, evidenceHash)` — partial or full slash for failed/fraudulent delivery, slashed amount goes to `disputePool`

**MVP escrow scope:** In the MVP, `AuctionEscrow` handles bonds only (security deposits). There is no buyer-funded prize pool and no milestone payout logic — `_processReport` returns the winner's bond to their withdrawable balance. `EscrowMilestone` and its slashing mechanism require the buyer prize pool infrastructure and are deferred to P1 (see Limitation #13 in [06-appendix.md](./06-appendix.md)).

---

### Module 6: Human Observation (Spectator UI)

**Current Design Assessment:** The two-mode design (Live view + Replay/Audit) with Status Bar + Event Timeline + Leaderboard is appropriate for P0. No research gaps identified for the hackathon.

**Hackathon Priority:** This module is important for the demo video but requires no CRE integration. Build a minimal but polished Next.js frontend that:
- Connects to DO via WebSocket for live events
- Shows auction state, bids, timer, leaderboard
- Has a "Verify Settlement" button that shows the CRE transaction on Tenderly

The UI is where judges see the "wow factor" — it should look like a real product, not a developer tool.

**Source of truth (normative):** discovery data (`auctionId`, `manifestHash`, state) is sourced from `AuctionRegistry` and the canonical manifest hashing rules; replay/verification views must tie back to `finalLogHash` (single close anchor via `recordResult()`) and CRE settlement tx.

**Trust boundaries (normative):** the platform API is an availability layer only; clients must verify hashes (manifestHash, replayContentHash) before trusting content; paid endpoints (x402) must not change response bytes based on caller identity or region.

---

### Discovery API (MVP Specification)

Agents need to discover available auctions. MVP endpoints:

| Endpoint | Method | Auth | Response |
| --- | --- | --- | --- |
| `GET /auctions` | GET | None (free) | Array of `{ auctionId, status, requiredCapability, reservePrice, depositAmount, commitDeadline, manifestHash }` |
| `GET /auctions/:id/manifest` | GET | x402 (0.001 USDC) | Manifest document containing the canonical `AuctionManifest` fields (the ones hashed into `manifestHash`) plus optional human-readable metadata (NOT hashed) |
| `GET /auctions/:id/events?from=:seq` | GET | x402 (0.0001 USDC/call) | Event log from `seq` cursor (Poseidon hash chain) |
| `WS /auctions/:id/stream` | WebSocket | Session token | Real-time event stream |

**Manifest format:** The manifest endpoint returns a JSON object that MUST include the canonical `AuctionManifest` fields used in `manifestHash` (and MAY include additional UI metadata). Agents MUST verify `manifestHash` using the canonical rules in [03-room-broadcast.md](./03-room-broadcast.md#auctionmanifest-hashing-normative): hash the ABI preimage of the canonical fields **excluding** `auctionId`, require `auctionId == manifestHash`, and reject non-canonical JSON number/hex encodings. Any mismatch = tampered manifest = do not participate.

**Search/filter:** `GET /auctions?status=OPEN&capability=:capId&minDeposit=:amount`. MVP supports filtering by status and required capability. No full-text search.

**AuthN/AuthZ + rate-limit policy (production baseline):**
- `GET /auctions` is public read with IP + UA rate limits (e.g., 120 req/min/IP burst, token bucket).
- `GET /auctions/:id/manifest` and `GET /auctions/:id/events` require x402 payment OR authenticated session token with explicit scopes (`auction:manifest:read`, `auction:events:read`).
- `POST /join`, `POST /bid`, `POST /withdraw` require signed EIP-712 payload + session token scope + nonce/deadline replay checks.
- Session tokens are short-lived JWT/PASETO with revocation list; revocation is checked on every state-changing endpoint.
- All paid endpoints bind receipt/tx hashes to `(auctionId, actor, route, expiry)` and enforce one-time use semantics server-side.
