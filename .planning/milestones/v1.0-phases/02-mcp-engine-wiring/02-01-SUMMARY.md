---
phase: 02-mcp-engine-wiring
plan: 01
subsystem: api
tags: [zk-proofs, snarkjs, groth16, eip-712, poseidon, mcp, ethers, viem]

# Dependency graph
requires:
  - phase: 01-zk-foundation
    provides: "@agent-auction/crypto with MEMBERSHIP_SIGNALS, generateMembershipProof, generateBidRangeProof, buildPoseidonMerkleTree, getMerkleProof, readRegistryRoot, AgentPrivateState, Groth16Proof"
provides:
  - "MCP server @agent-auction/crypto dependency (file:../packages/crypto)"
  - "ServerConfig.agentStateFile + baseSepoliaRpc env var fields"
  - "ActionSigner.signJoin() with Poseidon nullifier branch (ZK proof path) + keccak256 fallback"
  - "proof-generator.ts: loadAgentState, generateMembershipProofForAgent, generateBidRangeProofForAgent, fetchRegistryRoot"
affects:
  - 02-02-mcp-engine-wiring
  - 02-03-mcp-engine-wiring

# Tech tracking
tech-stack:
  added:
    - "@agent-auction/crypto (file:../packages/crypto) — ZK proof generation and signal constants"
    - "ethers@^6.16.0 — JsonRpcProvider for on-chain registry root reads"
  patterns:
    - "Poseidon nullifier branch: signJoin() uses BigInt(publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER]) when proofPayload present, keccak256 fallback otherwise"
    - "Agent state deserialization: trailing-n bigint format (e.g. '48522356...n') stripped and passed to BigInt()"
    - "zeroHashes cast pattern: (treeResult as any).zeroHashes for getMerkleProof (established in circuits tests)"
    - "Registry root TTL cache: module-level { root, fetchedAt } object, 5-minute TTL"
    - "maxBudget=0 sentinel: substitute BigInt(2**48) for uncapped auctions in BidRange circuit"

key-files:
  created:
    - "mcp-server/src/lib/proof-generator.ts"
  modified:
    - "mcp-server/package.json"
    - "mcp-server/package-lock.json"
    - "mcp-server/src/lib/config.ts"
    - "mcp-server/src/lib/signer.ts"

key-decisions:
  - "Added ethers as direct mcp-server dependency (not just transitive via crypto) because readRegistryRoot requires ethers.Provider — needed JsonRpcProvider to bridge rpcUrl string to provider"
  - "Poseidon nullifier in signJoin() is gated on proofPayload presence — backward compatible, keccak256 path preserved for non-ZK joins"
  - "fetchRegistryRoot uses AGENT_PRIVACY_REGISTRY constant (deployed Base Sepolia address) — not configurable, matches invariant that registry address is fixed"
  - "BidRange maxBudget=0 substituted with BigInt(2**48) sentinel — circuit requires reservePrice <= bid <= maxBudget, so 0 would always fail"

patterns-established:
  - "Nullifier duality: signer branches on proofPayload — Poseidon when proof present, keccak256 fallback without proof"
  - "Agent state file deserialization: deserializeBigInt() strips trailing n before BigInt() conversion"
  - "Module-level TTL cache pattern for RPC calls: { value, fetchedAt } with configurable TTL constant"

requirements-completed: [MCPE-03, MCPE-05]

# Metrics
duration: 15min
completed: 2026-03-02
---

# Phase 2 Plan 1: MCP ZK Infrastructure Summary

**MCP server wired for ZK proofs: @agent-auction/crypto linked, signJoin() branched on Poseidon/keccak256 nullifier, and proof-generator.ts providing server-side RegistryMembership and BidRange proof generation with Merkle witness rebuild and registry root caching**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-02T15:23:00Z
- **Completed:** 2026-03-02T15:38:11Z
- **Tasks:** 3
- **Files modified:** 5 (+ 1 created)

## Accomplishments

