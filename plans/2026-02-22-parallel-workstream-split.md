# Parallel Workstream Distribution — 3 People, 10 Days

**Date:** 2026-02-22
**Source of truth:** `full_contract_arch(amended).md`
**Target:** Chainlink Convergence Hackathon (CRE & AI Track)

---

## Team

| ID | Role | Skills |
|----|------|--------|
| **WS-1** | ZK Researcher | Circom, Groth16, Poseidon, cryptographic protocol design |
| **WS-2** | AI Engineer 1 | TypeScript/Python, some Solidity, web3.js/ethers/viem |
| **WS-3** | AI Engineer 2 | TypeScript/React, some Solidity, web3.js/ethers/viem |

---

## Workstream Overview

```
WS-1 (ZK Researcher)          WS-2 (AI Engineer 1)              WS-3 (AI Engineer 2)
─────────────────────          ──────────────────────             ──────────────────────
ZK Circuits + Crypto Libs      Smart Contracts + CRE              DO Engine + API + Frontend

Circom circuits                Solidity contracts (7)             Cloudflare DO sequencer
Trusted setup                  Foundry tests                      HTTP/MCP API
Poseidon chain lib (TS)        CRE Settlement Workflow            WebSocket/SSE broadcast
snarkjs verify wrappers        MockKeystoneForwarder              x402 middleware
EIP-712 typed data lib         EIP-4337 bundler setup             Postgres event log
ReplayBundleV1 serializer      Deploy to Base Sepolia             IPFS replay bundle
Nullifier derivation           Contract wiring                    Next.js frontend
AgentPrivacyRegistry.sol                                          Agent demo client
                                                                  Demo video
```

---

## Interface Contracts (Agree on Day 1)

These are the boundaries between workstreams. Each interface must be defined before parallel work begins.

### Interface 1: WS-1 → WS-2 (Crypto → Contracts)

| Artifact | Producer | Consumer | Format |
|----------|----------|----------|--------|
| `AgentPrivacyRegistry.sol` | WS-1 | WS-2 deploys | Solidity file |
| `bid_range_vkey.json` | WS-1 | WS-3 bundles into DO | JSON (snarkjs export) |
| `registry_member_vkey.json` | WS-1 | WS-3 bundles into DO | JSON (snarkjs export) |
| Poseidon test vectors | WS-1 | WS-2 (Foundry) + WS-3 (DO) | 3+ vectors: inputs < F, inputs > F, zero inputs |
| Nullifier derivation spec | WS-1 | WS-3 implements in DO | `Poseidon(agentSecret, auctionId, actionType)` |

### Interface 2: WS-2 → WS-3 (Contracts → Engine)

| Artifact | Producer | Consumer | Format |
|----------|----------|----------|--------|
| Contract ABIs | WS-2 | WS-3 reads | `out/` Foundry artifacts (JSON) |
| Deployed addresses | WS-2 | WS-3 configures | `deployments.json` per network |
| `AuctionSettlementPacket` struct | WS-2 | WS-3 builds in DO | Solidity struct + TS type |
| `AuctionEnded` event signature | WS-2 | WS-3 emits via sequencer | `event AuctionEnded(bytes32 indexed auctionId, ...)` |
| `recordResult()` call spec | WS-2 | WS-3 calls from DO | ABI + required fields |
| EIP-4337 bundler endpoint | WS-2 | WS-3 sends UserOps | URL + EntryPoint address |

### Interface 3: WS-1 → WS-3 (Crypto → Engine)

| Artifact | Producer | Consumer | Format |
|----------|----------|----------|--------|
| `poseidon-chain.ts` library | WS-1 | WS-3 imports in DO | TS module: `computeEventHash(seq, prevHash, payloadHash)` |
| `snarkjs-verify.ts` wrappers | WS-1 | WS-3 calls in DO | TS module: `verifyMembership(proof, signals)`, `verifyBidRange(proof, signals)` |
| `eip712-typed-data.ts` library | WS-1 | WS-3 uses in DO + agent client | TS module: `hashJoin(...)`, `hashBid(...)`, `verifySignature(...)` |
| `replay-bundle.ts` serializer | WS-1 | WS-3 uses at auction close | TS module: `serialize(events) → bytes`, `computeContentHash(bytes)` |
| `nullifier.ts` derivation | WS-1 | WS-3 checks in DO | TS module: `deriveNullifier(agentSecret, auctionId, actionType)` |
| Agent proof generation SDK | WS-1 | WS-3 uses in agent demo | TS module: `generateMembershipProof(...)`, `generateBidRangeProof(...)` |

