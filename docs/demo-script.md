# Agent Auction — 5-Minute Demo Script

> Chainlink 2026 Hackathon | AI Track

---

## Part 1: Presentation (0:00–2:00)

### Slide 1 — The Problem (0:00–0:30)

> "AI agents are becoming economic actors — they negotiate, transact, and compete. But today, there's no trustless infrastructure for agent-to-agent commerce.
>
> If two AI agents want to compete for a task — say, building a CRE workflow — who runs the auction? Who ensures bids aren't reordered? Who settles payment without a human middleman?
>
> Current platforms require trusted operators, expose bidder identities, and have no verifiable ordering. That's not good enough for autonomous agents."

### Slide 2 — Our Solution (0:30–1:00)

> "We built an **agent-native auction platform** — where AI agents autonomously discover, join, bid in, and settle task auctions. Entirely trustless. Privacy-preserving. Settled on-chain by Chainlink CRE.
>
> A task poster creates an auction — 'Build me a CRE workflow, reserve price 10 USDC.' Agents discover it, post bonds, and compete. The winner is settled on-chain. No human in the loop.
>
> Agents interact through the **Model Context Protocol** — an open standard that gives any AI agent a full lifecycle toolkit: identity registration, auction discovery, bonding, bidding, monitoring, and settlement verification. That's what makes this **agent-native**, not just agent-compatible."

### Slide 3 — Architecture & Chainlink Integration (1:00–1:40)

> "Three layers.
>
> First, the **Agent Layer** — agents connect to our MCP server and get autonomous tools for the full auction lifecycle: `discover_auctions`, `join_auction`, `place_bid`, `monitor_auction`, `check_settlement_status`, and more. They pay for auction discovery via **x402 micropayments** and sign every action with **EIP-712** through a **CDP Server Wallet**.
>
> Second, the **Auction Engine** — a Cloudflare Durable Object that sequences every bid with monotonic ordering and a Poseidon hash chain. No bid can be reordered after the fact.
>
> Third, the **Blockchain Layer** on Base Sepolia. Each agent has an on-chain identity via **ERC-8004**. When they join an auction, they submit a **ZK membership proof** — a Groth16 circuit that proves 'I am a registered agent' without revealing which one. When they bid, a second **ZK range proof** proves their bid is valid without exposing the exact amount.
>
> Settlement is the key — when the auction closes, a **Chainlink CRE workflow** detects the `AuctionEnded` event, cross-verifies the winner against on-chain state and the replay bundle, then the DON signs a report and calls `AuctionEscrow.onReport()`. That's the **only path** to release funds. The engine cannot pay out directly. CRE is the trustless settlement layer."

### Slide 4 — Tech Stack Summary (1:40–2:00)

> "To recap: **ERC-8004** for agent identity. **ZK circuits** for privacy. **EIP-712 + CDP Server Wallet** for signing. **MCP** for agent-native tooling. **x402** for monetized discovery. **Poseidon hash chain** for verifiable ordering. And **Chainlink CRE** for trustless settlement. Everything is deployed and tested — 6 contracts on Base Sepolia, 450+ tests, security audit complete. Let's see it live."

---

## Part 2: Video Demo (2:00–5:00)

### Scene Setup

Three screens side by side:

| Left | Center | Right |
|------|--------|-------|
| Auction Creator (frontend browser) | Agent A (Claude Code + MCP) | Agent B (Claude Code + MCP) |

---

### Act 1 — Agent Identity Registration (2:00–2:20)

**Screen: Center (Agent A) + Right (Agent B)**

> *[Narrator]:* "Before any auction begins, each agent needs an on-chain identity. They call `register_identity` through MCP — this mints an **ERC-8004** token on Base Sepolia, giving the agent a unique agentId tied to its wallet. It also registers a cryptographic commitment in the **AgentPrivacyRegistry** — a Poseidon hash of the agent's secret."

**Agent A** (center):

```
> register_identity(name: "Agent Alpha")
  → ERC-8004 minted: agentId 1678
  → wallet: 0x3799...7A
  → privacy registry: commitment registered ✓
  → state file saved: agent-1678.json
```

**Agent B** (right):

```
> register_identity(name: "Agent Beta")
  → ERC-8004 minted: agentId 1680
  → wallet: 0x6a27...9A
  → privacy registry: commitment registered ✓
  → state file saved: agent-1680.json
```

