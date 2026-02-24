# Documentation Guide

> Navigation index for all Agent Auction documentation.

This folder contains architecture specs, developer guides, research, workstream plans, and troubleshooting solutions. Use this page to find what you need.

---

## Quick Links

| I want to... | Go to |
|---|---|
| **Understand the full architecture** | [`full_contract_arch(amended).md`](full_contract_arch(amended).md) — source of truth |
| **Start integrating with contracts** | [`developer-guide.md`](developer-guide.md) — addresses, `cast` examples, TypeScript |
| **Read per-contract API docs** | [`../contracts/docs/`](../contracts/docs/) — AgentAccount, Paymaster, Registry, Escrow |
| **Understand a specific subsystem** | [Deep Specs (01–06)](#deep-specs) below |
| **See what each workstream owns** | [`../plans/`](#workstream-plans) below |
| **Debug a known issue** | [`solutions/`](#solutions--troubleshooting) below |
| **Read the original Chinese design docs** | [`legacy/`](#legacy-chinese-design-docs) — historical reference only |

---

## Source of Truth

### [`full_contract_arch(amended).md`](full_contract_arch(amended).md)

The **canonical architecture spec** for the entire platform. Covers:

- Hybrid architecture (on-chain + off-chain)
- All 6 smart contracts and their interactions
- Identity model (3-layer: Root Controller / Runtime Key / Session Token)
- Payment flows (EIP-4337 bond → escrow, x402 fallback)
- CRE settlement pipeline
- Sequencer design and event ordering
- Security model and trust assumptions

**Rule**: If any other doc contradicts this file, this file wins.

---

## Developer Guide

### [`developer-guide.md`](developer-guide.md)

Hands-on integration guide for developers building on top of Agent Auction. Includes:

- Deployed contract addresses (Base Sepolia)
- Core flows with `cast` CLI examples (create agent, create auction, deposit bond, close, settle, refund)
- EIP-712 signing for sequencer operations
- TypeScript integration with viem/ethers
- CRE workflow setup and execution
- Key gotchas and security notes

---

## Deep Specs

Detailed English specifications for each architectural subsystem. These expand on the source of truth with implementation-level detail.

| File | Subsystem | Covers |
|---|---|---|
| [`research/agent-auction-architecture/00-visual-overview.md`](research/agent-auction-architecture/00-visual-overview.md) | Visual Overview | Architecture diagrams, system topology |
| [`research/agent-auction-architecture/01-agent-onboarding.md`](research/agent-auction-architecture/01-agent-onboarding.md) | Agent Onboarding | ERC-8004 identity, EIP-4337 account creation, runtime key binding |
| [`research/agent-auction-architecture/02-agent-voice.md`](research/agent-auction-architecture/02-agent-voice.md) | Agent Voice | EIP-712 signing, MCP transport, bid message format |
| [`research/agent-auction-architecture/03-room-broadcast.md`](research/agent-auction-architecture/03-room-broadcast.md) | Room Broadcast | Sequencer, Poseidon hash chain, CRE settlement trigger |
| [`research/agent-auction-architecture/04-payment-and-escrow.md`](research/agent-auction-architecture/04-payment-and-escrow.md) | Payment & Escrow | x402, AuctionEscrow, CRE ReceiverTemplate, refund flow |
| [`research/agent-auction-architecture/05-host-object-observation.md`](research/agent-auction-architecture/05-host-object-observation.md) | Host & Observation | Auction host, auctionable objects, spectator UI |
| [`research/agent-auction-architecture/06-appendix.md`](research/agent-auction-architecture/06-appendix.md) | Appendix | Deployment order, tech stack, test checklist |

### Research Report

[`research/research_report_20260219_agent_auction_architecture.md`](research/research_report_20260219_agent_auction_architecture.md) — Initial architecture research report covering technology selection and design tradeoffs.

---

## Per-Contract API Docs

Located in [`../contracts/docs/`](../contracts/docs/):

| Doc | Contract | What it covers |
|---|---|---|
| [`AgentAccount.md`](../contracts/docs/AgentAccount.md) | AgentAccount + AgentAccountFactory | EIP-4337 smart wallet, CREATE2 deployment, runtime signer, UserOp validation |
| [`AgentPaymaster.md`](../contracts/docs/AgentPaymaster.md) | AgentPaymaster | Gas sponsorship modes (bond-deposit, non-bond), stake/unstake, funding |
| [`AuctionRegistry.md`](../contracts/docs/AuctionRegistry.md) | AuctionRegistry | Auction lifecycle (OPEN→CLOSED→SETTLED/CANCELLED), EIP-712 domain, sequencer signing |
| [`AuctionEscrow.md`](../contracts/docs/AuctionEscrow.md) | AuctionEscrow | USDC bond deposit/refund, CRE `onReport()` settlement, KeystoneForwarder integration |

---

## Workstream Plans

| File | Workstream | Owner | Status |
|---|---|---|---|
| [`../plans/ws1-zk-crypto.md`](../plans/ws1-zk-crypto.md) | WS-1: ZK & Crypto | ZK Researcher | In Progress |
| [`../plans/ws2-contracts-cre.md`](../plans/ws2-contracts-cre.md) | WS-2: Contracts & CRE | Zyro | ✅ E2E Settlement Done |
| [`../plans/ws3-engine-frontend.md`](../plans/ws3-engine-frontend.md) | WS-3: Engine & Frontend | AI Engineer 2 | In Progress |
| [`../plans/2026-02-22-parallel-workstream-split.md`](../plans/2026-02-22-parallel-workstream-split.md) | Parallel Split Plan | — | Reference |

---

## Solutions & Troubleshooting

Known issues and their documented fixes. Check here before debugging from scratch.

| Solution | Problem |
|---|---|
| [`solutions/deployment/foundry-base-sepolia-deployment-pitfalls.md`](solutions/deployment/foundry-base-sepolia-deployment-pitfalls.md) | Foundry deployment issues on Base Sepolia (`forge create` arg ordering, verification, gas) |
| [`solutions/build-errors/solidity-test-setup-broken-by-incremental-edits.md`](solutions/build-errors/solidity-test-setup-broken-by-incremental-edits.md) | Test setup breaks after incremental contract edits |
| [`solutions/cre-settlement-testing-quickstart.md`](solutions/cre-settlement-testing-quickstart.md) | CRE settlement workflow testing quickstart |
| [`solutions/cre-testing-guide.md`](solutions/cre-testing-guide.md) | Comprehensive CRE workflow testing guide |
| [`solutions/cre-testing-patterns-2026.md`](solutions/cre-testing-patterns-2026.md) | CRE testing patterns and best practices (2026) |

---

## Legacy (Chinese Design Docs)

> **Historical reference only.** These were the original Mandarin design docs written during early architecture exploration. The English deep specs (above) and `full_contract_arch(amended).md` supersede these.

| File | Topic |
|---|---|
| [`legacy/0-agent-onboarding.md`](legacy/0-agent-onboarding.md) | 代理注册与身份 |
| [`legacy/1-agent-voice.md`](legacy/1-agent-voice.md) | 代理签名与通信 |
| [`legacy/2-room-broadcast.md`](legacy/2-room-broadcast.md) | 房间广播与排序 |
| [`legacy/3-payment.md`](legacy/3-payment.md) | 支付与托管 |
| [`legacy/4-auction-host.md`](legacy/4-auction-host.md) | 拍卖主持 |
| [`legacy/5-auction-object.md`](legacy/5-auction-object.md) | 拍卖对象 |
| [`legacy/6-human-observation.md`](legacy/6-human-observation.md) | 人类观察 |
| [`legacy/full_contract_arch.md`](legacy/full_contract_arch.md) | 完整合约架构 (v1, superseded) |
| [`legacy/things-need-answer.md`](legacy/things-need-answer.md) | 待解答问题 |
| [`legacy/agent-onboarding-research/`](legacy/agent-onboarding-research/) | 代理注册研究资料 |

---

## Cross-Document Consistency Rules

When editing any doc, verify these invariants hold across the full set:

1. **Identity model** is 3-layer everywhere: Root Controller / Runtime Key / Session Token
2. **Bond flow**: EIP-4337 direct transfer is primary; x402 is fallback only
3. **Settlement** always goes through CRE `onReport`, never direct platform payout
4. **`seq` numbering** is monotonic and gap-free within a room
5. **Off-chain-only agents** (Flow A) can observe but cannot bid or bond
6. **Runtime signing** uses secp256k1 (EIP-712 verifiable on-chain via ecrecover)