---

## Day-by-Day Schedule

### Day 1-2: Foundation (All Parallel)

**WS-1 (ZK Researcher):**
- [ ] Set up Circom 2.2.3 + snarkjs 0.7.5 environment
- [ ] Write `RegistryMembership.circom` (~12K constraints)
- [ ] Write `BidRange.circom` (~5K constraints)
- [ ] Download Hermez Powers of Tau (`powersOfTau28_hez_final_16.ptau`)
- [ ] Run trusted setup phase 2 (3 independent contributors)
- [ ] Export `bid_range_vkey.json` + `registry_member_vkey.json`
- [ ] Write `AgentPrivacyRegistry.sol` (commitment sidecar)
- [ ] **DELIVER to WS-2:** `AgentPrivacyRegistry.sol`
- [ ] **DELIVER to WS-3:** vkey JSON files

**WS-2 (AI Engineer 1 — Contracts):**
- [ ] Set up Foundry project (`forge init`)
- [ ] Install deps: `@account-abstraction/contracts@0.7.0`, `@openzeppelin/contracts`
- [ ] Write `AgentAccount.sol` (simplified: `runtimeSigner` + sig/nonce only)
- [ ] Write `AgentAccountFactory.sol` (CREATE2)
- [ ] Write `AgentPaymaster.sol` (method-based gating)
- [ ] Write `AuctionRegistry.sol` (createAuction, recordResult, markSettled, DOMAIN_SEPARATOR)
- [ ] Write `AuctionEscrow.sol` (ReceiverTemplate, bonds, _processReport, claimRefund)
- [ ] Write basic Foundry tests for each contract
- [ ] **DELIVER to WS-3:** Contract ABIs (Foundry `out/` artifacts)

**WS-3 (AI Engineer 2 — Engine + Frontend):**
- [ ] Set up Cloudflare Worker + Durable Object project (`wrangler init`)
- [ ] Set up Postgres schema (events table: `auctionId, seq, prevHash, eventHash, payloadHash, action, ts`)
- [ ] Implement DO skeleton: `fetch()` handler, WebSocket upgrade, hibernation
- [ ] Implement core sequencer: `seq` counter, action validation, WebSocket broadcast
- [ ] Set up Express.js API server with routing structure
- [ ] **NO DEPENDENCY on WS-1/WS-2 yet** — use hardcoded stubs for ZK verify + contract calls

### Day 3-4: Core Logic (All Parallel)

**WS-1 (ZK Researcher):**
- [ ] Write `poseidon-chain.ts` — event hash computation using `circomlibjs`/`poseidon-lite`
- [ ] Write `snarkjs-verify.ts` — wrapper around `groth16.verify()` for both circuits
- [ ] Write `eip712-typed-data.ts` — hash functions for Join, Bid, Deliver, Dispute, Withdraw structs
- [ ] Write `nullifier.ts` — `Poseidon(agentSecret, auctionId, actionType)` derivation
- [ ] Write cross-language Poseidon test vectors (3+ vectors)
- [ ] **DELIVER to WS-2:** Poseidon test vectors (for Foundry tests)
- [ ] **DELIVER to WS-3:** `poseidon-chain.ts`, `snarkjs-verify.ts`, `eip712-typed-data.ts`, `nullifier.ts`

**WS-2 (AI Engineer 1 — Contracts):**
- [ ] Deploy all contracts to Base Sepolia via Tenderly:
  - Step 1: Verify EntryPoint at canonical address
  - Step 2: Deploy AgentPrivacyRegistry (from WS-1)
  - Step 3: Deploy AgentAccount implementation
  - Step 4: Deploy AgentAccountFactory
  - Step 5: Deploy AgentPaymaster → stake ETH
  - Step 6: Deploy AuctionRegistry → set DOMAIN_SEPARATOR
  - Step 7: Deploy AuctionEscrow (with MockKeystoneForwarder for now)
  - Step 8: Wire AuctionRegistry.setEscrow()
- [ ] Write `MockKeystoneForwarder.sol` for local dev
- [ ] Verify Poseidon test vectors in Foundry (using `poseidon-solidity` npm)
- [ ] **DELIVER to WS-3:** `deployments.json` with all contract addresses

