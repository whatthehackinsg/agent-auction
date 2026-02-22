# AGENTS.md — Repository Guidelines for AI Coding Agents

## What This Repo Is

Design-document repository for an **agent-native auction platform** (Chainlink hackathon).
No application source code, no runtime services, no test suites. All work is writing, reviewing,
and evolving design specs. When source code directories are added later, update this file.

## Repository Map

```
docs/
├── 0-agent-onboarding.md          # Identity: 3-layer model, ERC-8004, registration flows
├── 1-agent-voice.md                # Bid signing, delivery, MCP Gateway vs HTTP
├── 2-room-broadcast.md             # Sequencer, append-only log, WS/SSE broadcast
├── 3-payment.md                    # x402, AuctionEscrow, bond/settlement/refund
├── 4-auction-host.md               # Host role (platform MVP → pluggable Host Agent)
├── 5-auction-object.md             # 3-tier auctionable objects & verification
├── 6-human-observation.md          # Spectator UI: live + replay
├── things-need-answer.md           # Roadmap: P0 → P1 → P2
├── full_contract_arch.md           # Smart contract architecture (legacy; prefer research/)
├── research/
│   ├── research_report_*.md        # Deep architecture report (orchestrator/index)
│   └── agent-auction-architecture/ # Implementation-level English specs (01–06)
└── agent-onboarding-research/      # Competitive research: 28 platforms
    ├── outline.yaml / fields.yaml  # Research structure definitions
    ├── results/*.json              # Per-platform raw findings
    ├── generate_report.py          # Compiles results → report.md
    └── report.md                   # Generated comparison report (~360 KB)
```

**Two document layers — always check both before making architecture claims:**
- `docs/0-*.md` – `docs/6-*.md` → Chinese lifecycle design docs (high-level decisions)
- `docs/research/agent-auction-architecture/01–06` → English deep specs (implementation-level)

## Build, Lint, and Test Commands

No automated build/test/lint pipeline. Validation is manual:

```bash
# Regenerate competitive research report (after editing fields/outline/results)
python3 docs/agent-onboarding-research/generate_report.py

# Validate a single research JSON file
python3 -m json.tool docs/agent-onboarding-research/results/<file>.json > /dev/null

# Find unresolved items across all docs
grep -rE "TODO|待确认|TBD|FIXME|[Uu]ncertain" docs/

# List all doc files
find docs -name '*.md' | sort

# Start Chainlink MCP server (requires .mcp.json with API key)
npm run mcp:start
```

When source code is added (TypeScript backend, Solidity contracts, Next.js frontend),
update this section with actual build/test/lint commands.

## Writing & Style Rules

### Language
- **Design docs** (`docs/0-*.md` to `docs/6-*.md`, `things-need-answer.md`): **Mandarin Chinese**.
- **Deep specs** (`docs/research/agent-auction-architecture/*`): **English**.
- **README, AGENTS.md, CLAUDE.md**: English.
- Protocol names and standards stay in English always: `ERC-8004`, `x402`, `EIP-4337`, `MCP`, `CRE`.

### Markdown Formatting
- Concise sections with clear `##` / `###` headings; prefer bullets over long paragraphs.
- Tables for comparisons; fenced code blocks for schemas, commands, and diagrams.
- One blank line between sections. No trailing whitespace.

### Naming Conventions

| What | Pattern | Example |
|---|---|---|
| Lifecycle docs | `<index>-<topic>.md` | `3-payment.md` |
| All markdown filenames | lowercase kebab-case | `full-contract-arch.md` |
| JSON / YAML keys | `snake_case` | `agent_id`, `bond_amount` |
| Solidity contracts | PascalCase | `AuctionEscrow.sol` |
| Priority tags | Exact: `P0`, `P1`, `P2` | Never `p0`, `Phase 0`, etc. |

### Priority Definitions
- **P0** — MVP / hackathon scope. Must ship.
- **P1** — Advanced (sealed-bid MPC, scoring auctions, reputation, milestone escrow).
- **P2** — Production-grade (trustless escrow, ZK/TEE privacy, federation, governance).

## Key Architecture Concepts (Quick Reference)

1. **Sequencer + Append-only Log** — All auction state derives from monotonic `seq`-numbered events.
2. **Dual Entry** — MCP Gateway (Streamable HTTP + SSE) or plain HTTP → same Room Core (Durable Objects).
3. **Identity** — On-chain `ERC-8004 agentId` + off-chain Ed25519 runtime keys. Only ERC-8004 agents can bid/bond.
4. **Payment** — Bond via EIP-4337 UserOp → `AuctionEscrow` (primary). x402 for HTTP micropayments + EOA fallback.
5. **Settlement** — CRE Workflow verifies event log → `AuctionEscrow.onReport()`. Pull-based refunds for losers.
6. **Host** — Platform-hosted (MVP) → pluggable external Host Agents (future).
7. **Target chain** — Base Sepolia (OP Stack L2, chainId `84532`).

## Cross-Document Consistency Invariants

When editing any doc, verify these hold across the full set:

- Identity model is **3-layer** everywhere: Root Controller / Runtime Key / Session Token.
- Bond flow: EIP-4337 direct transfer is **primary**; x402 is fallback only.
- Settlement always goes through CRE `onReport`, never direct platform payout.
- `seq` numbering is monotonic and gap-free within a room.
- Off-chain-only agents (Flow A) can observe but **cannot** bid or bond.

## Research Pipeline

1. Define items in `outline.yaml`, fields in `fields.yaml`.
2. Store per-platform findings in `results/<Platform_Name>.json`.
3. Run `python3 docs/agent-onboarding-research/generate_report.py` to rebuild `report.md`.
4. **Always regenerate** `report.md` after touching `fields.yaml`, `outline.yaml`, or any `results/*.json`.

## Commit & PR Guidelines

- **Conventional Commits**: `docs(payment): clarify bond refund timeline`
- Scopes: `payment`, `identity`, `broadcast`, `host`, `object`, `observation`, `research`, `infra`.
- PR description must include: scope summary, architecture impact, changed files, open questions.
- Do **not** commit: `.mcp.json`, `.env`, `.claude/`, `.sisyphus/`, `node_modules/`.

## Tech Stack Reference

| Layer | Technology |
|---|---|
| Blockchain | Base Sepolia, Solidity, EIP-4337 (EntryPoint v0.7) |
| Settlement | Chainlink CRE Workflow |
| Identity | ERC-8004, Ed25519 |
| Privacy | Groth16 ZK proofs, Circom 2.x |
| Payments | USDC escrow (on-chain), x402 (HTTP) |
| Auction Engine | Cloudflare Workers + Durable Objects |
| Agent Interface | MCP Streamable HTTP + SSE, REST API |
| Frontend | Next.js / React |
| Backend | Node.js / TypeScript |

## Chainlink References

- CRE Docs: https://docs.chain.link/cre
- Use Cases: https://blog.chain.link/5-ways-to-build-with-cre/
- MCP Server: https://www.npmjs.com/package/@chainlink/mcp-server
- Demos: https://credemos.com/cdf

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds


<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update bd-42 --status in_progress --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Auto-Sync

bd automatically syncs with git:

- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

<!-- END BEADS INTEGRATION -->
