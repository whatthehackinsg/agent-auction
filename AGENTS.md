# AGENTS.md - Repository Guide for AI Coding Agents

## Purpose

Agent Auction is a Chainlink 2026 hackathon project where software agents discover work, bid, and settle auctions via on-chain escrow and CRE-based settlement.

Current stage: contracts deployed on Base Sepolia (144 tests) → CRE E2E settlement confirmed on-chain → engine monetization redesign complete (commission, two-tier WebSocket, x402 discovery gating) → frontend scoreboard with masked data → MCP server with 7 agent tools.

## Read Order

Before changing architecture-sensitive logic, read both layers:

1. `docs/full_contract_arch(amended).md` (source of truth)
2. `docs/research/agent-auction-architecture/` (deep implementation specs)

Treat `docs/legacy/` as historical reference only.

## Repository Map

```
auction-design/
|- contracts/      Foundry contracts (7 contracts, 144 tests)
|- cre/            Chainlink CRE settlement workflow (9 unit tests)
|- engine/         Cloudflare Workers + Durable Objects auction engine
|- frontend/       Next.js spectator UI
|- agent-client/   TypeScript agent demo client
|- packages/crypto Shared crypto primitives (Poseidon, EIP-712, snarkjs helpers)
|- mcp-server/     MCP server — auction tools for AI agents (discover, join, bid, bond)
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
npm start                                # Start Streamable HTTP server

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