- Linked `@agent-auction/crypto` as a monorepo file dependency in mcp-server, enabling ZK proof generation imports
- Extended `ServerConfig` with `agentStateFile` and `baseSepoliaRpc` fields, read from `AGENT_STATE_FILE` and `BASE_SEPOLIA_RPC` env vars
- Fixed the EIP-712 nullifier mismatch: `signJoin()` now uses the Poseidon nullifier from ZK proof public signals when `proofPayload` is provided, falling back to keccak256 for non-ZK joins
- Created `proof-generator.ts` with full server-side proof generation: loads agent state JSON, rebuilds Poseidon Merkle tree, generates RegistryMembership and BidRange Groth16 proofs, and caches the on-chain registry root with 5-min TTL

## Task Commits

1. **Task 1: Add @agent-auction/crypto dep and extend ServerConfig** - `85293d0` (feat)
2. **Task 2: Switch signJoin() nullifier to Poseidon when proof present** - `318c0de` (feat)
3. **Task 3: Create proof-generator.ts** - `d7f8054` (feat)

## Files Created/Modified

- `mcp-server/src/lib/proof-generator.ts` - Server-side proof generation: loadAgentState, generateMembershipProofForAgent, generateBidRangeProofForAgent, fetchRegistryRoot
- `mcp-server/package.json` - Added @agent-auction/crypto and ethers dependencies
- `mcp-server/src/lib/config.ts` - Extended ServerConfig with agentStateFile and baseSepoliaRpc
- `mcp-server/src/lib/signer.ts` - signJoin() Poseidon nullifier branch with proofPayload param

## Decisions Made

- Added `ethers` as a direct `mcp-server` dependency (not just transitive via crypto package) because `readRegistryRoot` from `@agent-auction/crypto/onboarding` requires an `ethers.Provider` object — a `JsonRpcProvider` is constructed from the `baseSepoliaRpc` URL string at call time.
- `signJoin()` Poseidon branch is gated on `proofPayload` presence — the keccak256 path is fully preserved for backward-compatible non-ZK joins.
- `AGENT_PRIVACY_REGISTRY` address hardcoded as constant in `proof-generator.ts` matching the deployed Base Sepolia address — consistent with Architecture Invariants (fixed deployed contracts).
- `maxBudget === 0n` substituted with `BigInt(2 ** 48)` sentinel — the BidRange circuit constraint `reservePrice <= bid <= maxBudget` would always fail with `maxBudget=0`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added ethers as direct mcp-server dependency**
- **Found during:** Task 3 (proof-generator.ts creation)
- **Issue:** `readRegistryRoot` from `@agent-auction/crypto` requires `ethers.Provider` — plan spec said `readRegistryRoot(rpcUrl)` but actual signature is `readRegistryRoot(registryAddress, provider)`. mcp-server had no `ethers` dependency.
- **Fix:** `npm install ethers@^6.13.0`; constructed `new ethers.JsonRpcProvider(rpcUrl)` in `fetchRegistryRoot()` using the `AGENT_PRIVACY_REGISTRY` constant.
- **Files modified:** `mcp-server/package.json`, `mcp-server/package-lock.json`
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** `d7f8054` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — missing dependency)
**Impact on plan:** Required to bridge rpcUrl string to ethers.Provider. No scope creep; the `fetchRegistryRoot(rpcUrl)` interface is preserved as specified.

## Issues Encountered

None beyond the ethers dependency fix documented above.

## User Setup Required

None - no external service configuration required for this infrastructure plan. Users wanting to enable server-side proof generation should set:
- `AGENT_STATE_FILE` — path to `packages/crypto/test-agents/agent-N.json`
- `BASE_SEPOLIA_RPC` — Base Sepolia JSON-RPC endpoint URL

## Next Phase Readiness

- Plan 02-02 can now wire `auction_join` and `auction_bid` MCP tools to call `generateMembershipProofForAgent` / `generateBidRangeProofForAgent` and pass `proofPayload` to `signJoin()` / `signBid()`
- All proof generation primitives are in place; tool-level orchestration is the remaining work
- `fetchRegistryRoot()` is ready for use in tool handlers when `baseSepoliaRpc` is configured

---
*Phase: 02-mcp-engine-wiring*
*Completed: 2026-03-02*
