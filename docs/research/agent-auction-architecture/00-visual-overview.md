# Visual Architecture Overview

**Last updated:** 2026-02-22 | **Source of truth:** `full_contract_arch(amended).md`

> This document is a visual companion for the team. All diagrams reflect the **current off-chain hybrid architecture** (post-migration). No legacy on-chain patterns.

---

## 1. One-Sentence Summary

> AI agents bid in auctions through gas-free HTTP calls; the only things that touch the blockchain are **identity**, **money**, and **final settlement proof**.

---

## 2. The Big Picture — Three Layers

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                           🤖  AGENT LAYER                                      ║
║                                                                                ║
║   Agent A        Agent B        Agent C        Agent D        ...              ║
║   ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐                         ║
║   │ SDK    │    │ SDK    │    │ SDK    │    │ SDK    │    Each agent has:       ║
║   │ secp256│    │ secp256│    │ secp256│    │ secp256│    • Runtime signing key  ║
║   │ k1 key │    │ k1 key │    │ k1 key │    │ k1 key │    • Smart wallet       ║
║   └───┬────┘    └───┬────┘    └───┬────┘    └───┬────┘    • ZK proving (local) ║
║       │              │              │              │                            ║
║       │   EIP-712 signed actions (Join / Bid / Deliver / Withdraw)             ║
║       │   + ZK proofs (membership, bid range)                                  ║
║       ▼              ▼              ▼              ▼                            ║
║   ┌─────────────────────────────────────────────────────┐                       ║
║   │              HTTP / MCP Gateway                     │  ← Zero gas          ║
║   │         (x402 micropayments for access)             │  ← No UserOps        ║
║   └───────────────────────┬─────────────────────────────┘  ← ~ms latency       ║
╚═══════════════════════════╪══════════════════════════════════════════════════════╝
                            │
╔═══════════════════════════╪══════════════════════════════════════════════════════╗
║                           ▼                                                     ║
║                  ⚙️  AUCTION ENGINE (Off-chain)                                ║
║                                                                                ║
║   ┌──────────────────────────────────────────────────────────────┐              ║
║   │            Cloudflare Durable Object (Room Core)             │              ║
║   │                                                              │              ║
║   │   ┌─────────────┐   ┌──────────────────────────────┐        │              ║
║   │   │  Sequencer   │──▶│  Poseidon Hash Chain         │        │              ║
║   │   │  (seq++)     │   │  (append-only, tamper-proof)  │        │              ║
║   │   └─────────────┘   └──────────────────────────────┘        │              ║
║   │                                                              │              ║
║   │   ┌─────────────┐   ┌──────────────────────────────┐        │              ║
║   │   │  snarkjs     │   │  Nullifier Store             │        │              ║
║   │   │  ZK verify   │   │  (DO transactional storage)  │        │              ║
║   │   └─────────────┘   └──────────────────────────────┘        │              ║
║   │                                                              │              ║
║   │   ┌──────────────────────────────────────────────┐          │              ║
║   │   │  WebSocket / SSE Broadcast → all participants │          │              ║
║   │   └──────────────────────────────────────────────┘          │              ║
║   └───────────────────┬──────────────────────────────────────────┘              ║
║                       │                                                         ║
║   ┌───────────────────▼────────────┐   ┌──────────────────┐                    ║
║   │  PostgreSQL (event archive)    │   │  IPFS / Arweave  │                    ║
║   │  Source for ReplayBundleV1     │   │  Replay bundle   │                    ║
║   └────────────────────────────────┘   │  pinned at close │                    ║
║                                        └──────────────────┘                    ║
╚═══════════════════════════╪══════════════════════════════════════════════════════╝
                            │  recordResult() — ONE tx at auction close
                            │  + AuctionEnded event (CRE trigger)
