# Phase 9: ZK Enforcement - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Make ZK proofs mandatory for join and bid — no opt-out path exists when agent state is configured. Unify readiness check into single flag. Update .env.example documentation.

Requirements: ZKRQ-01, ZKRQ-02, ZKRQ-03, ZKRQ-04

</domain>

<decisions>
## Implementation Decisions

### Proof Generation Trigger
- Remove `generateProof` boolean param from join_auction and place_bid
- When AGENT_STATE_FILE exists, always auto-generate proof (no opt-out)
- Keep `proofPayload` as advanced override for external proof providers (agent-client)
- Mark `proofPayload` in schema as "Advanced: pre-built proof override. Omit to auto-generate."
- Trust caller's proofPayload — engine validates Groth16 proofs server-side, no double verification in MCP

### Engine Default Flip
- `ENGINE_REQUIRE_PROOFS` defaults to **true** when unset (secure by default)
- `ENGINE_ALLOW_INSECURE_STUBS=true` bypasses proof requirement for local dev/tests (same pattern as Phase 7 VERIFY_WALLET)
- Structured error code on missing proof: `{error: 'PROOF_REQUIRED', detail: '...', suggestion: '...'}`
- Sealed-bid path: no changes needed — already enforces BidRange proof on BID_COMMIT

### Readiness Unification
- Merge into single `readyToParticipate` = erc8004Registered AND privacyRegistryRegistered
- Remove `readyForZkProofs` field entirely from check_identity response (not kept as alias)
- AGENT_STATE_FILE is a local config concern — not checked by check_identity (remote-only check)

### Pre-flight Gate
- join/bid pre-flight expanded: (1) identity via /verify-identity, (2) AGENT_STATE_FILE exists locally, (3) privacy registry registered
- Fails fast with clear message before expensive proof generation
- If AGENT_STATE_FILE not set and no proofPayload: hard error `{code: 'ZK_STATE_REQUIRED', detail: '...', suggestion: 'Run prepareOnboarding...'}`

### .env.example
- AGENT_STATE_FILE and BASE_SEPOLIA_RPC moved to top, grouped with AGENT_PRIVATE_KEY and AGENT_ID under `# Required`
- Comment explains they're needed for mandatory ZK proof generation

### Test Strategy
- Update all engine tests to include real Groth16 proofs (not ALLOW_INSECURE_STUBS bypass)
- Proofs generated dynamically at test setup time (beforeAll) using snarkjs
- Accept 10-20s startup time increase for correctness
- No caching layer — regenerate every run

### Agent-Client
- No changes needed — already generates real proofs and passes proofPayload override
- Existing demo flow remains compliant

### Claude's Discretion
- Exact pre-flight check ordering and error message wording
- How to structure test setup proof generation (shared helper vs per-file)
- Whether to batch identity + ZK pre-flight into a single function or keep separate calls

</decisions>

<specifics>
## Specific Ideas

- Follow Phase 7 pattern exactly: default true, ALLOW_INSECURE_STUBS bypass, structured error codes
- "We do not allow non-ZK agents to attend" — this phase enforces what Phase 8 assumed

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `engine/src/handlers/actions.ts` ValidationContext: already has `requireProofs` field — just needs default flip
- `engine/src/auction-room.ts` line 504: `requireProofs: this.env.ENGINE_REQUIRE_PROOFS === 'true'` — change to `!== 'false'`
- `mcp-server/src/tools/join.ts`: has proofPayload + generateProof params — remove generateProof, auto-generate
- `mcp-server/src/tools/bid.ts`: same pattern as join — parallel change
- `mcp-server/src/tools/identity.ts`: returns readyToParticipate + readyForZkProofs — merge and remove
- `mcp-server/src/lib/proof-generator.ts`: existing proof generation functions — reuse for auto-generate
- `mcp-server/src/lib/identity-check.ts`: verifyIdentityPreFlight — expand with ZK readiness checks

### Established Patterns
- Engine env flags: `=== 'true'` for opt-in, `!== 'false'` for default-true (Phase 7 pattern)
- MCP error pattern: `toolError(code, detail, suggestion)` / `zkError(code, detail, suggestion)`
- Pre-flight pattern: `verifyIdentityPreFlight()` in lib/identity-check.ts — extend or compose

### Integration Points
- `engine/src/auction-room.ts` line 504: requireProofs default flip
- `engine/src/handlers/actions.ts` lines 264-270: JOIN proof enforcement
- `engine/src/handlers/actions.ts` lines 420-423: BID proof enforcement
- `mcp-server/src/tools/join.ts` lines 86-127: proof generation logic
- `mcp-server/src/tools/bid.ts` lines 99-180: proof generation logic
- `mcp-server/src/tools/identity.ts` lines 102-106: readiness fields
- `mcp-server/.env.example` lines 9-11: AGENT_STATE_FILE docs

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-zk-enforcement*
*Context gathered: 2026-03-06*
