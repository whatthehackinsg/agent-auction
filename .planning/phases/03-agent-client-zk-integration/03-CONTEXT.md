# Phase 3: Agent-Client ZK Integration - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire real Groth16 proof generation into the agent-client flow. The agent-client autonomously generates RegistryMembership and BidRange proofs, persists private state across sessions, and submits proofs through the existing engine HTTP API. Circuits, crypto SDK, MCP tool wiring, and engine verification all exist from Phases 1-2.

</domain>

<decisions>
## Implementation Decisions

### Proof submission path
- Agent-client generates proofs **locally** using `@agent-auction/crypto` (snarkjs fullProve) — secrets never leave the process
- Proofs submitted via **direct engine HTTP** (existing `engineFetch` pattern), not MCP tools — extend `joinAuction()` and `placeBid()` to include proof payloads
- **Replace keccak path entirely** in `privacy.ts` with Poseidon primitives from `@agent-auction/crypto` — the keccak commitment was a pre-ZK placeholder
- EIP-712 signature uses the **Poseidon nullifier** from the proof's public signals (matches what MCP signer already does when proofs are present)

### State persistence
- Reuse existing **`agent-N.json`** files from `packages/crypto/test-agents/` — same format MCP server already understands, loaded via `AGENT_STATE_FILE` env var
- **Track used nullifiers** in the state file — append `usedNullifiers` array after successful joins to prevent wasted proof generation on re-runs
- **Rebuild Merkle witness** from `leafHashes` each time (tree is small, <100ms) — no stale witness risk
- **Cache registry root with 5-min TTL** — same pattern as MCP server's `proof-generator.ts`

### Error UX for agents
- **Structured ZK error types**: `ZkProofError`, `NullifierReusedError`, `BidOutOfRangeError` — each carries code + detail + suggestion, matching MCP's structured error format
- **Pre-validate bid range locally** before generating proof — check `bid >= reservePrice && bid <= maxBudget` instantly, throw `BidOutOfRangeError` with exact constraint violated, no wasted ~2s proof generation
- **Console-only logging** via existing `logStep()` pattern — no log files
- **Fail immediately** on engine rejection — no automatic retry; log structured error and let caller decide

### Demo flow design
- **Modify existing `index.ts`** demo script to use real ZK proofs — one script, one flow, no parallel scripts
- **Show failure cases** after happy path: (1) double-join with same nullifier → rejected, (2) bid outside declared range → pre-validation error. Proves privacy guarantees are real.
- **Keep 3 agents** — all register, generate proofs, join, bid. Thorough test of multi-agent Merkle tree
- **Print proof generation timing** (e.g., "Membership proof generated in 1.8s") — shows judges real Groth16 proofs, not stubs

### Claude's Discretion
- Internal module structure (whether to create a new `zk.ts` module or extend `privacy.ts`)
- Exact error class hierarchy and naming
- How to wire the `@agent-auction/crypto` dependency into agent-client's build
- Whether to extract shared proof-gen helpers between agent-client and MCP server

</decisions>

<specifics>
## Specific Ideas

- The MCP server's `proof-generator.ts` is a good reference implementation — same `loadAgentState()`, `generateMembershipProofForAgent()`, and `fetchRegistryRoot()` patterns should be mirrored in agent-client
- Poseidon nullifier derivation must match: `Poseidon(agentSecret, auctionId, 1n)` for JOIN action type
- The demo should clearly label each step in console output so hackathon judges can follow the flow

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/crypto/src/proof-generator.ts`: Full `generateMembershipProof()` and `generateBidRangeProof()` SDK — direct import target
- `packages/crypto/src/poseidon-chain.ts`: `poseidonHash()`, `toFr()` — Poseidon primitives
- `packages/crypto/src/nullifier.ts`: Nullifier derivation logic
- `mcp-server/src/lib/proof-generator.ts`: `loadAgentState()`, `fetchRegistryRoot()`, `generateMembershipProofForAgent()` — reference implementation for agent-client to mirror
- `agent-client/src/utils.ts`: `logStep()`, `engineFetch()` — existing patterns to extend
- `agent-client/src/wallet-adapter.ts`: `WalletSignerAdapter` — existing signer abstraction

### Established Patterns
- **BigInt serialization**: `agent-N.json` uses trailing "n" convention (`"48522...n"`) — deserialize with `BigInt(str.slice(0, -1))`
- **Engine action submission**: `POST /auctions/:id/action` with `{ type, agentId, wallet, amount, nonce, deadline, signature, proof }`
- **Structured errors**: MCP returns `{ success: false, error: { code, detail, suggestion } }` — agent-client should match this pattern
- **EIP-712 signing**: Domain is `{ name: "AgentAuction", version: "1", chainId: 84532, verifyingContract: auctionRegistry }`

### Integration Points
- `joinAuction()` in `auction.ts` currently sends `proof: null` — needs real proof payload
- `placeBid()` in `auction.ts` sends no proof field — needs bid range proof payload
- `privacy.ts` needs full rewrite: keccak → Poseidon, add proof generation, add state loading
- `config.ts` needs `AGENT_STATE_FILE` and `BASE_SEPOLIA_RPC` env vars

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-agent-client-zk-integration*
*Context gathered: 2026-03-03*