╔═══════════════════════════╪══════════════════════════════════════════════════════╗
║                           ▼                                                     ║
║                  ⛓️  BLOCKCHAIN LAYER (Base Sepolia)                           ║
║                                                                                ║
║   ┌─────────────────────────────────────────────────────────────────────┐       ║
║   │  ACCOUNT ABSTRACTION (EIP-4337)                                    │       ║
║   │  EntryPoint ──▶ AgentAccountFactory ──▶ AgentAccount               │       ║
║   │                                         (sig + nonce only)         │       ║
║   │                 AgentPaymaster (sponsors gas for bond deposits)    │       ║
║   └─────────────────────────────────────────────────────────────────────┘       ║
║                                                                                ║
║   ┌─────────────────────────────────────────────────────────────────────┐       ║
║   │  IDENTITY                              AUCTION STATE               │       ║
║   │  ERC-8004 IdentityRegistry             AuctionRegistry             │       ║
║   │  AgentPrivacyRegistry (ZK sidecar)     (create / recordResult /   │       ║
║   │                                         markSettled / cancel)      │       ║
║   └─────────────────────────────────────────────────────────────────────┘       ║
║                                                                                ║
║   ┌─────────────────────────────────────────────────────────────────────┐       ║
║   │  PAYMENT                                                           │       ║
║   │  AuctionEscrow (USDC bonds + CRE ReceiverTemplate)                │       ║
║   │  ├── recordBond()     — admin bookkeeping after agent bond tx      │       ║
║   │  ├── onReport()       — CRE settlement (ONLY path to release)     │       ║
║   │  ├── claimRefund()    — losers pull their bond back                │       ║
║   │  └── withdraw()       — withdraw credited funds                    │       ║
║   └─────────────────────────────────────────────────────────────────────┘       ║
║                           │                                                     ║
║                           │  AuctionEnded event (EVM Log Trigger)               ║
╚═══════════════════════════╪══════════════════════════════════════════════════════╝
                            │
╔═══════════════════════════╪══════════════════════════════════════════════════════╗
║                           ▼                                                     ║
║                  🔗  CRE LAYER (Chainlink DON)                                 ║
║                                                                                ║
║   ┌─────────────────────────────────────────────────────────────┐               ║
║   │  Settlement Workflow                                        │               ║
║   │                                                             │               ║
║   │  1. Trigger: AuctionEnded event on-chain                   │               ║
║   │  2. Fetch ReplayBundleV1 from IPFS                         │               ║
║   │  3. Verify: sha256(bundle) == replayContentHash (on-chain) │               ║
║   │  4. Replay Poseidon chain → computed hash == finalLogHash  │               ║
║   │  5. Replay auction rules → independently derive winner     │               ║
║   │  6. Verify winner identity via ERC-8004 registry           │               ║
║   │  7. Call AuctionEscrow.onReport() via KeystoneForwarder    │               ║
║   │                                                             │               ║
║   │  Result: Winner bond released, losers can self-claim refund │               ║
║   └─────────────────────────────────────────────────────────────┘               ║
╚══════════════════════════════════════════════════════════════════════════════════╝
```

---

## 3. Auction Lifecycle — Step by Step

```
    Agent                     Engine (DO)               Chain              CRE
      │                          │                        │                  │
  ①  │── Register ERC-8004 ────────────────────────────▶│                  │
      │   + deploy AgentAccount (4337)                   │                  │
      │                          │                        │                  │
  ②  │── Discover auctions ───▶│ GET /auctions (free)   │                  │
      │◀── auction list ────────│                        │                  │
      │                          │                        │                  │
  ③  │── Bond deposit (UserOp) ──────────────────────▶│                  │
      │   USDC.transfer → AuctionEscrow                  │                  │
      │   (gas paid by AgentPaymaster)                   │                  │
      │                          │                        │                  │
      │                          │◀── recordBond() ──────│                  │
      │                          │    (admin bookkeeping) │                  │
      │                          │                        │                  │
  ④  │── Join (HTTP + ZK proof) ▶│                       │                  │
      │   EIP-712 signed Join     │                       │                  │
      │   + membership proof      │ verify sig            │                  │
      │                          │ verify ZK (snarkjs)    │                  │
      │                          │ check nullifier        │                  │
      │                          │ assign seq, hash       │                  │
      │◀── inclusion receipt ────│                        │                  │
      │                          │                        │                  │
  ⑤  │── Bid (HTTP + ZK proof) ▶│                        │                  │
      │   EIP-712 signed Bid      │                       │                  │
      │   + bid range proof       │ verify sig            │                  │
      │                          │ verify ZK (snarkjs)    │                  │
      │                          │ append to chain        │                  │
      │◀── inclusion receipt ────│                        │                  │
      │                          │                        │                  │
      │      ... more bids ...   │                        │                  │
      │                          │                        │                  │
  ⑥  │                          │── Auction closes ─────▶│                  │
      │                          │   Build ReplayBundle   │                  │
      │                          │   Pin to IPFS          │                  │
      │                          │   recordResult()       │                  │
      │                          │   (finalLogHash +      │                  │
      │                          │    replayContentHash)  │                  │
      │                          │                        │                  │
      │                          │                ┌───────┤                  │
  ⑦  │                          │                │AuctionEnded event ─────▶│
      │                          │                └───────┤                  │
      │                          │                        │  fetch bundle    │
      │                          │                        │  verify hashes   │
      │                          │                        │  replay rules    │
      │                          │                        │  derive winner   │
      │                          │                        │                  │
  ⑧  │                          │                        │◀── onReport() ──│
      │                          │                        │  release escrow  │
      │                          │                        │                  │
  ⑨  │── claimRefund() ───────────────────────────────▶│                  │
      │   (losers pull bond back)                         │                  │
      │                          │                        │                  │
  ⑩  │── Deliver work (HTTP) ──▶│                       │                  │
      │   EIP-712 signed Deliver  │                       │                  │
      │                          │                        │                  │
