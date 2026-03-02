# Phase 1: ZK Foundation - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Confirm both Circom circuits produce valid Groth16 proofs, fix the keccak/Poseidon root mismatch so real proofs can pass engine verification, populate the on-chain AgentPrivacyRegistry with test agent commitments, and define shared signal index constants. No MCP/agent-client/frontend work — those are later phases.

</domain>

<decisions>
## Implementation Decisions

### Root Mismatch Fix
- Drop the engine's `expectedRegistryRoot` cross-check in `verifyMembershipProof()` (one-line removal at `engine/src/lib/crypto.ts:288`)
- The on-chain `AgentPrivacyRegistry._updateRoot()` uses keccak256 internally; the circuit uses Poseidon — these will never match
- The engine still verifies the Groth16 proof itself (which internally checks the Poseidon root against the witness), so security is preserved
- The on-chain root becomes a registration record, not a verification input
- No contract redeployment needed

### Test Agent Setup
- Register 3 test agents on Base Sepolia — enough for realistic demo (bidder, competitor, observer)
- Use `prepareOnboarding()` from `packages/crypto/onboarding.ts` to generate secrets + compute commitments
- Use `registerOnChain()` to submit to AgentPrivacyRegistry at `0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff`
- Persist `AgentPrivateState` as JSON files (one per agent) for later phases to load
- Use simple capabilityIds: `[1n]` per agent (single capability sufficient for demo)

### Circuit Test Approach
- Add circuit proof tests to `packages/crypto/` alongside existing 56 tests
- Use `proof-generator.ts` which already wraps `generateMembershipProof()` and `generateBidRangeProof()`
- Tests exercise: proof generation → verification via inlined vkeys → public signal extraction
- Confirms .wasm and .zkey files are consistent with verification keys inlined in engine

### Signal Index Constants
- Create `packages/crypto/src/signal-indices.ts` with named constants
- RegistryMembership: `[0]=registryRoot, [1]=capabilityCommitment, [2]=nullifier`
- BidRange: `[0]=rangeOk, [1]=bidCommitment, [2]=reservePrice, [3]=maxBudget`
- Engine verifier imports these instead of magic numbers

### Claude's Discretion
- Exact test structure (describe/it grouping)
- AgentPrivateState JSON file location and naming
- Whether to create a setup script or inline registration in tests
- Signal constants export format (enum vs const object)

</decisions>

<specifics>
## Specific Ideas

- Hybrid proof generation model decided: MCP server can generate proofs for agents (MCPE-05 in Phase 2), but agent can also generate locally. Phase 1 just confirms the proof-generator works.
- CCIP Private Transactions narrative (DEMO-02) acknowledged as future vision — on-chain bond/settlement data remains public for now, ZK covers the off-chain identity layer.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/crypto/onboarding.ts`: Full onboarding flow — `prepareOnboarding()`, `registerOnChain()`, `buildPoseidonMerkleTree()`, `getMerkleProof()`
- `packages/crypto/proof-generator.ts`: `generateMembershipProof()` + `generateBidRangeProof()` with correct circuit input wiring
- `engine/src/lib/crypto.ts`: `verifyMembershipProof()` + `verifyBidRangeProof()` with inlined vkeys, lazy snarkjs import
- Circuit artifacts: `circuits/RegistryMembership_js/RegistryMembership.wasm`, `circuits/keys/registry_member_final.zkey`

### Established Patterns
- Poseidon hashing via `poseidon-lite` (zero-dep, CF Workers compatible) — used in both packages/crypto and engine
- Lazy snarkjs import in engine (`await import('snarkjs')`) to avoid CF Workers init-time crash
- Engine uses `ENGINE_REQUIRE_PROOFS` env flag to gate proof requirement
- Both proof functions hardcode public signal order in comments — signal-indices.ts formalizes this

### Integration Points
- `engine/src/lib/crypto.ts:288`: The `expectedRegistryRoot` cross-check line to remove
- `engine/src/handlers/actions.ts`: `handleJoin()` and `handleBid()` call verify functions — already wired
- `packages/crypto/src/index.ts`: Re-exports from all modules — new signal-indices.ts exports here
- Circuit .wasm/.zkey paths resolved via `proof-generator.ts:circuitsDir()` relative to package root

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-zk-foundation*
*Context gathered: 2026-03-02*
