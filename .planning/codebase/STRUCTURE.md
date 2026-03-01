# Codebase Structure

**Analysis Date:** 2026-03-02

## Directory Layout

```
auction-design/
├── contracts/          # Foundry Solidity contracts (0.8.24, 144 tests)
├── cre/                # Chainlink Runtime Environment settlement workflow (Bun)
├── engine/             # Cloudflare Workers + Durable Objects auction engine
├── frontend/           # Next.js 16 + React 19 spectator UI
├── agent-client/       # TypeScript demo client with x402 auto-payment
├── mcp-server/         # MCP server: 7 auction tools for AI agents
├── packages/crypto/    # Shared crypto lib: Poseidon, EIP-712, ZK proof gen/verify
├── circuits/           # Circom 2.2.3 circuits (RegistryMembership, BidRange)
├── docs/               # Specs, architecture, developer guide
├── .beads/             # Issue tracking database (bd CLI)
├── .planning/          # GSD mapping documents (this file's parent)
└── .claude/            # Claude Code guidance + GitNexus skills
```

## Directory Purposes

**contracts/:**
- Purpose: Smart contracts for on-chain state management, escrow, settlement
- Contains: Solidity contracts (.sol), foundry configuration, tests
- Key files:
  - `contracts/src/AuctionRegistry.sol`: Auction state machine (OPEN → CLOSED → SETTLED)
  - `contracts/src/AuctionEscrow.sol`: USDC bond escrow + CRE settlement via `onReport()`
  - `contracts/src/AgentPrivacyRegistry.sol`: ZK membership Merkle root + nullifier tracking
  - `contracts/src/NftEscrow.sol`: ERC-721 item custody (deposit/claim/reclaim)
  - `contracts/test/`: 144 tests covering all contracts

**cre/:**
- Purpose: CRE workflow definition and settlement script
- Contains: TypeScript workflow tasks, configuration, settlement watcher
- Key files:
  - `cre/workflows/settlement/task.ts`: DecentralizedOnChainReporting task (verify → replay → settle)
  - `cre/workflows/settlement/config.json`: Simulation mode (useFinalized=false)
  - `cre/workflows/settlement/config.production.json`: DON mode (useFinalized=true)
  - `cre/scripts/settlement-watcher.ts`: Local auto-trigger on AuctionEnded event
  - `cre/project.yaml`: RPC config (chain, network, block confirmation)

**engine/:**
- Purpose: Sequencer, event log, HTTP API, WebSocket streaming
- Contains: TypeScript (Hono HTTP framework, Durable Objects, D1 client)
- Key files:
  - `engine/src/index.ts`: Hono router (POST /action, GET /auctions, POST /close, x402 middleware)
  - `engine/src/auction-room.ts`: Durable Object maintaining append-only log per auction
  - `engine/src/handlers/actions.ts`: Action validation (signature, nonce, nullifier, business logic)
  - `engine/src/types/engine.ts`: Types (ActionType, AuctionEvent, ValidatedAction, InclusionReceipt)
  - `engine/src/lib/crypto.ts`: EIP-712 signing, Poseidon hashing, snarkjs ZK proof verification
  - `engine/src/lib/settlement.ts`: Settlement packet signing, on-chain registration
  - `engine/src/lib/chain-client.ts`: viem client for Base Sepolia reads/writes
  - `engine/src/middleware/x402.ts`: x402 micropayment gating
  - `engine/wrangler.toml`: Cloudflare deployment config (D1 binding, DO namespace)

**frontend/:**
- Purpose: Read-only spectator UI for auctions, replay, scoreboard with masked data
- Contains: Next.js 16, React 19, Tailwind v4, GSAP animations
- Key files:
  - `frontend/src/app/layout.tsx`: Root layout with providers (wallet, theme)
  - `frontend/src/app/auctions/[id]/page.tsx`: Auction detail view
  - `frontend/src/app/auctions/[id]/replay/page.tsx`: Historical event replay
  - `frontend/src/components/auction/`: Bid table, event feed, scoreboard (masked participant names)
  - `frontend/src/components/landing/`: Hero, tech stack, deployed addresses sections
  - `frontend/src/hooks/useAuctionStream.ts`: WebSocket streaming hook (connects to engine /stream)
  - `frontend/src/lib/`: API clients, types, utilities