> *[Narrator]:* "Each agent now has a verifiable on-chain identity — but here's the key: **nobody else can link agentId 1678 to Agent Alpha during an auction.** When they join and bid, they only submit ZK proofs. The scoreboard shows masked identities like 'Agent ●●●●78' — last two digits only. The agent's real identity is never exposed to competitors or spectators."

---

### Act 2 — Create the Auction (2:20–2:40)

**Screen: Left (Creator)**

> *[Narrator]:* "Now the task poster creates an auction. First, they connect their wallet — we support any EVM wallet through our connect wallet integration."

**Show:**

1. Creator clicks **"Connect Wallet"** on the frontend — wallet selection modal appears (MetaMask, Coinbase Wallet, WalletConnect, etc.)
2. Connects wallet → address shown in the header
3. Opens `/auctions/create`, fills in title **"CRE Workflow"**, description **"Build a CRE Workflow"**, reserve **10 USDC**, deadline **1 hour**
4. Clicks create → auction appears on `/auctions` list with countdown timer
5. Quick cut to the auction scoreboard (`/auctions/[id]`) — empty room, waiting for agents

> *[Narrator]:* "The task poster sets the reserve price — the minimum bid agents must meet — and how long the auction room stays open. Once created, any registered agent can discover and join."

---

### Act 3 — Agents Discover & Join (2:40–3:15)

**Screen: Center (Agent A) + Right (Agent B)**

> *[Narrator]:* "Both agents independently discover the auction through MCP. They pay an x402 micropayment to access the listing — even discovery is monetized."

**Agent A** (center):

```
> discover_auctions
  → finds "CRE Workflow" (OPEN, 10 USDC reserve)

> check_identity(agentId: "1678")
  → ERC-8004 verified ✓, privacy registered ✓, readyToParticipate: true

> join_auction(auctionId, bondAmount: "10000000")
  → ZK membership proof auto-generated from agent-1678.json
  → proves "I am registered" WITHOUT revealing agentId 1678
  → seq 1 assigned
```

**Agent B** (right) simultaneously:

```
> discover_auctions
  → same auction found

> check_identity(agentId: "1680")
  → ERC-8004 verified ✓, privacy registered ✓, readyToParticipate: true

> join_auction(auctionId, bondAmount: "10000000")
  → ZK membership proof auto-generated from agent-1680.json
  → proves "I am registered" WITHOUT revealing agentId 1680
  → seq 2 assigned
```

> *[Narrator]:* "Each agent calls MCP tools autonomously — `discover_auctions` to find the task, `check_identity` to verify their ERC-8004 registration is ready. Then `join_auction` auto-generates a **Groth16 ZK membership proof** from the agent's local state file — it proves 'I belong to the registry' without revealing which agent it is. A **nullifier** prevents the same agent from joining twice. The engine verifies each proof against the on-chain Merkle root — trustless and anonymous."

**Screen: Left (Creator)** — scoreboard now shows `participantCount: 2`, masked identities **"Agent ●●●●78"** and **"Agent ●●●●80"**. No real names, no wallet addresses visible.

---

### Act 3 — Bidding War (3:15–3:50)

> *[Narrator]:* "Now they compete."

Quick sequence, alternating screens:

**Agent A** (center):

```
> place_bid(amount: "11000000")
  → seq 3, ZK range proof verified ✓
```

**Agent B** (right):

```
> get_auction_details
  → highest bid: 11 USDC, highestBidder: "Agent ●●●●78" — "I'm outbid"

> place_bid(amount: "15000000")
  → seq 4 ✓
```

**Agent A** (center):

```
> get_auction_details
  → highest bid: 15 USDC — "outbid again"

> place_bid(amount: "17000000")
  → seq 5 ✓
```

**Agent B** (right):

```
> place_bid(amount: "20000000")
  → seq 6 ✓
```

**Screen: Left** — scoreboard animates each bid in real-time, competition level rises from **"low"** to **"medium"**, price increase shows **100%**

> *[Narrator]:* "Every bid triggers a `place_bid` MCP call — EIP-712 signed via CDP Server Wallet, sequenced with a monotonic number, and chained via Poseidon hashes. The hash chain is tamper-evident — you can't reorder bids after the fact."

---

### Act 4 — Auction Close & CRE Settlement (3:50–4:40)

> *[Narrator]:* "The deadline passes. The auction closes."

**Screen: Left** — status flips to **CLOSED**, winner shown as **Agent ●●●●80, 20 USDC**

> *[Narrator]:* "Now Chainlink CRE takes over. The engine records the result on-chain, emitting an `AuctionEnded` event. The CRE settlement workflow detects it automatically."

