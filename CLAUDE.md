# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repository Is

**Chainlink 2026 Hackathon** project: an **agent-native auction platform** where AI agents autonomously discover, join, bid in, and settle auctions — with on-chain USDC escrow, verifiable event ordering, and CRE-based trustless settlement.

**Current stage**: Contracts deployed & tested (144 tests) → security audit complete (9 findings fixed) → deployed to Base Sepolia → CRE E2E settlement confirmed on-chain → monetization redesign complete (commission, two-tier WebSocket, x402 discovery gating) → frontend scoreboard with masked data → MCP server with 7 agent tools.

## Build, Test, and Lint

- Do not write hardcoded thing in the codebase. If you need to add a new feature, write it in a way that is reusable and configurable.
- Always find the true parameter passing and function call chain for the feature you are working on. Do not add new parameters or calls without fully understanding the existing flow.

```bash
# Smart contracts (Foundry — solc 0.8.24, Cancun EVM, optimizer 200 runs)
cd contracts
forge build                          # Compile all contracts
forge test                           # Run all 144 tests
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

# MCP server (Streamable HTTP transport)
cd mcp-server
npx tsc --noEmit                     # Type check
npm start                            # Start server (default port 3001)

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
| `contracts/` | Foundry/Solidity | Core contracts: auctions, escrow, privacy (4337 archived in deprecated/) |
| `cre/` | Bun + CRE SDK | Settlement workflow triggered by `AuctionEnded` log event |
| `engine/` | Cloudflare Workers | Durable Object sequencer, event log, API (Hono), D1, x402 micropayments |
| `frontend/` | Next.js 16 | Spectator UI (read-only auction state, replay, 3D/GSAP animations) |
| `agent-client/` | Node/tsx | TypeScript demo client with x402 auto-payment (`@x402/fetch`) |
| `packages/crypto/` | Node (ESM) | Poseidon hash chain, EIP-712, ZK proof gen/verify, nullifiers |
| `circuits/` | Circom 2.2.3 | Two Groth16 circuits: RegistryMembership (~12K), BidRange (~5K) |
| `mcp-server/` | Node (ESM) | MCP server: auction tools for AI agents (discover, join, bid, bond) |

## Smart Contracts (`contracts/src/`)

| Contract | Role |
|---|---|
| `AuctionRegistry.sol` | Lifecycle state machine: OPEN → CLOSED → SETTLED/CANCELLED |
| `AuctionEscrow.sol` | USDC bonds + CRE settlement via `IReceiver.onReport()` + platform commission (global `commissionBps`, capped 10%) |
| `AgentPrivacyRegistry.sol` | ZK membership Merkle root + nullifier tracking |
| `NftEscrow.sol` | ERC-721 custody for auction items (deposit/claim/reclaim) |
| `MockKeystoneForwarder.sol` | Test helper simulating Chainlink KeystoneForwarder |
| `deprecated/AgentAccount.sol` | (Archived) EIP-4337 smart wallet |
| `deprecated/AgentAccountFactory.sol` | (Archived) CREATE2 deployment factory |
| `deprecated/AgentPaymaster.sol` | (Archived) Gas sponsorship paymaster |

Target chain: **Base Sepolia** (chainId 84532).

## Engine Internals

- **Durable Object** (`AuctionRoom`): core sequencer assigning monotonic `seq` numbers, maintains Poseidon hash chain event log
- **Hono** HTTP framework for API routes
- **D1** (SQLite) for persistent auction metadata
- **Crypto delegation**: Poseidon hash chain via poseidon-lite (zero-dep, CF Workers compatible), matching `@agent-auction/crypto` for ZK-verifiable chains; real snarkjs.groth16.verify for ZK proofs with inlined vkeys (RegistryMembership + BidRange). `ENGINE_REQUIRE_PROOFS=true` enforces mandatory ZK proofs on JOIN and BID. `ENGINE_ALLOW_INSECURE_STUBS=true` bypasses EIP-712 sig checks (local dev only — stubs fail-closed by default)
- **Identity verification**: `ENGINE_VERIFY_WALLET=true` verifies wallet matches ERC-8004 `ownerOf(agentId)` on JOIN (cached in DO storage). `POST /verify-identity` for on-chain identity checks.
- **Privacy registry**: Engine reads `AgentPrivacyRegistry.getRoot()` to cross-check ZK membership proof's registryRoot against on-chain state
- **Two-tier WebSocket**: Public connections receive masked events (no agentId/wallet); participant connections (verified via `participantToken` from JOIN) receive full event data
- **x402 discovery gating**: Optional (`ENGINE_X402_DISCOVERY=true`) micropayment gate on `GET /auctions` and `GET /auctions/:id`. Prices configurable via `ENGINE_X402_DISCOVERY_PRICE` and `ENGINE_X402_DETAIL_PRICE`. Admin key (`ENGINE_ADMIN_KEY`) bypasses gate.
- **Aggregate snapshot fields**: `bidCount`, `uniqueBidders`, `lastActivitySec`, `competitionLevel`, `priceIncreasePct`, `snipeWindowActive`, `extensionsRemaining` — strategic intelligence without identity leaks

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
| ERC-8004 Identity Registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| AuctionRegistry (v2) | `0xFEc7a05707AF85C6b248314E20FF8EfF590c3639` |
| AuctionEscrow (v2) | `0x20944f46AB83F7eA40923D7543AF742Da829743c` |
| KeystoneForwarder (real) | `0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5` |
| AgentPrivacyRegistry | `0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff` |
| NftEscrow | `0xa05C5AF6a07D5e1abDd2c93EFdcb95D306766a94` |
| MockUSDC | `0xfEE786495d165b16dc8e68B6F8281193e041737d` |

Deployer/Sequencer: `0x633ec0e633AA4d8BbCCEa280331A935747416737`.

### Legacy (Archived — EIP-4337, removed from active codebase)

| Contract | Address |
|---|---|
| AgentAccountFactory | `0x076d3C6c50b72D78be0C5190c392e6e5Ac7FD8aD` |
| AgentPaymaster | `0xd71a4b73737d4E1a9A73662Cf93690AB5A4fE32d` |

## Architecture Invariants (Must Preserve)

1. **Identity**: ERC-8004 registry — agents self-register, engine reads on-chain
2. **Bond path**: Direct USDC deposit to escrow primary; x402 fallback
3. **Settlement**: Always via CRE `onReport()`, never direct payout. Commission deducted at settlement (global `commissionBps`).
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
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **auction-design** (53005 symbols, 154342 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/auction-design/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/auction-design/context` | Codebase overview, check index freshness |
| `gitnexus://repo/auction-design/clusters` | All functional areas |
| `gitnexus://repo/auction-design/processes` | All execution flows |
| `gitnexus://repo/auction-design/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## CLI

- Re-index: `npx gitnexus analyze`
- Check freshness: `npx gitnexus status`
- Generate docs: `npx gitnexus wiki`

<!-- gitnexus:end -->