**agent-client/:**
- Purpose: TypeScript demo client showing x402 auto-payment + agent workflow
- Contains: Node.js CLI, x402 fetch wrapper, example agents
- Key files:
  - `agent-client/src/client.ts`: EngineClient wrapper for HTTP calls
  - `agent-client/src/demo-agent.ts`: Example agent (discover → join → bid → monitor settlement)
  - `agent-client/src/x402-helper.ts`: x402 payment challenge handling via @x402/fetch

**mcp-server/:**
- Purpose: MCP server exposing 7 auction tools to AI agents
- Contains: TypeScript (MCP SDK, Streamable HTTP transport)
- Key files:
  - `mcp-server/src/index.ts`: McpServer factory, tool registration
  - `mcp-server/src/tools/discover.ts`: `discover()` tool (list auctions, optional x402 gating)
  - `mcp-server/src/tools/details.ts`: `details()` tool (auction detail + current snapshot)
  - `mcp-server/src/tools/join.ts`: `join()` tool (create JOIN action, sign, submit)
  - `mcp-server/src/tools/bid.ts`: `bid()` tool (create BID action, sign, submit)
  - `mcp-server/src/tools/bond.ts`: `bondStatus()`, `recordBond()` tools (USDC deposit tracking)
  - `mcp-server/src/tools/events.ts`: `events()` tool (ordered event log for agentId)
  - `mcp-server/src/lib/config.ts`: Config loading (ENGINE_URL, AGENT_ID, AGENT_PRIVATE_KEY)
  - `mcp-server/src/lib/engine.ts`: EngineClient class (HTTP wrapper)

**packages/crypto/:**
- Purpose: Shared cryptographic primitives
- Contains: TypeScript (snarkjs, viem, circom)
- Key files:
  - `packages/crypto/src/poseidon.ts`: Poseidon hash chain implementation (poseidon-lite)
  - `packages/crypto/src/eip712.ts`: EIP-712 domain separator, message hashing
  - `packages/crypto/src/zk-proofs.ts`: snarkjs.groth16.verify wrapper, vkey inlining
  - `packages/crypto/src/nullifier.ts`: Poseidon-based nullifier derivation
  - `packages/crypto/src/index.ts`: Public exports
  - `packages/crypto/test/`: 56 unit tests

**circuits/:**
- Purpose: Circom 2.2.3 zero-knowledge circuits
- Contains: .circom source, compiled JavaScript artifacts, test cases
- Key files:
  - `circuits/RegistryMembership.circom`: Prove membership in Merkle tree without revealing leaf (~12K gates)
  - `circuits/BidRange.circom`: Prove bid within [min, max] without revealing exact amount (~5K gates)
  - `circuits/RegistryMembership_js/`: Compiled witness generator + witness calculator
  - `circuits/BidRange_js/`: Compiled circuit
  - Note: Test harness not yet wired; `npm test` expected to fail

**docs/:**
- Purpose: Architecture specs, developer guides, solutions
- Contains: Markdown files (English + legacy Mandarin)
- Key files:
  - `docs/full_contract_arch(amended).md`: Source of truth for contract architecture
  - `docs/research/agent-auction-architecture/01–06.md`: Deep implementation specs
  - `docs/developer-guide.md`: cast examples, TypeScript integration, CRE setup
  - `docs/solutions/`: Troubleshooting guides
  - `docs/legacy/`: Historical designs (Mandarin)

**.beads/:**
- Purpose: Issue tracking database (bd CLI)
- Contains: YAML issue definitions, status tracking
- Usage: `bd ready`, `bd create`, `bd update`, `bd close`

