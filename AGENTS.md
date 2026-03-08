# AGENTS.md - Repository Guide for AI Coding Agents

## Purpose

Agent Auction is a Chainlink 2026 hackathon project where software agents discover work, bid, and settle auctions via on-chain escrow and CRE-based settlement.

Current stage: contracts deployed on Base Sepolia (144 tests) → CRE E2E settlement confirmed on-chain → engine monetization redesign complete (commission, two-tier WebSocket, x402 discovery gating) → frontend scoreboard with masked data → MCP server with 15 tools and x402-paid discovery/detail reads.

## Read Order

Before changing architecture-sensitive logic, read both layers:

1. `docs/full_contract_arch(amended).md` (source of truth)
2. `docs/research/agent-auction-architecture/` (deep implementation specs)

Treat `docs/legacy/` as historical reference only.

## Repository Map

```
auction-design/
|- contracts/      Foundry contracts (7 contracts, 144 tests)
|- cre/            Chainlink CRE settlement workflow (13 unit tests)
|- engine/         Cloudflare Workers + Durable Objects auction engine
|- frontend/       Next.js spectator UI
|- agent-client/   TypeScript agent demo client
|- packages/crypto Shared crypto primitives (Poseidon, EIP-712, snarkjs helpers)
|- mcp-server/     MCP server — 15 auction tools for identity, x402-paid discovery, join, bid, bond, monitoring, and exits
|- circuits/       Circom/snarkjs workspace (WS-1; test harness not wired yet)
|- docs/           Specs, plans, developer docs, solutions
`- .beads/         Issue tracking database (bd CLI)
```

## Child AGENTS Files

Apply this root file first, then the nearest child file:

- `contracts/AGENTS.md`
- `cre/AGENTS.md`
- `engine/AGENTS.md`
- `frontend/AGENTS.md`
- `mcp-server/AGENTS.md`
- `agent-client/AGENTS.md`
- `packages/crypto/AGENTS.md`
- `circuits/AGENTS.md`
- `docs/AGENTS.md`

Child files add local constraints and commands; they should not duplicate this root guide.

## Universal Commands

```bash
# Contracts
cd contracts
forge build
forge test
forge fmt

# CRE workflow
cd cre
bun test
bun run scripts/settlement-watcher.ts   # Auto-detect & settle auctions

# Engine
cd engine
npm run typecheck
npm run test

# Frontend
cd frontend
npm run lint
npm run build

# Agent client
cd agent-client
npm run typecheck

# MCP server
cd mcp-server
npx tsc --noEmit
npm run dev                              # Start Streamable HTTP server

# Shared crypto package
cd packages/crypto
npm run build
npm test

# Circuits (WS-1)
cd circuits
# Note: test harness is not wired yet; `npm test` is expected to fail.
```

## Global Rules

- Use `bd` for issue tracking (`bd ready`, `bd create`, `bd update`, `bd close`).
- Never commit secrets (`.env`, `.mcp.json`, private keys, credentials).
- Ignore vendor/generated trees for code edits unless explicitly requested (`contracts/lib/`, `node_modules/`, `contracts/out/`, `contracts/cache/`).
- Keep protocol terms and identifiers in English: `ERC-8004`, `EIP-4337`, `x402`, `CRE`, `MCP`.

## Architecture Invariants

Any code or doc change must preserve these invariants:

1. Identity is a 3-layer model: Root Controller / Runtime Key / Session Token.
2. Bond path priority is direct USDC deposit to escrow; x402 is fallback.
3. Settlement always goes through CRE `onReport`, never direct platform payout.
4. Room event `seq` values are monotonic and gap-free per room.
5. Off-chain-only agents can observe but cannot bid or bond.
6. Runtime signing is secp256k1 and verifiable via EIP-712/ecrecover.

## Session Completion Checklist

When finishing implementation work:

1. Run relevant quality gates for changed modules.
2. Update bead status (`bd update` / `bd close`).
3. If asked to commit: commit with conventional scope (`contracts`, `engine`, `frontend`, `cre`, `docs`, `infra`, `research`).
4. If asked to push: `git pull --rebase && bd sync && git push`.

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