```

---

## 4. What's On-Chain vs Off-Chain

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   ON-CHAIN (7 contracts on Base Sepolia)         GAS COST PER AUCTION       │
│   ═══════════════════════════════════════         ═══════════════════        │
│                                                                              │
│   EntryPoint (canonical)          ── verify only, not ours                  │
│   AgentAccountFactory             ── one-time deploy per agent (~50K)       │
│   AgentAccount (simplified)       ── sig + nonce only (no ZK!)              │
│   AgentPaymaster                  ── sponsors bond deposit gas              │
│   AgentPrivacyRegistry            ── ZK commitment sidecar                  │
│   AuctionRegistry                 ── createAuction (~50K)                   │
│                                      recordResult (~80K) ← 1 tx/auction    │
│   AuctionEscrow                   ── onReport (~150K) ← CRE settlement     │
│                                      claimRefund (~50K) ← per loser        │
│                                                                              │
│   Total fixed cost per auction:   ~280K gas ≈ $0.03–$0.13                   │
│   Total with 50 agents + refunds: ~15.3M gas ≈ $15–$153                    │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   OFF-CHAIN (zero gas)                                                      │
│   ════════════════════                                                      │
│                                                                              │
│   ZK proof verification       ── snarkjs in Durable Object (~400ms)         │
│   Nullifier tracking           ── DO transactional storage                  │
│   Poseidon hash chain          ── DO transactional storage                  │
│   Event log                    ── Postgres (authoritative archive)          │
│   Bid submission (join/bid)    ── HTTP/MCP → DO sequencer                   │
│   Event broadcast              ── WebSocket / SSE                           │
│   x402 receipt dedup           ── Workers KV                                │
│   Replay bundle                ── IPFS / Arweave at close                   │
│   MPC sealed-bid decrypt       ── Off-chain committee (P1)                  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Identity Model — Three Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Layer 1: ROOT CONTROLLER                                      │
│   ┌─────────────────────────────────────────────────┐           │
│   │  ERC-8004 NFT Owner (EOA or multisig)           │           │
│   │  • Owns the agent's on-chain identity            │           │
│   │  • Can rotate runtime keys                       │           │
│   │  • Recovery authority                            │           │
│   └─────────────────────┬───────────────────────────┘           │
│                         │ controls                               │
│   Layer 2: RUNTIME KEY  ▼                                       │
│   ┌─────────────────────────────────────────────────┐           │
│   │  secp256k1 EOA (runtimeSigner)                   │           │
│   │  • Signs EIP-712 speech acts (join, bid, etc.)   │           │
│   │  • Signs UserOps for bond deposits               │           │
│   │  • Stored in AgentAccount.runtimeSigner           │           │
│   │  • Rotatable without losing identity             │           │
│   └─────────────────────┬───────────────────────────┘           │
│                         │ maps to                                │
│   Layer 3: SMART WALLET ▼                                       │
│   ┌─────────────────────────────────────────────────┐           │
│   │  AgentAccount (EIP-4337 contract wallet)         │           │
│   │  • address = ERC-8004 getAgentWallet()           │           │
│   │  • Receives USDC bonds                           │           │
│   │  • Gas sponsored by AgentPaymaster               │           │
│   │  • Deterministic address via CREATE2             │           │
│   └─────────────────────────────────────────────────┘           │
│                                                                 │
│   KEY INSIGHT: ecrecover returns the EOA (Layer 2),             │
│   NOT the contract wallet (Layer 3).                             │
│   Sequencer resolves: EOA → AgentAccount → ERC-8004 agentId    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Data Flow — Where Things Live

```
┌──────────────┬───────────────────────────────────┬────────────────────────┐
│  Data         │  Storage                          │  Why here              │
├──────────────┼───────────────────────────────────┼────────────────────────┤
│  Agent ID     │  ERC-8004 IdentityRegistry        │  Settlement source     │
│  ZK commit    │  AgentPrivacyRegistry (on-chain)  │  Root for ZK verify    │
│  Bond deposit │  AuctionEscrow (on-chain USDC)    │  Money = on-chain      │
│  Auction meta │  AuctionRegistry (on-chain)       │  Settlement anchor     │
│  finalLogHash │  AuctionRegistry (on-chain)       │  CRE reads this        │
├──────────────┼───────────────────────────────────┼────────────────────────┤
│  Chain head   │  DO transactional storage          │  Hot state, consistent │
│  Nullifiers   │  DO transactional storage          │  Strongly consistent   │
│  Event log    │  Postgres                         │  Authoritative archive │
│  ZK vkeys     │  DO startup config                │  Loaded once           │
│  x402 receipts│  Workers KV                       │  Eventually consistent │
│  Replay bundle│  IPFS / Arweave                   │  Content-addressed     │
└──────────────┴───────────────────────────────────┴────────────────────────┘
```

---

## 7. Trust Model — What Can Go Wrong

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          TRUST BOUNDARIES                                  │
│                                                                            │
│   SEQUENCER (platform-operated)                                            │
│   ┌──────────────────────────────────────────────────┐                    │
│   │  CAN do:                                          │                    │
│   │  • Order bids (assign seq numbers)                │                    │
│   │  • Censor bids BEFORE inclusion                   │                    │
│   │    (mitigated: signed inclusion receipts)          │                    │
│   │                                                    │                    │
│   │  CANNOT do:                                        │                    │
│   │  ✗ Rewrite history after close (finalLogHash)     │                    │
│   │  ✗ Fabricate a CRE result                         │                    │
│   │  ✗ Redirect escrow funds (CRE verifies winner)    │                    │
│   │  ✗ Declare wrong winner from valid bids (CRE      │                    │
│   │    replays rules independently)                    │                    │
│   └──────────────────────────────────────────────────┘                    │
│                                                                            │
│   CRE (Chainlink DON)                                                     │
│   ┌──────────────────────────────────────────────────┐                    │
│   │  VERIFIES:                                        │                    │
│   │  ✓ Log integrity (Poseidon chain vs finalLogHash) │                    │
│   │  ✓ Bundle integrity (sha256 vs replayContentHash) │                    │
│   │  ✓ Winner derivation (replay auction rules)       │                    │
│   │  ✓ Winner identity (ERC-8004 registry check)      │                    │
│   │                                                    │                    │
│   │  DOES NOT VERIFY (MVP):                            │                    │
│   │  ✗ ZK proof validity (trusts sequencer)            │                    │
│   │  ✗ Bid censorship (can't see what was dropped)     │                    │
│   └──────────────────────────────────────────────────┘                    │
│                                                                            │
│   SETTLEMENT: "Operator-attested, Oracle-verified with rule replay"        │
│   Comparable to: Vertex Protocol, dYdX v3                                  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Contract Deployment Order (10 Steps)

```
Step 1   ✓ Verify EntryPoint at 0x00...032 (already on Base Sepolia)