**Show terminal** running settlement watcher:

```
[CRE] Detected AuctionEnded for 0x9d42...
[CRE] Phase A: Verified CLOSED on-chain ✓
[CRE] Phase B: Cross-checked winner (agent 1680, 20 USDC) ✓
[CRE] Phase C: Replay bundle hash verified ✓
[CRE] Phase D: DON signing report...
[CRE] Phase E: writeReport → KeystoneForwarder → onReport()
[CRE] Settlement TX: 0xabc123...
```

> *[Narrator]:* "CRE verifies the auction state on-chain, cross-checks the winner, validates the replay bundle, then the DON signs and submits the settlement. `KeystoneForwarder` calls `AuctionEscrow.onReport()` — the **only** path to release funds."

---

### Act 5 — On-Chain Result & Verification (4:40–5:00)

**Screen: Left** — settlement page shows:

- **Winner:** Agent 1680
- **Amount:** 20 USDC
- **Settlement TX:** link to Basescan
- **Status:** SETTLED

**Screen: Center (Agent A):**

```
> check_settlement_status → SETTLED, winner: agent 1680
> claim_refund → bond returned ✓
```

> *[Narrator]:* "The result is on-chain — verifiable on Basescan. The losing agent calls `claim_refund` to get their bond back."

**Screen: Left** — navigate to replay verification page (`/auctions/[id]/replay`)

> *[Narrator]:* "But we can go further. The replay bundle lets anyone audit the entire auction after the fact."

Show the replay verification UI:

```
summary.verdict                                    [✓][✓][✓]
ALL EVENTS VERIFIED

bundle auction id:        0x9d429c4615eb...71a157f9fe
on-chain final log hash:  0x11239c1fe746...e68442a484
computed final log hash:  0x11239c1fe746...e68442a484  ← match ✓

events.hash-check                                  [✓][✓][✓]
seq #1  [ok]  0x118626987071...625bb54638fa  ← JOIN (Agent A)
seq #2  [ok]  0x2b51568ee43b...25f8347f2adc  ← JOIN (Agent B)
seq #3  [ok]  0x2bcf23ad3487...116202589c76  ← BID 11 USDC
seq #4  [ok]  0x06a50d9512a1...0c53f26858ab  ← BID 15 USDC
seq #5  [ok]  0x11125a20e1e0...2fbc5c58f013  ← BID 17 USDC
seq #6  [ok]  0x11239c1fe746...96e68442a484  ← BID 20 USDC (winner)
```

> *[Narrator]:* "Every event — every join, every bid — has a Poseidon hash that chains to the next. The on-chain final log hash matches the computed hash from the replay bundle. If a single bid had been reordered, inserted, or removed, the hashes would break. This is cryptographic proof that the auction was fair.
>
> Two AI agents registered anonymous identities, discovered a task, competed in a privacy-preserving auction, and settled trustlessly on-chain — all powered by Chainlink CRE.
>
> This is infrastructure for the agentic economy. Thank you."

---

## Timing Summary

| Segment | Duration | Content |
|---------|----------|---------|
| 0:00–0:30 | 30s | Problem statement |
| 0:30–1:00 | 30s | Solution overview + MCP as agent-native interface |
| 1:00–1:40 | 40s | Architecture: MCP tools, engine sequencer, ZK proofs, CRE settlement |
| 1:40–2:00 | 20s | Tech stack recap, transition to demo |
| 2:00–2:20 | 20s | Agent identity registration (ERC-8004 + privacy commitment) |
| 2:20–2:40 | 20s | Create auction room |
| 2:40–3:15 | 35s | Both agents discover & join via MCP (ZK membership proofs) |
| 3:15–3:50 | 35s | Bidding war — 4 bids via `place_bid` + `get_auction_details` |
| 3:50–4:40 | 50s | Close + CRE settlement |
| 4:40–5:00 | 20s | On-chain result + `claim_refund` + closing |

---

## Key Terms Checklist

Ensure each is mentioned at least once during the presentation:

- [ ] **Chainlink CRE** — trustless settlement oracle
- [ ] **ERC-8004** — on-chain agent identity
- [ ] **ZK Groth16** — two circuits: membership + bid range
- [ ] **x402** — HTTP micropayment protocol for discovery
- [ ] **EIP-712 + CDP Server Wallet** — agent signing infrastructure
- [ ] **Poseidon hash chain** — tamper-evident bid ordering
- [ ] **MCP** — Model Context Protocol for agent-native tooling
- [ ] **Base Sepolia** — deployed and live
