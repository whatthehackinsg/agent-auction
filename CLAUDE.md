# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repository Is

**Chainlink 2026 Hackathon** project: an **agent-native auction platform** where AI agents autonomously discover, join, bid in, and settle auctions — with on-chain USDC escrow, verifiable event ordering, and CRE-based trustless settlement.

**Current stage**: Contracts deployed & tested (117 tests) → security audit complete (9 findings fixed) → deployed to Base Sepolia → CRE E2E settlement confirmed on-chain (`transmissionSuccess=true`) → engine + frontend integration in progress.

## Build, Test, and Lint

- Do not write hardcoded thing in the codebase. If you need to add a new feature, write it in a way that is reusable and configurable.
- Always find the true parameter passing and function call chain for the feature you are working on. Do not add new parameters or calls without fully understanding the existing flow.

```bash
# Smart contracts (Foundry — solc 0.8.24, Cancun EVM, optimizer 200 runs)
cd contracts
forge build                          # Compile all contracts
forge test                           # Run all 117 tests
forge test --match-contract Escrow   # Run a specific test suite
forge test --match-test testDeposit  # Run a single test
forge test -vvv                      # Verbose with stack traces
forge fmt                            # Format Solidity code
forge snapshot                       # Gas snapshots

# CRE settlement workflow (Bun runtime)
cd cre
bun test                             # Run 9 unit tests
bun run scripts/settlement-watcher.ts  # Auto-detect AuctionEnded & trigger CRE simulate

# Engine (Cloudflare Workers + Durable Objects)
cd engine
npm run typecheck                    # TypeScript type check
npm run test                         # Run all tests (Vitest + Miniflare)
npm run test:watch                   # Watch mode
npm run dev                          # Local dev server (wrangler)
npm run deploy                       # Deploy to Cloudflare

# Frontend (Next.js 16 + React 19 + Tailwind v4)
cd frontend
npm run dev                          # Dev server
npm run build                        # Production build
npm run lint                         # ESLint

# Shared crypto library
cd packages/crypto
npm run build                        # Compile TypeScript
npm test                             # Run 56 tests (requires --experimental-vm-modules)

# Agent client
cd agent-client
npm run typecheck                    # Type check
npm run start                        # Run demo
```

## Test
- Use real interactions and state where possible; avoid over-mocking.
- Write real unit tests for all new logic.
- Use mocks and stubs judiciously; prefer real interactions where feasible.

## Architecture Overview

Three-layer hybrid system:
```
Agent Layer (MCP / HTTP REST)
    ↓ EIP-712 signed actions + ZK proofs
Auction Engine (Cloudflare Workers + Durable Objects)
    ↓ recordResult TX → AuctionEnded event
Blockchain (Base Sepolia)
    ↓ AuctionEnded event triggers CRE
CRE Workflow (Chainlink Runtime Environment)
    ↓ verify → sign → writeReport
AuctionEscrow.onReport() → settlement
```

**Settlement is always CRE-mediated** — the engine records results on-chain, but only CRE's `onReport()` via KeystoneForwarder can release escrow funds.

## Module Map

| Directory | Runtime | Purpose |
|---|---|---|
| `contracts/` | Foundry/Solidity | 7 contracts: identity (EIP-4337), auctions, escrow, privacy |
| `cre/` | Bun + CRE SDK | Settlement workflow triggered by `AuctionEnded` log event |
| `engine/` | Cloudflare Workers | Durable Object sequencer, event log, API (Hono), D1, x402 micropayments |
| `frontend/` | Next.js 16 | Spectator UI (read-only auction state, replay, 3D/GSAP animations) |
| `agent-client/` | Node/tsx | TypeScript demo client with x402 auto-payment (`@x402/fetch`) |
| `packages/crypto/` | Node (ESM) | Poseidon hash chain, EIP-712, ZK proof gen/verify, nullifiers |
| `circuits/` | Circom 2.2.3 | Two Groth16 circuits: RegistryMembership (~12K), BidRange (~5K) |