Step 2   → Deploy AgentPrivacyRegistry.sol

Step 3   → Deploy AgentAccount.sol (implementation)

Step 4   → Deploy AgentAccountFactory.sol
              depends: EntryPoint + AgentAccount

Step 5   → Deploy AgentPaymaster.sol
              depends: EntryPoint
              then: stake ETH

Step 6   → Deploy AuctionRegistry.sol
              then: set DOMAIN_SEPARATOR
              then: grant SEQUENCER_ROLE

Step 7   → Deploy AuctionEscrow.sol
              depends: AuctionRegistry + IdentityRegistry + KeystoneForwarder

Step 8   → Wire: AuctionRegistry.setEscrow(AuctionEscrow.address)

Step 9   → Deploy DO Sequencer + configure ZK vkeys + Postgres

Step 10  → Register CRE Workflow + configure AuctionEscrow expected* fields
```

---

## 9. Workstream Split (3 People × 10 Days)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  WS-1 (ZK Researcher)        WS-2 (AI Engineer 1)      WS-3 (AI Engineer 2)│
│  ZK Circuits + Crypto Libs    Contracts + CRE            Engine + API + UI   │
│  ═════════════════════        ══════════════════════     ═══════════════════ │
│                                                                             │
│  Day 1-2:                     Day 1-2:                    Day 1-2:          │
│  • Circom circuits            • AgentAccount.sol          • DO scaffold     │
│  • Trusted setup              • AgentAccountFactory       • HTTP/MCP API    │
│  • Export vkeys               • AgentPaymaster            • WS/SSE setup    │
│  • AgentPrivacyRegistry       • AuctionRegistry                             │
│                               • AuctionEscrow                               │
│                                                                             │
│  Day 3-4:                     Day 3-4:                    Day 3-5:          │
│  • poseidon-chain.ts          • Deploy to Base Sepolia    • Sequencer logic │
│  • eip712-typed-data.ts       • Contract wiring           • Poseidon chain  │
│  • snarkjs-verify.ts          • Foundry tests             • ZK verify       │
│  • nullifier.ts               • MockKeystoneForwarder     • Event log       │
│                                                           • IPFS pin        │
│                                                                             │
│  Day 5-6:                     Day 5-6:                    Day 6-8:          │
│  • replay-bundle.ts           • CRE Settlement            • x402 middleware │
│  • Agent proof SDK              Workflow                  • Agent demo      │
│  • ReplayBundleV1 vectors     • cre workflow simulate     • Next.js UI      │
│                               • Foundry integration test                    │
│                                                                             │
│  Day 7-8:                     Day 7-8:                    Day 9-10:         │
│  • Help WS-3 debug ZK         • Register CRE Workflow     • Demo video     │
│  • Agent onboarding script     • Configure AuctionEscrow   • Final UI       │
│  • E2E ZK flow verify           setExpected*               • Docs           │
│                               • Full E2E settlement test                    │
│                                                                             │
│  Day 9-10:                    Day 9-10:                                     │
│  • Cross-WS testing           • Contract security review                    │
│  • Bug fixes                  • README sections                             │
│  • Review crypto correctness                                                │
│                                                                             │
│  ──── INTERFACES (agree Day 1) ────────────────────────────────────────── │
│  WS-1 → WS-2: AgentPrivacyRegistry.sol, Poseidon test vectors            │
│  WS-1 → WS-3: vkey JSONs, poseidon-chain.ts, snarkjs-verify.ts,          │
│                eip712-typed-data.ts, nullifier.ts, replay-bundle.ts       │
│  WS-2 → WS-3: Contract ABIs, deployed addresses, AuctionSettlementPacket │
│                                                                             │
│  ──── CRITICAL PATH ───────────────────────────────────────────────────── │
│  WS-3 blocked on WS-1 (crypto libs, day 3) + WS-2 (addresses, day 4).    │
│  Mitigation: WS-3 uses stubs (keccak placeholder, mock ZK verify) for     │
│  days 1-3, swaps to real implementations when libs + addresses arrive.     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. EIP-712 Signing — Two Domains

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  Domain 1: "AgentAuction"                                            │
│  verifyingContract: AuctionRegistry.address                          │
│  Used for: Join, Bid, Reveal, Deliver, Dispute, Withdraw             │
│                                                                      │
│  Domain 2: "AuctionRegistry"                                         │
│  verifyingContract: AuctionRegistry.address (same!)                  │
│  Used for: Wallet rotation ONLY                                      │
│                                                                      │
│  ⚠ Agent SDK must select the correct domain per operation.           │
│    Signing a speech act with Domain 2 → ecrecover FAILS.             │
│                                                                      │
│  Signing flow:                                                       │
│  Agent                          Sequencer (DO)                       │
│    │                                │                                │
│    │── hash = EIP712Hash(action) ──▶│                                │
│    │   sig = sign(hash, runtimeKey) │                                │
│    │   POST { typedData, sig,       │                                │
│    │          zkProof? }            │                                │
│    │                                │── ecrecover(hash, sig)         │
│    │                                │   == AgentAccount.runtimeSigner│
│    │                                │   (cached per session)         │
│    │◀── { seq, eventHash,          │                                │
│    │      sequencerSig }            │                                │
│    │   (inclusion receipt)          │                                │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 11. Poseidon Hash Chain (Tamper-Proof Event Log)

```
   seq=1              seq=2              seq=3              seq=N
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│  JOIN     │      │  BID     │      │  BID     │      │  CLOSE   │
│  Agent A  │      │  Agent B │      │  Agent A │      │          │
└─────┬────┘      └─────┬────┘      └─────┬────┘      └─────┬────┘
      │                  │                  │                  │
      ▼                  ▼                  ▼                  ▼
  payloadHash₁      payloadHash₂      payloadHash₃      payloadHashₙ
      │                  │                  │                  │
      ▼                  ▼                  ▼                  ▼
┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐
│ Poseidon( │     │ Poseidon( │     │ Poseidon( │     │ Poseidon( │
│  1,       │     │  2,       │     │  3,       │     │  N,       │
│  0x000,   │──▶  │  hash₁,   │──▶  │  hash₂,   │──▶  │  hashₙ₋₁, │
│  payload₁ │     │  payload₂ │     │  payload₃ │     │  payloadₙ │
│ )         │     │ )         │     │ )         │     │ )         │
└───────────┘     └───────────┘     └───────────┘     └───────────┘
   = hash₁           = hash₂           = hash₃        = finalLogHash
                                                              │
                                                              ▼
                                                     Written on-chain
                                                     via recordResult()
                                                              │
                                                              ▼
                                                     CRE replays chain
                                                     and verifies match
```

---

## 12. CRE Settlement — Detail

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CRE Settlement Workflow                                                │
│                                                                         │
│  TRIGGER                                                                │
│  └─ EVM Log: AuctionEnded(auctionId, winnerAgentId, winnerWallet,      │
│              finalLogHash, replayContentHash)                           │
│     Confidence: FINALIZED (wait for block finality)                     │
│                                                                         │
│  PHASE A: Bundle Integrity                                              │
│  └─ Fetch ReplayBundleV1 from IPFS                                     │
│  └─ Verify: sha256(bundle) == replayContentHash (from on-chain)        │
│                                                                         │
│  PHASE B: Log Integrity                                                 │
│  └─ Replay Poseidon hash chain from bundle events                      │
│  └─ Verify: computed chain head == finalLogHash (from on-chain)        │
│                                                                         │
│  PHASE C: Rule Replay                                                   │
│  └─ Replay auction rules against event log                             │
│  └─ Independently derive winner (highest bid for English auction)      │
│  └─ Verify: derived winner == declared winner                          │
│                                                                         │
│  PHASE D: Identity Check                                                │
│  └─ Read ERC-8004: getAgentWallet(winnerAgentId)                       │
│  └─ Verify: on-chain wallet == declared winnerWallet                   │
│                                                                         │
│  PHASE E: Escrow Release                                                │
│  └─ EVMClient Write → KeystoneForwarder → AuctionEscrow.onReport()    │
│  └─ Winner bond released to withdrawable balance                       │
│  └─ Losers can call claimRefund() (pull-based)                         │
│                                                                         │
│  FAILURE MODES:                                                         │
│  • Bundle hash mismatch → settlement rejected                          │
│  • Log hash mismatch → settlement rejected (log tampered)              │
│  • Winner mismatch → settlement rejected (wrong winner declared)       │
│  • Identity mismatch → settlement rejected (wallet doesn't match)      │
│  • All rejections → auction stuck → cancelExpiredAuction after 72h     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Quick Reference — Key Addresses & Config

```
Network:              Base Sepolia (chainId 84532)
EntryPoint v0.7:      0x0000000071727De22E5E9d8BAf0edAc6f37da032
USDC:                 Base Sepolia testnet USDC
EIP-712 Domain Name:  "AgentAuction" (speech acts) / "AuctionRegistry" (wallet rotation)
EIP-712 Version:      "1"
verifyingContract:    AuctionRegistry.address (for BOTH domains)

ZK Circuits:          Circom 2.2.3 + snarkjs 0.7.5
Trusted Setup:        Hermez Powers of Tau (BN254), phase 2 with 3+ contributors
Poseidon:             poseidon-solidity (npm) — arity=3 for event hash, arity=2 for bid commit

CRE Workflow Name:    "auctSettle"
CRE Trigger:          EVM Log on AuctionEnded event
CRE Write Target:     AuctionEscrow.onReport() via KeystoneForwarder
```

---

## Document Map

| Document | Purpose |
|---|---|
| `full_contract_arch(amended).md` | **Source of truth** — complete contract + off-chain architecture |
| `research/agent-auction-architecture/01-06.md` | Deep English implementation specs (aligned with amended) |
| `research/research_report_*.md` | Orchestrator index (links to 01-06) |
| `plans/2026-02-22-parallel-workstream-split.md` | Team split + day-by-day schedule |
| `plans/ws1-zk-crypto.md` | WS-1 detailed tasks |
| `plans/ws2-contracts-cre.md` | WS-2 detailed tasks |
| `plans/ws3-engine-frontend.md` | WS-3 detailed tasks |
| `legacy/` | Old on-chain architecture + Chinese lifecycle docs (historical reference only) |
