# Phase 2: MCP + Engine Wiring - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend MCP `join_auction` and `place_bid` tools to accept ZK proof payloads, switch the EIP-712 signer to use Poseidon nullifiers when proofs are present, and validate the full engine proof verification pipeline end-to-end. The engine's Groth16 verification is already fully wired — all work is in the MCP server layer and integration testing.

</domain>

<decisions>
## Implementation Decisions

### Proof Submission Mode
- Hybrid mode: MCP tools accept EITHER pre-built proofs `{ proof, publicSignals }` OR a flag to generate proofs server-side from loaded agent state
- Pre-built proofs are passed through to the engine without local verification — engine is the sole verifier
- Server-side generation uses `generateMembershipProof` / `generateBidRangeProof` from `@agent-auction/crypto` (monorepo import, not bundled artifacts)
- When generating server-side, MCP fetches Merkle witness from AgentPrivacyRegistry on-chain (agent only needs agentSecret)
- For bid range proofs, MCP auto-fetches reservePrice and maxBudget from engine's `GET /auctions/:id` — agent just provides bid amount

### ZK Config & Secrets
- MCP server reads agent state from existing agent-N.json files (created in Phase 1), path configured via env var (e.g., `AGENT_STATE_FILE`)
- Agent state files contain agentSecret + nullifiers (git-ignored)
- For server-side proof generation, agentSecret is inferred from the loaded state file — agent indicates `generateProof: true` rather than passing secrets
- .wasm/.zkey circuit artifacts accessed via `packages/crypto` package imports (monorepo paths)

### Error Responses
- Structured error objects: `{ code, detail, suggestion }` for all ZK-specific failures
- Specific error codes differentiated: `PROOF_INVALID`, `NULLIFIER_REUSED`, `AGENT_NOT_REGISTERED`, `INVALID_SECRET`, `STALE_ROOT`, `REGISTRY_ROOT_MISMATCH`
- Each error includes a remediation suggestion (e.g., "regenerate proof", "re-register on-chain")
- Helps AI agents self-diagnose and decide next action autonomously

### E2E Validation
- Integration tests: automated, CI-ready, using vitest + miniflare (matching existing engine test infrastructure)
- Two test tiers: fast fixture-based tests (pre-generated proof JSON, ~100ms) + slow real-generation tests (snarkjs + .wasm/.zkey, ~5-10s)
- Tests validate: proof accepted with ENGINE_REQUIRE_PROOFS=true, request rejected without proof

### Claude's Discretion
- Merkle tree caching strategy (TTL-based vs fresh fetch) — pick what's pragmatic for hackathon
- Test root injection method (DO storage vs mock RPC) — pick what works cleanly with existing test setup
- Whether integration tests also validate WebSocket event output (zkNullifier/bidCommitment fields)
- Whether structured errors include a `raw` debug field with the original engine error string

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/crypto/src/proof-generator.ts`: `generateMembershipProof()` and `generateBidRangeProof()` — wire-compatible with engine's expected proof payload shapes
- `packages/crypto/src/signal-indices.ts`: `MEMBERSHIP_SIGNALS` and `BID_RANGE_SIGNALS` constants
- `packages/crypto/src/nullifier.ts`: `deriveNullifierBigInt(agentSecret, auctionId, ActionType.JOIN)` — canonical Poseidon nullifier matching circuit output
- `mcp-server/src/lib/signer.ts`: `ActionSigner` with `signJoin()` and `signBid()` — EIP-712 signing already includes `nullifier` field in Join type
- `mcp-server/src/lib/engine.ts`: `EngineClient` with generic `post()` method — proof field passes through via JSON serialization
- `engine/src/lib/crypto.ts`: Full snarkjs.groth16.verify with inlined vkeys for both circuits, type guards `isMembershipProofPayload` / `isBidRangeProofPayload`

### Established Patterns
- Engine `ActionRequest.proof` is `unknown` — already accepts any proof shape, type-guarded internally
- Engine has two-path nullifier logic: Poseidon (from ZK proof publicSignals[2]) when proof present, keccak256 fallback when absent
- MCP tools use Zod schemas for input validation, return structured `ToolResult` objects
- Engine tests use vitest + miniflare with `createAuctionRoom()` test helper
- EIP-712 types are defined identically in 4 places (mcp-server, engine, packages/crypto, agent-client)

### Integration Points
- `mcp-server/src/tools/join.ts`: Needs proof parameter added to Zod schema, proof passed in POST body to engine
- `mcp-server/src/tools/bid.ts`: Same — proof parameter + pass-through
- `mcp-server/src/lib/signer.ts` `signJoin()`: Must branch on proof presence — use Poseidon nullifier from `publicSignals[2]` instead of keccak256 `deriveJoinNullifier()`
- `mcp-server/src/lib/config.ts`: Needs `AGENT_STATE_FILE` env var for loading agent-N.json
- Engine routes (`POST /auctions/:id/action`): No changes needed — transparent proxy to DO

### Critical Wiring Gap
- `signJoin()` currently always uses keccak256 nullifier (`deriveJoinNullifier(wallet, auctionId)`)
- When ZK proof is present, engine verifies EIP-712 signature with Poseidon nullifier from `publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER]`
- **The signer must switch to Poseidon nullifier when proof is provided** — this is the central fix

</code_context>

<specifics>
## Specific Ideas

- Agent experience should be minimal: just `generateProof: true` on the tool call triggers full server-side proof generation
- MCP server handles all complexity: fetching Merkle witness, reading auction params, generating proofs, switching nullifier type
- Pre-built proof path exists for advanced agents that want to generate their own proofs

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-mcp-engine-wiring*
*Context gathered: 2026-03-02*