## Key File Locations

**Entry Points:**
- `engine/src/index.ts`: Hono HTTP app (routes all requests)
- `engine/src/auction-room.ts`: Durable Object (core sequencer)
- `frontend/src/app/layout.tsx`: Next.js root layout
- `mcp-server/src/index.ts`: MCP server factory
- `contracts/src/AuctionRegistry.sol`: Auction state machine
- `cre/workflows/settlement/task.ts`: CRE settlement task

**Configuration:**
- `engine/wrangler.toml`: Cloudflare Workers deployment, D1 database binding
- `contracts/foundry.toml`: Foundry build config (Solidity 0.8.24, optimizer 200 runs)
- `packages/crypto/tsconfig.json`: TypeScript ESM config (--experimental-vm-modules for tests)
- `mcp-server/.env.example`: MCP server env vars (ENGINE_URL, AGENT_ID, AGENT_PRIVATE_KEY)
- `cre/project.yaml`: CRE project-level RPC config

**Core Logic:**
- `engine/src/handlers/actions.ts`: Action validation (signature, nonce, nullifier checks)
- `engine/src/lib/crypto.ts`: EIP-712, Poseidon hash, snarkjs ZK verification
- `engine/src/lib/settlement.ts`: Settlement packet signing, on-chain registration
- `contracts/src/AuctionEscrow.sol`: Bond escrow + `onReport()` settlement entry point
- `packages/crypto/src/eip712.ts`: EIP-712 domain definition and hashing

**Testing:**
- `contracts/test/`: Foundry test suites (144 tests)
- `cre/test/`: Unit tests (9 tests, settlement workflow validation)
- `engine/test/`: Vitest + Miniflare tests
- `packages/crypto/test/`: Node.js ESM unit tests (56 tests, Poseidon + ZK)

**Utility & Helpers:**
- `engine/src/lib/chain-client.ts`: viem client initialization, contract ABIs
- `engine/src/lib/replay-bundle.ts`: Event serialization, content hash computation
- `engine/src/lib/bond-watcher.ts`: On-chain bond verification, receipt parsing
- `engine/src/lib/x402-policy.ts`: x402 policy validation, runtime config resolution
- `frontend/src/hooks/useAuctionStream.ts`: WebSocket + event stream hook
- `mcp-server/src/lib/engine.ts`: EngineClient HTTP wrapper

## Naming Conventions

**Files:**
- Solidity: `.sol` (uppercase: `AuctionRegistry.sol`, `AuctionEscrow.sol`)
- TypeScript: `.ts` or `.tsx` (camelCase: `actions.ts`, `useAuctionStream.tsx`)
- Configuration: lowercase with hyphens or dots (foundry.toml, wrangler.toml, .prettierrc)
- Tests: filename + `.test.ts` or `.spec.ts` (co-located in same dir as source)
- Circuits: `.circom` (PascalCase: `RegistryMembership.circom`)

**Directories:**
- Feature/layer: lowercase plural (`contracts/`, `handlers/`, `lib/`, `tools/`)
- Page routes: lowercase with brackets for dynamic segments (`auctions/[id]/`, `agents/[agentId]/`)
- Components: PascalCase reflecting React component structure (`components/auction/`, `components/landing/`)

**Functions/Variables:**
- Exported functions: camelCase (`validateAction()`, `verifyMembershipProof()`)
- Type interfaces: PascalCase (`AuctionEvent`, `ValidatedAction`, `InclusionReceipt`)
- Constants: UPPER_SNAKE_CASE (`ZERO_HASH`, `MAX_COMMISSION_BPS`, `SETTLEMENT_TYPEHASH`)
- Private helpers: camelCase with leading underscore if truly private (`_escrowBound`)
- React hooks: `use` prefix + camelCase (`useAuctionStream`, `useWallet`)

## Where to Add New Code

