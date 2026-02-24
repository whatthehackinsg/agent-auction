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
- [x] Set up Circom 2.2.3 + snarkjs 0.7.5 environment
- [x] Write `RegistryMembership.circom` (~12K constraints)
- [x] Write `BidRange.circom` (~5K constraints)
- [ ] Download Hermez Powers of Tau (`powersOfTau28_hez_final_16.ptau`) _(ptau files gitignored, not in repo)_
- [ ] Run trusted setup phase 2 (3 independent contributors) _(zkey files gitignored; setup not evidenced in repo)_
- [x] Export `bid_range_vkey.json` + `registry_member_vkey.json`
- [x] Write `AgentPrivacyRegistry.sol` (commitment sidecar)
- [x] **DELIVER to WS-2:** `AgentPrivacyRegistry.sol`
- [x] **DELIVER to WS-3:** vkey JSON files

**WS-2 (AI Engineer 1 — Contracts):**
- [x] Set up Foundry project (`forge init`)
- [x] Install deps: `@account-abstraction/contracts@0.7.0`, `@openzeppelin/contracts`
- [x] Write `AgentAccount.sol` (simplified: `runtimeSigner` + sig/nonce only)
- [x] Write `AgentAccountFactory.sol` (CREATE2)
- [x] Write `AgentPaymaster.sol` (method-based gating)
- [x] Write `AuctionRegistry.sol` (createAuction, recordResult, markSettled, DOMAIN_SEPARATOR)
- [x] Write `AuctionEscrow.sol` (ReceiverTemplate, bonds, _processReport, claimRefund)
- [x] Write basic Foundry tests for each contract _(117 tests across 4 test files)_
- [x] **DELIVER to WS-3:** Contract ABIs (Foundry `out/` artifacts)

**WS-3 (AI Engineer 2 — Engine + Frontend):**
- [x] Set up Cloudflare Worker + Durable Object project (`wrangler init`)
- [x] Set up ~~Postgres~~ D1 schema _(deviation: uses Cloudflare D1 instead of Postgres)_
- [x] Implement DO skeleton: `fetch()` handler, WebSocket upgrade, hibernation
- [x] Implement core sequencer: `seq` counter, action validation, WebSocket broadcast
- [x] Set up ~~Express.js~~ Hono API server with routing structure _(deviation: uses Hono, native to CF Workers)_
- [x] **NO DEPENDENCY on WS-1/WS-2 yet** — use hardcoded stubs for ZK verify + contract calls _(stubs now replaced with real crypto)_

### Day 3-4: Core Logic (All Parallel)

**WS-1 (ZK Researcher):**
- [x] Write `poseidon-chain.ts` — event hash computation using `circomlibjs`/`poseidon-lite`
- [x] Write `snarkjs-verify.ts` — wrapper around `groth16.verify()` for both circuits
- [x] Write `eip712-typed-data.ts` — hash functions for Join, Bid, Deliver, Dispute, Withdraw structs
- [x] Write `nullifier.ts` — `Poseidon(agentSecret, auctionId, actionType)` derivation
- [x] Write cross-language Poseidon test vectors (3+ vectors)
- [x] **DELIVER to WS-2:** Poseidon test vectors (for Foundry tests)
- [x] **DELIVER to WS-3:** `poseidon-chain.ts`, `snarkjs-verify.ts`, `eip712-typed-data.ts`, `nullifier.ts`

**WS-2 (AI Engineer 1 — Contracts):**
- [x] Deploy all contracts to Base Sepolia _(deployed directly, not via Tenderly)_:
  - [x] Step 1: Verify EntryPoint at canonical address
  - [ ] Step 2: Deploy AgentPrivacyRegistry (from WS-1) _(added to Deploy.s.sol but NOT deployed on-chain yet)_
  - [x] Step 3: Deploy AgentAccount implementation
  - [x] Step 4: Deploy AgentAccountFactory
  - [x] Step 5: Deploy AgentPaymaster → stake ETH
  - [x] Step 6: Deploy AuctionRegistry → set DOMAIN_SEPARATOR
  - [x] Step 7: Deploy AuctionEscrow _(v2 with real KeystoneForwarder, not MockKeystoneForwarder)_
  - [x] Step 8: Wire AuctionRegistry.setEscrow()
- [x] Write `MockKeystoneForwarder.sol` for local dev
- [ ] Verify Poseidon test vectors in Foundry (using `poseidon-solidity` npm)
- [x] **DELIVER to WS-3:** `deployments.json` with all contract addresses