**WS-3 (AI Engineer 2 — Engine + Frontend):**
- [ ] Integrate `poseidon-chain.ts` from WS-1 into DO sequencer
- [ ] Integrate `snarkjs-verify.ts` from WS-1 into DO admission path
- [ ] Implement `ingestAction()` in DO: validate → assign seq → hash chain → persist → broadcast
- [ ] Implement nullifier checking in DO transactional storage
- [ ] Implement off-chain nonce tracking: `nonce:{auctionId}:{agentId}:{actionType}`
- [ ] Implement inclusion receipt generation + sequencer signing
- [ ] Start Next.js frontend: auction list page, auction room page (WebSocket connection)

### Day 5-6: Integration (Dependencies Converge)

**WS-1 (ZK Researcher):**
- [ ] Write `replay-bundle.ts` — ReplayBundleV1 canonical serializer + `sha256` content hash
- [ ] Write agent-side proof generation SDK: `generateMembershipProof(agentSecret, capabilityPath, ...)`, `generateBidRangeProof(bid, salt, ...)`
- [ ] Verify test vectors: ReplayBundleV1 Vector A + Vector B (from spec)
- [ ] **DELIVER to WS-2:** `replay-bundle.ts` (CRE workflow needs the same serialization logic)
- [ ] **DELIVER to WS-3:** `replay-bundle.ts` + agent proof generation SDK

**WS-2 (AI Engineer 1 — CRE):**
- [ ] Write CRE Settlement Workflow (TypeScript SDK):
  - Trigger: EVM Log Trigger on `AuctionEnded` event (FINALIZED confidence)
  - Compute: fetch ReplayBundleV1 from configured URL → sha256 verify → Poseidon chain replay → rule replay (English: highest valid bid) → derive winner
  - Write: EVMClient → KeystoneForwarder → `AuctionEscrow.onReport()`
- [ ] Integrate `replay-bundle.ts` from WS-1 for content hash verification
- [ ] Run `cre workflow simulate` locally
- [ ] Write Foundry integration test: full settlement flow (createAuction → recordResult → MockKeystoneForwarder.onReport → verify escrow state)
- [ ] **DELIVER to WS-3:** CRE workflow config (workflowId, workflowName for AuctionEscrow setExpected*)

**WS-3 (AI Engineer 2 — Engine + Frontend):**
- [ ] Integrate contract ABIs + addresses from WS-2
- [ ] Implement `recordResult()` call from DO sequencer at auction close
- [ ] Implement replay bundle generation at auction close: serialize events → pin to IPFS → get CID
- [ ] Implement x402 middleware (`@x402/express` or `@x402/hono`)
- [ ] Implement bond observation: watch USDC Transfer events → match to pending joins
- [ ] Frontend: live auction view (bid timeline, current highest, agent list, countdown timer)

### Day 7-8: End-to-End + Demo (All Converge)

**WS-1 (ZK Researcher):**
- [ ] Help WS-3 debug any ZK proof verification issues in DO
- [ ] Write agent onboarding script: generate `agentSecret`, compute capability Merkle tree, register commitment in AgentPrivacyRegistry
- [ ] Verify full ZK proof flow end-to-end: agent generates proof → DO verifies → admission accepted
- [ ] **ASSIST WS-3** with agent demo client ZK integration

**WS-2 (AI Engineer 1 — CRE + Contracts):**
- [ ] Register CRE Workflow (Step 10): `cre workflow deploy`
- [ ] Configure AuctionEscrow: `setExpectedWorkflowId`, `setExpectedWorkflowName`, `setExpectedAuthor`
- [ ] Run full settlement E2E test: `createAuction → bond → join → bid → close → recordResult → AuctionEnded → CRE → onReport → SETTLED`
- [ ] Fix any contract bugs surfaced by integration
- [ ] **ASSIST WS-3** with contract integration issues

**WS-3 (AI Engineer 2 — Engine + Frontend + Demo):**
- [ ] Build agent demo client:
  - Deploy smart wallet (CREATE2 via AgentAccountFactory)
  - Register ERC-8004 identity + privacy sidecar commitment
  - Generate ZK membership proof (using WS-1 SDK)
  - Post bond (USDC transfer via UserOp)
  - Join auction (signed EIP-712 + ZK proof → DO)
  - Place bids
  - Receive inclusion receipts
- [ ] Frontend: settlement verification page ("Verify on Tenderly" button)
- [ ] Frontend: ZK proof status indicators
- [ ] Run full demo flow with 3+ simulated agents

### Day 9-10: Polish + Submit

**WS-1:** Review crypto correctness, write ZK section of README
**WS-2:** Review contract security, write contracts + CRE section of README
**WS-3:** Record demo video (3-5 min), finalize UI, write engine section of README

**All together:** Final README, submission package

---

## Shared Repository Structure

