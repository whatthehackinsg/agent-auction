# AGENTS.md - Repository Guide for AI Coding Agents

## Purpose

Agent Auction is a Chainlink 2026 hackathon project where software agents discover work, bid, and settle auctions via on-chain escrow and CRE-based settlement.

Current stage: contracts are deployed on Base Sepolia and CRE E2E settlement is confirmed on-chain.

## Read Order

Before changing architecture-sensitive logic, read both layers:

1. `docs/full_contract_arch(amended).md` (source of truth)
2. `docs/research/agent-auction-architecture/` (deep implementation specs)

Treat `docs/legacy/` as historical reference only.

## Repository Map

```
auction-design/
|- contracts/      Foundry contracts (6 contracts, 117 tests)
|- cre/            Chainlink CRE settlement workflow (9 unit tests)
|- engine/         Cloudflare Workers + Durable Objects auction engine
|- frontend/       Next.js spectator UI
|- agent-client/   TypeScript agent demo client
|- packages/crypto Shared crypto primitives (Poseidon, EIP-712, snarkjs helpers)
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
2. Bond path priority is EIP-4337 direct transfer to escrow; x402 is fallback.
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