**WS-3 (AI Engineer 2 — Engine + Frontend):**
- [x] Integrate `poseidon-chain.ts` from WS-1 into DO sequencer _(via @agent-auction/crypto wrapper)_
- [x] ~~Integrate `snarkjs-verify.ts`~~ Kept as fail-closed stub _(CF Workers can't load vkeys via node:fs; CRE handles ZK verification)_
- [x] Implement `ingestAction()` in DO: validate → assign seq → hash chain → persist → broadcast
- [x] Implement nullifier checking in DO transactional storage
- [x] Implement off-chain nonce tracking: `nonce:{auctionId}:{agentId}:{actionType}`
- [x] Implement inclusion receipt generation + sequencer signing
- [x] Start Next.js frontend: auction list page, auction room page _(pages exist, WIP on functionality)_

### Day 5-6: Integration (Dependencies Converge)

**WS-1 (ZK Researcher):**
- [x] Write `replay-bundle.ts` — ReplayBundleV1 canonical serializer + `sha256` content hash
- [x] Write agent-side proof generation SDK: `generateMembershipProof(agentSecret, capabilityPath, ...)`, `generateBidRangeProof(bid, salt, ...)`
- [x] Verify test vectors: ReplayBundleV1 Vector A + Vector B (from spec) _(replay-bundle.test.ts)_
- [x] **DELIVER to WS-2:** `replay-bundle.ts` (CRE workflow needs the same serialization logic)
- [x] **DELIVER to WS-3:** `replay-bundle.ts` + agent proof generation SDK

**WS-2 (AI Engineer 1 — CRE):**
- [x] Write CRE Settlement Workflow (TypeScript SDK):
  - [x] Trigger: EVM Log Trigger on `AuctionEnded` event (FINALIZED confidence)
  - [x] Compute: fetch ReplayBundleV1 from configured URL → ~~sha256 verify~~ presence check _(MVP: full hash verification is P1)_
  - [x] Write: EVMClient → KeystoneForwarder → `AuctionEscrow.onReport()`
- [x] ~~Integrate `replay-bundle.ts`~~ CRE does presence check only _(full replay verification deferred to P1)_
- [x] Run `cre workflow simulate` locally _(E2E confirmed: transmissionSuccess=true on Base Sepolia)_
- [x] Write Foundry integration test: full settlement flow
- [x] **DELIVER to WS-3:** CRE workflow config

**WS-3 (AI Engineer 2 — Engine + Frontend):**
- [x] Integrate contract ABIs + addresses from WS-2 _(engine/src/lib/addresses.ts, chain-client.ts)_
- [x] Implement `recordResult()` call from DO sequencer at auction close _(engine/src/lib/settlement.ts)_
- [x] Implement replay bundle generation at auction close _(engine/src/lib/replay-bundle.ts + ipfs.ts)_
- [x] Implement x402 middleware _(engine/src/middleware/x402.ts)_
- [x] Implement bond observation _(engine/src/lib/bond-watcher.ts)_
- [ ] Frontend: live auction view (bid timeline, current highest, agent list, countdown timer) _(pages scaffolded, functionality WIP — beads nlk/b5d open)_

### Day 7-8: End-to-End + Demo (All Converge)

**WS-1 (ZK Researcher):**
- [x] ~~Help WS-3 debug ZK proof verification issues~~ N/A — ZK verify kept as stub in engine (CRE handles verification)
- [x] Write agent onboarding script _(packages/crypto/src/onboarding.ts + scripts/onboard-agent.ts)_
- [ ] Verify full ZK proof flow end-to-end _(ZK verify is stubbed in engine; circuit WASM/zkey compilation pending)_
- [x] **ASSIST WS-3** with agent demo client ZK integration _(onboarding SDK delivered)_

**WS-2 (AI Engineer 1 — CRE + Contracts):**
- [ ] Register CRE Workflow (Step 10): `cre workflow deploy` _(simulation confirmed, formal registration pending)_
- [ ] Configure AuctionEscrow: `setExpectedWorkflowId`, `setExpectedWorkflowName`, `setExpectedAuthor` _(bead wq4 open — configureCRE() not yet called)_
- [x] Run full settlement E2E test _(confirmed on-chain: tx 0x0b8e9ede...)_
- [x] Fix any contract bugs surfaced by integration _(3-round security review, 9 bugs fixed)_
- [x] **ASSIST WS-3** with contract integration issues

**WS-3 (AI Engineer 2 — Engine + Frontend + Demo):**
- [x] Build agent demo client _(agent-client/src/: wallet.ts, identity.ts, auction.ts, index.ts — 794 lines)_:
  - [x] Deploy smart wallet (CREATE2 via AgentAccountFactory)
  - [x] Register ERC-8004 identity + privacy sidecar commitment
  - [ ] Generate ZK membership proof (using WS-1 SDK) _(circuit keys not compiled yet)_
  - [x] Post bond (USDC transfer via UserOp)
  - [x] Join auction (signed EIP-712 + ZK proof → DO)
  - [x] Place bids
  - [x] Receive inclusion receipts
- [x] Frontend: settlement verification page _(frontend/src/app/auctions/[id]/settlement/)_
- [ ] Frontend: ZK proof status indicators _(ZK stubs mean no real proof status to show)_
- [ ] Run full demo flow with 3+ simulated agents

### Day 9-10: Polish + Submit

**WS-1:** [x] Review crypto correctness _(security review done)_, [ ] write ZK section of README
**WS-2:** [x] Review contract security _(3-round review)_, [x] write contracts + CRE section of README
**WS-3:** [ ] Record demo video (3-5 min), [ ] finalize UI, [x] write engine section of README

**All together:** [x] Final README _(comprehensive, kept up to date)_, [ ] submission package

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