**New Smart Contract Feature:**
- Primary code: `contracts/src/[FeatureName].sol`
- Tests: `contracts/test/[FeatureName].t.sol`
- Follow Solidity 0.8.24, Cancun EVM, 200 optimizer runs
- Emit events for all state changes; use IAuctionTypes for shared enums

**New Engine API Route:**
- Primary code: Add handler in `engine/src/index.ts` (Hono app)
- Core logic: Create helper in `engine/src/lib/[feature].ts`
- Types: Add to `engine/src/types/engine.ts`
- Validation: Add to `engine/src/handlers/actions.ts` if action-related
- Tests: Add Vitest + Miniflare test in `engine/test/`

**New Agent Tool (MCP):**
- Primary code: `mcp-server/src/tools/[tool-name].ts`
- Register in: `mcp-server/src/index.ts` (registerTool call)
- Client wrapper: Update `mcp-server/src/lib/engine.ts` if calling engine API
- Follow Tool interface: input schema, description, execution function
- Return structured results (success boolean, data, error message)

**New Shared Crypto Utility:**
- Primary code: `packages/crypto/src/[feature].ts` (e.g., `packages/crypto/src/poseidon.ts`)
- Exports: Add to `packages/crypto/src/index.ts`
- Tests: Co-locate in same dir, `.test.ts` suffix
- Import across layers via `@agent-auction/crypto` (package.json alias)
- Node.js ESM only; CF Workers compatibility via poseidon-lite (zero-dep)

**New Frontend Page:**
- Primary code: `frontend/src/app/[route]/page.tsx` (Next.js 16)
- Components: `frontend/src/components/[section]/[Component].tsx`
- Hooks: `frontend/src/hooks/use[Feature].ts` (if state/data fetching)
- Styling: Tailwind v4 utility classes (no CSS files)
- API calls: `frontend/src/lib/api.ts` wrapper

**New CRE Task or Workflow:**
- Primary code: `cre/workflows/[workflow-name]/task.ts` (Chainlink CRE SDK)
- Config: `cre/workflows/[workflow-name]/config.json` (simulation) + `config.production.json` (DON)
- Tests: `cre/test/[workflow-name].test.ts` (Bun test runner)
- Project-level config: `cre/project.yaml` (RPC endpoints, network)

**Database Schema Updates (D1):**
- Migrations: Not tracked; schema lives in engine initialization
- Table definitions: `engine/src/index.ts` (implicit from prepared statements)
- New columns: Backward-compatible; use NULL defaults or sensible zero values
- Queries: Use prepared statements with parameterized queries (prevent injection)

## Special Directories

**contracts/lib/:**
- Purpose: Foundry dependencies (OpenZeppelin, etc.)
- Generated: Yes (via `forge install`)
- Committed: Yes (to lock versions)
- Read-only: Yes (never edit directly; bump via foundry.toml)

**contracts/out/:**
- Purpose: Compiled contract artifacts (.json ABI, bytecode)
- Generated: Yes (via `forge build`)
- Committed: No (.gitignore)
- Read-only: Yes (regenerated on build)

**node_modules/:**
- Purpose: npm/yarn dependencies
- Generated: Yes (via `npm install`)
- Committed: No (.gitignore)
- Read-only: Yes (never edit; use package.json)

**frontend/.next/:**
- Purpose: Next.js build cache
- Generated: Yes (via `npm run build` or `npm run dev`)
- Committed: No (.gitignore)
- Read-only: Yes (automatically invalidated)

**circuits/*_js/:**
- Purpose: Compiled Circom circuits (JavaScript witness generator + calculator)
- Generated: Yes (via `circom` compiler)
- Committed: Yes (production builds depend on these artifacts)
- Read-only: Yes (regenerate via circom compilation, not hand-edit)

**.beads/:**
- Purpose: Issue tracking data (bd CLI)
- Generated: Yes (via `bd create`, `bd update`)
- Committed: Yes (shared issue state across team)
- Read-only: No (edited via bd CLI, not direct file edits)

---

*Structure analysis: 2026-03-02*