## Smart Contracts (`contracts/src/`)

| Contract | Role |
|---|---|
| `AgentAccount.sol` | EIP-4337 smart wallet (secp256k1 runtime signer) |
| `AgentAccountFactory.sol` | CREATE2 deterministic deployment factory |
| `AgentPaymaster.sol` | Gas sponsorship (bond-deposit + non-bond modes) |
| `AuctionRegistry.sol` | Lifecycle state machine: OPEN → CLOSED → SETTLED/CANCELLED |
| `AuctionEscrow.sol` | USDC bonds + CRE settlement via `IReceiver.onReport()` |
| `AgentPrivacyRegistry.sol` | ZK membership Merkle root + nullifier tracking |
| `MockKeystoneForwarder.sol` | Test helper simulating Chainlink KeystoneForwarder |

Target chain: **Base Sepolia** (chainId 84532). EntryPoint v0.7 (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`).

## Engine Internals

- **Durable Object** (`AuctionRoom`): core sequencer assigning monotonic `seq` numbers, maintains Poseidon hash chain event log
- **Hono** HTTP framework for API routes
- **D1** (SQLite) for persistent auction metadata
- **Crypto delegation**: keccak256 hash chain (CF Workers compatible); real snarkjs.groth16.verify for ZK proofs with inlined vkey. `ENGINE_REQUIRE_PROOFS=true` enforces mandatory ZK proofs on JOIN. `ENGINE_ALLOW_INSECURE_STUBS=true` bypasses EIP-712 sig checks (local dev only — stubs fail-closed by default)
- **EIP-4337 bundler**: Pimlico (`api.pimlico.io/v2/84532/rpc`)

## CRE Settlement Flow

Trigger: `AuctionEnded` event → Phase A: verify CLOSED on-chain → Phase B: cross-check winner (agentId, wallet, finalPrice) → Phase C: fetch replay bundle from engine → Phase D: DON signs report → Phase E: `writeReport` → `KeystoneForwarder` → `AuctionEscrow.onReport()`.

Report encoding: `abi.encode(bytes32 auctionId, uint256 winnerAgentId, address winnerWallet, uint256 amount)`.

### CRE Config

Two configs in `cre/workflows/settlement/`:

| File | Mode | `useFinalized` | Use |
|---|---|---|---|
| `config.json` | Simulation | `false` | `cre workflow simulate` / settlement watcher |
| `config.production.json` | Deployed DON | `true` | `cre workflow deploy` |

`useFinalized=true` reads at `LAST_FINALIZED_BLOCK_NUMBER` (required for DON consensus). `useFinalized=false` reads at latest block (avoids L2 finality lag in simulator). `isTestnet` controls `getNetwork()` — set `"false"` for mainnet.

Settlement watcher (local auto-trigger): `cd cre && bun run scripts/settlement-watcher.ts`

Project-level RPC config: `cre/project.yaml`.

## Key Documentation

- **Source of truth**: `docs/full_contract_arch(amended).md`
- **Deep specs**: `docs/research/agent-auction-architecture/01–06`
- **Developer guide**: `docs/developer-guide.md` (cast examples, TypeScript integration, CRE setup)
- **Per-contract API**: `contracts/docs/` (AgentAccount, AgentPaymaster, AuctionRegistry, AuctionEscrow)
- **Solutions/troubleshooting**: `docs/solutions/`
- **Legacy** (historical, Mandarin): `docs/legacy/`

Each module has its own `AGENTS.md` with local constraints. Apply root `AGENTS.md` first, then the child.

## Deployed Addresses (Base Sepolia)

| Contract | Address |
|---|---|
| AgentAccountFactory | `0x076d3C6c50b72D78be0C5190c392e6e5Ac7FD8aD` |
| AgentPaymaster | `0xd71a4b73737d4E1a9A73662Cf93690AB5A4fE32d` |
| AuctionRegistry (v2) | `0xFEc7a05707AF85C6b248314E20FF8EfF590c3639` |
| AuctionEscrow (v2) | `0x20944f46AB83F7eA40923D7543AF742Da829743c` |
| KeystoneForwarder (real) | `0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5` |
| AgentPrivacyRegistry | `0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff` |
| MockUSDC | `0xfEE786495d165b16dc8e68B6F8281193e041737d` |

Deployer/Sequencer: `0x633ec0e633AA4d8BbCCEa280331A935747416737`. Paymaster funded: 0.01 ETH staked + 0.05 ETH deposited.

## Architecture Invariants (Must Preserve)

1. **Identity**: 3-layer model — Root Controller / Runtime Key / Session Token
2. **Bond path**: EIP-4337 primary; x402 fallback
3. **Settlement**: Always via CRE `onReport()`, never direct payout
4. **Sequencer**: `seq` values monotonic and gap-free per room
5. **Off-chain agents**: Can observe but cannot bid or bond
6. **Runtime signing**: secp256k1, verifiable via EIP-712/ecrecover

## Conventions

- **Design docs** (legacy): Mandarin Chinese
- **All new content** (specs, README, code, AGENTS.md): English
- Protocol names always English: `ERC-8004`, `x402`, `EIP-4337`, `MCP`, `CRE`
- Priority: **P0** = MVP/hackathon, **P1** = advanced, **P2** = production
- Commits: `feat(contracts): add auction escrow settlement` — scopes: `contracts`, `cre`, `engine`, `frontend`, `docs`, `infra`, `research`
- Issue tracking: **bd (beads)** CLI — never markdown TODOs
- Vendor/generated trees are read-only: `contracts/lib/`, `node_modules/`, `contracts/out/`, `contracts/cache/`

## Chainlink References

- CRE Docs: https://docs.chain.link/cre
- Use Cases: https://blog.chain.link/5-ways-to-build-with-cre/
- MCP Server: https://www.npmjs.com/package/@chainlink/mcp-server
- Demos: https://credemos.com/cdf

<!-- gitnexus:start -->
# GitNexus MCP

This project is indexed by GitNexus as **auction-design** (43422 symbols, 137768 relationships, 300 execution flows).

GitNexus provides a knowledge graph over this codebase — call chains, blast radius, execution flows, and semantic search.

## Always Start Here

For any task involving code understanding, debugging, impact analysis, or refactoring, you must:

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `npx gitnexus analyze` in the terminal first.

## Skills

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/refactoring/SKILL.md` |

## Tools Reference

| Tool | What it gives you |
|------|-------------------|
| `query` | Process-grouped code intelligence — execution flows related to a concept |
| `context` | 360-degree symbol view — categorized refs, processes it participates in |
| `impact` | Symbol blast radius — what breaks at depth 1/2/3 with confidence |
| `detect_changes` | Git-diff impact — what do your current changes affect |
| `rename` | Multi-file coordinated rename with confidence-tagged edits |
| `cypher` | Raw graph queries (read `gitnexus://repo/{name}/schema` first) |
| `list_repos` | Discover indexed repos |

## Resources Reference

Lightweight reads (~100-500 tokens) for navigation:

| Resource | Content |
|----------|---------|
| `gitnexus://repo/{name}/context` | Stats, staleness check |
| `gitnexus://repo/{name}/clusters` | All functional areas with cohesion scores |
| `gitnexus://repo/{name}/cluster/{clusterName}` | Area members |
| `gitnexus://repo/{name}/processes` | All execution flows |
| `gitnexus://repo/{name}/process/{processName}` | Step-by-step trace |
| `gitnexus://repo/{name}/schema` | Graph schema for Cypher |

## Graph Schema

**Nodes:** File, Function, Class, Interface, Method, Community, Process
**Edges (via CodeRelation.type):** CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEFINES, MEMBER_OF, STEP_IN_PROCESS

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "myFunc"})
RETURN caller.name, caller.filePath
```

<!-- gitnexus:end -->
