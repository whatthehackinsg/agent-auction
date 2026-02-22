# AGENTS.md — Repository Guidelines for AI Coding Agents

## What This Repo Is

**Agent-native auction platform** for the Chainlink 2026 Hackathon. AI agents autonomously discover, join, bid in, and settle auctions — with on-chain USDC escrow, verifiable event ordering, and CRE-based trustless settlement.

**Stage**: Design complete → contracts implemented & tested → deploying to Base Sepolia.

## Repository Map

```
agent-auction/
├── contracts/                  # Foundry project — 6 Solidity contracts + tests (see contracts/AGENTS.md)
│   ├── src/                    #   Source contracts (AgentAccount, AgentPaymaster, AuctionRegistry, AuctionEscrow, etc.)
│   ├── test/                   #   Foundry tests (113 tests, all passing)
│   ├── lib/                    #   Dependencies (account-abstraction v0.7, openzeppelin v5.1, chainlink v2.19, forge-std)
│   ├── docs/                   #   Development documentation for each contract
│   └── foundry.toml            #   Solc 0.8.24, Cancun EVM, optimizer on
├── frontend/                   # Next.js spectator UI (scaffolded, WS-3 scope)
├── designs/                    # Pencil design files + references
├── docs/
│   ├── full_contract_arch(amended).md   # ★ SOURCE OF TRUTH — full architecture spec
│   ├── research/
│   │   ├── research_report_*.md                # Architecture research report
│   │   └── agent-auction-architecture/         # English deep specs (01–06)
│   │       ├── 00-visual-overview.md           #   Architecture diagrams
│   │       ├── 01-agent-onboarding.md          #   Identity, ERC-8004, EIP-4337
│   │       ├── 02-agent-voice.md               #   Signing, EIP-712, MCP transport
│   │       ├── 03-room-broadcast.md            #   Sequencer, Poseidon chain, CRE settlement
│   │       ├── 04-payment-and-escrow.md        #   x402, AuctionEscrow, CRE ReceiverTemplate
│   │       ├── 05-host-object-observation.md   #   Host, auction objects, spectator UI
│   │       └── 06-appendix.md                  #   Deployment order, tech stack, test checklist
│   ├── plans/                                  # Hackathon workstream plans (WS-1/2/3)
│   ├── solutions/                              # Documented problem solutions (/compound output)
│   └── legacy/                                 # Archived Chinese lifecycle docs + old architecture
└── .beads/                     # Issue tracking data (bd CLI)
```

**Two document layers — always check both before making architecture claims:**
- `docs/full_contract_arch(amended).md` → Source of truth (complete hybrid architecture)
- `docs/research/agent-auction-architecture/01–06` → English deep specs (implementation-level)
- `docs/legacy/*` → Historical reference only, DO NOT use for current decisions

## Build, Lint, and Test Commands

```bash
# ── Contracts (Foundry) ──────────────────────────────────────
cd contracts
forge build                    # Compile (solc 0.8.24, Cancun EVM)
forge test                     # Run all 113 tests
forge test -vvv                # Verbose with traces
forge test --match-contract X  # Run specific test suite
forge fmt                      # Format Solidity code
forge snapshot                 # Gas snapshots

# ── Frontend (Next.js) ───────────────────────────────────────
cd frontend
npm run dev                    # Dev server
npm run build                  # Production build
npm run lint                   # ESLint

# ── Root ─────────────────────────────────────────────────────
npm run mcp:start              # Start Chainlink MCP server (needs .mcp.json)

# ── Research Pipeline ────────────────────────────────────────
python3 docs/legacy/agent-onboarding-research/generate_report.py

# ── Issue Tracking ───────────────────────────────────────────
bd ready --json                # Show unblocked issues
bd list --json                 # List all issues
bd create "title" -p 1 --json # Create issue
bd close <id> --reason "Done"  # Close issue
```

## Writing & Style Rules

### Language
- **Design docs** (legacy `docs/0-*.md`): Mandarin Chinese
- **Deep specs** (`docs/research/agent-auction-architecture/*`): English
- **README, AGENTS.md, code comments**: English
- Protocol names stay English always: `ERC-8004`, `x402`, `EIP-4337`, `MCP`, `CRE`

### Naming Conventions

| What | Pattern | Example |
|---|---|---|
| Solidity contracts | PascalCase | `AuctionEscrow.sol` |
| Solidity interfaces | IPascalCase | `IAuctionTypes.sol` |
| Test files | PascalCase.t.sol | `AgentAccount.t.sol` |
| Markdown filenames | lowercase kebab-case | `full-contract-arch.md` |
| JSON / YAML keys | `snake_case` | `agent_id`, `bond_amount` |
| Priority tags | Exact: `P0`, `P1`, `P2` | Never `p0`, `Phase 0` |
| Commit scopes | `contracts`, `docs`, `frontend`, `infra` | `feat(contracts): add escrow` |

### Priority Definitions
- **P0** — MVP / hackathon scope. Must ship.
- **P1** — Advanced (sealed-bid MPC, scoring auctions, reputation).
- **P2** — Production-grade (trustless escrow, ZK/TEE privacy, federation).

## Key Architecture Concepts