```
agent-auction/
├── contracts/                    # WS-2 owns
│   ├── src/
│   │   ├── AgentAccount.sol
│   │   ├── AgentAccountFactory.sol
│   │   ├── AgentPaymaster.sol
│   │   ├── AgentPrivacyRegistry.sol   ← written by WS-1, deployed by WS-2
│   │   ├── AuctionRegistry.sol
│   │   ├── AuctionEscrow.sol
│   │   └── mock/
│   │       └── MockKeystoneForwarder.sol
│   ├── test/
│   ├── script/
│   └── foundry.toml
│
├── circuits/                     # WS-1 owns
│   ├── RegistryMembership.circom
│   ├── BidRange.circom
│   ├── build/                   # compiled outputs
│   ├── keys/                    # vkeys + zkeys
│   └── ptau/                    # Powers of Tau file
│
├── packages/                    # WS-1 owns (shared TS libraries)
│   └── crypto/
│       ├── src/
│       │   ├── poseidon-chain.ts
│       │   ├── snarkjs-verify.ts
│       │   ├── eip712-typed-data.ts
│       │   ├── replay-bundle.ts
│       │   ├── nullifier.ts
│       │   └── proof-generator.ts
│       ├── test/
│       └── package.json
│
├── engine/                      # WS-3 owns
│   ├── worker/                  # Cloudflare Worker + DO
│   │   ├── src/
│   │   │   ├── index.ts         # Worker entry
│   │   │   ├── sequencer.ts     # Durable Object
│   │   │   ├── actions.ts       # join/bid/deliver handlers
│   │   │   └── broadcast.ts     # WebSocket/SSE
│   │   └── wrangler.toml
│   ├── api/                     # Express.js API
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── routes/
│   │   │   └── middleware/
│   │   │       └── x402.ts
│   │   └── package.json
│   └── db/
│       └── schema.sql
│
├── cre/                         # WS-2 owns
│   ├── workflows/
│   │   └── settlement.ts        # CRE Settlement Workflow
│   ├── project.yaml
│   └── package.json
│
├── frontend/                    # WS-3 owns (existing Next.js)
│   └── src/
│       ├── app/
│       ├── components/
│       └── lib/
│
├── agent-client/                # WS-3 owns, WS-1 assists
│   ├── src/
│   │   ├── index.ts             # Demo agent script
│   │   ├── wallet.ts            # EIP-4337 wallet ops
│   │   ├── identity.ts          # ERC-8004 + privacy sidecar
│   │   └── auction.ts           # join/bid/deliver
│   └── package.json
│
├── deployments/                 # WS-2 produces, all consume
│   └── base-sepolia.json        # { addresses, abis }
│
└── docs/                        # existing
```

---

## Critical Path & Risk Mitigation

```
Day 1 ──────────────── Day 4 ──────────── Day 7 ──────── Day 10
  │                      │                  │               │
  ├─ WS-1: circuits ────►├─ crypto libs ──►├─ assist ─────►├─ polish
  │                      │   ↓              │               │
  ├─ WS-2: contracts ──►├─ deploy+CRE ──►├─ E2E test ───►├─ polish
  │                      │   ↓              │               │
  └─ WS-3: DO skeleton ►└─ integrate ───►└─ demo+UI ────►└─ video
                             ▲
                        convergence point
                        (day 4-5: addresses +
                         crypto libs ready)
```

**Critical path:** WS-3 is blocked on WS-1 (crypto libs, day 3) and WS-2 (addresses, day 4).

**Mitigation:** WS-3 uses stubs for days 1-3:
- Stub ZK verify: `async verifyProof() { return true; }`
- Stub Poseidon: use keccak256 placeholder
- Stub contract calls: hardcoded mock responses
- Replace stubs with real implementations on day 4 when libs + addresses arrive

**If behind — cut in this order:**
1. Cut sealed-bid MPC (already off-chain, not in MVP)
2. Simplify ZK: hardcode membership verification, skip BidRange
3. Cut Delivery Verification (Workflow 2) — Settlement alone is enough
4. Use Coinbase Base Paymaster instead of custom AgentPaymaster
5. Simplify UI — Remix + scripts is acceptable

---

## Daily Sync Protocol

- **Morning standup (15 min):** What I delivered, what I need, what's blocked
- **Interface handoffs:** Push to shared repo with tag (e.g., `ws1/vkeys-ready`, `ws2/deployed`)
- **Integration checkpoints:** Day 4 (libs + addresses), Day 7 (E2E flow works)
- **Shared channel:** Post all contract addresses, API endpoints, and test results