1. **Sequencer + Append-only Log** — All auction state derives from monotonic `seq`-numbered events.
2. **Dual Entry** — MCP Gateway (Streamable HTTP + SSE) or plain HTTP → same Room Core (Durable Objects).
3. **Identity** — On-chain `ERC-8004 agentId` + secp256k1 runtime keys. Only ERC-8004 agents can bid/bond.
4. **Payment** — Bond via EIP-4337 UserOp → `AuctionEscrow` (primary). x402 for HTTP micropayments + EOA fallback.
5. **Settlement** — CRE Workflow verifies event log → `AuctionEscrow.onReport()` via KeystoneForwarder. Pull-based refunds.
6. **Account Abstraction** — Agents use `AgentAccount` (EIP-4337 smart wallet) + `AgentPaymaster` (gas sponsorship). Zero ETH UX.
7. **Target chain** — Base Sepolia (OP Stack L2, chainId `84532`).

## Cross-Document Consistency Invariants

When editing any doc, verify these hold across the full set:

- Identity model is **3-layer** everywhere: Root Controller / Runtime Key / Session Token
- Bond flow: EIP-4337 direct transfer is **primary**; x402 is fallback only
- Settlement always goes through CRE `onReport`, never direct platform payout
- `seq` numbering is monotonic and gap-free within a room
- Off-chain-only agents (Flow A) can observe but **cannot** bid or bond
- Runtime signing uses **secp256k1** (EIP-712 verifiable on-chain via ecrecover)

## Smart Contract Architecture

```
L2 (Base Sepolia) — 6 contracts (all compiled & tested)

ACCOUNT ABSTRACTION
  AgentAccountFactory → deploys AgentAccount proxies (CREATE2, deterministic)
  AgentAccount        → EIP-4337 smart wallet (BaseAccount, secp256k1 runtime signer)
  AgentPaymaster      → Gas sponsorship (bond-deposit path + non-bond with bond check)

AUCTION LOGIC
  AuctionRegistry     → Lifecycle: OPEN → CLOSED → SETTLED/CANCELLED (EIP-712 sequencer sigs)

PAYMENT
  AuctionEscrow       → USDC bonds + CRE settlement via IReceiver.onReport()

SHARED
  IAuctionTypes       → AuctionState enum, AuctionSettlementPacket, BondRecord structs

TEST ONLY
  MockKeystoneForwarder → Simulates Chainlink KeystoneForwarder for local CRE testing
```

**Deployment Order**: External deps (USDC, IdentityRegistry, EntryPoint, Forwarder) → AgentAccountFactory → AgentPaymaster → AuctionRegistry → AuctionEscrow → Cross-bind (setEscrow, setRegistry)

**Security**: 2-round audit complete, 9 vulnerabilities fixed (see contracts/docs/)

## Tech Stack Reference

| Layer | Technology |
|---|---|
| Blockchain | Base Sepolia (chainId 84532), Solidity 0.8.24 |
| Account Abstraction | EIP-4337 (EntryPoint v0.7), AgentPaymaster |
| Settlement | Chainlink CRE Workflow (KeystoneForwarder) |
| Identity | ERC-8004, secp256k1 runtime keys |
| Privacy | Groth16 ZK proofs, Circom 2.x |
| Payments | USDC escrow (on-chain), x402 (HTTP) |
| Auction Engine | Cloudflare Workers + Durable Objects |
| Agent Interface | MCP Streamable HTTP + SSE, REST API |
| Frontend | Next.js / React |
| Testing | Foundry (forge test), 113 tests passing |

## Chainlink References

- CRE Docs: https://docs.chain.link/cre
- Use Cases: https://blog.chain.link/5-ways-to-build-with-cre/
- MCP Server: https://www.npmjs.com/package/@chainlink/mcp-server
- Demos: https://credemos.com/cdf

## Commit & PR Guidelines

- **Conventional Commits**: `feat(contracts): add auction escrow settlement`
- Scopes: `contracts`, `frontend`, `docs`, `infra`, `research`
- Do **not** commit: `.mcp.json`, `.env`, `.claude/`, `.sisyphus/`, `node_modules/`, `contracts/out/`, `contracts/cache/`

## Hackathon Workstreams

| WS | Owner | Scope | Status |
|---|---|---|---|
| WS-1 | ZK Researcher | Circom circuits, trusted setup, crypto libs | In Progress |
| WS-2 | Zyro | Smart contracts, CRE settlement, deployment | Contracts done, deploying |
| WS-3 | AI Engineer 2 | DO sequencer, HTTP/MCP API, frontend, demo | In Progress |

Plans: `docs/plans/ws1-zk-crypto.md`, `ws2-contracts-cre.md`, `ws3-engine-frontend.md`

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

1. File issues for remaining work (`bd create`)
2. Run quality gates (if code changed): `forge test`, `npm run lint`
3. Update issue status: `bd close <id>`
4. **PUSH TO REMOTE** (MANDATORY):
   ```bash
   git pull --rebase && bd sync && git push
   git status  # MUST show "up to date with origin"
   ```
5. Verify all changes committed AND pushed

<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs.

```bash
bd ready --json                # Check unblocked work
bd create "title" -p 1 --json  # Create issue (types: bug|feature|task|epic|chore, priority 0-4)
bd update <id> --status in_progress --json
bd close <id> --reason "Done"
```

**Priorities**: 0=Critical, 1=High, 2=Medium, 3=Low, 4=Backlog

**Workflow**: `bd ready` → claim → implement → test → `bd close` → commit → push
<!-- END BEADS INTEGRATION -->
