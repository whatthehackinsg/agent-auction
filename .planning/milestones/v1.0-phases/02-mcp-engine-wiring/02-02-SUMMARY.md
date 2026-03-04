---
phase: 02-mcp-engine-wiring
plan: 02
subsystem: api
tags: [zk-proofs, groth16, mcp, signer, bid-range, registry-membership, eip-712]

# Dependency graph
requires:
  - phase: 02-mcp-engine-wiring
    plan: 01
    provides: "proof-generator.ts exports, signJoin() proofPayload param, ServerConfig agentStateFile + baseSepoliaRpc"
provides:
  - "join_auction MCP tool with ZK proof support (proofPayload + generateProof params)"
  - "place_bid MCP tool with ZK proof support (proofPayload + generateProof params)"
  - "Structured ZK error responses: PROOF_INVALID, NULLIFIER_REUSED, AGENT_NOT_REGISTERED, STALE_ROOT, INVALID_SECRET"
  - "Bid proof attach-after-sign pattern (BID EIP-712 has no nullifier)"
affects:
  - 02-03-mcp-engine-wiring
  - 02-04-mcp-engine-wiring

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "zkError() helper: { success: false, error: { code, detail, suggestion } } structured error shape"
    - "Bid proof attach-after-sign: proofPayload spread onto signed BID payload because BID EIP-712 has no nullifier field"
    - "Engine error translation: catch block inspects error message for ZK-specific strings, maps to structured error codes"
    - "Proof resolution guard: proofPayload takes precedence over generateProof, both optional — backward compat preserved"

key-files:
  created: []
  modified:
    - "mcp-server/src/tools/join.ts"
    - "mcp-server/src/tools/bid.ts"

key-decisions:
  - "BID EIP-712 type has no nullifier field — proof attached after signBid() via object spread, not passed into signer"
  - "loadAgentState import in bid.ts unused at runtime (only generateBidRangeProofForAgent called), kept for potential future direct agent state access in bid range server-side generation"
  - "zkError helper duplicated in join.ts and bid.ts (not shared module) to keep each tool file self-contained"

patterns-established:
  - "Proof resolution order: explicit proofPayload > generateProof=true (server-side) > undefined (no proof, backward compat)"
  - "Engine error catch pattern: string-match on error message to classify ZK errors; re-throw unknown errors"
  - "Structured ZK error return: zkError(code, detail, suggestion) returns MCP ToolResult with JSON body, not thrown exception"

requirements-completed: [MCPE-01, MCPE-02]

# Metrics
duration: 10min
completed: 2026-03-02
---

# Phase 2 Plan 2: MCP Tool ZK Proof Wiring Summary

**join_auction and place_bid MCP tools extended with ZK proof pass-through and server-side generation — proofPayload Groth16 proofs reach the engine, generateProof triggers automatic RegistryMembership/BidRange proof generation, and ZK-specific engine errors map to structured { code, detail, suggestion } agent-friendly responses**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-02T15:40:00Z
- **Completed:** 2026-03-02T15:50:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Extended `join_auction` Zod schema with optional `proofPayload` (pre-built Groth16) and `generateProof` (server-side generation trigger)
- Extended `place_bid` Zod schema with the same optional fields, using the BidRange circuit path
- Wired proof resolution in both tools: explicit payload takes precedence, then server-side generation, then no proof (backward compat)
- Implemented structured ZK error translation: engine error strings mapped to `PROOF_INVALID`, `NULLIFIER_REUSED`, `AGENT_NOT_REGISTERED`, `STALE_ROOT`, `INVALID_SECRET` codes
- Correctly deferred BID proof attachment to after `signBid()` — BID EIP-712 domain has no nullifier field, so proof is spread onto the signed payload before engine POST

## Task Commits

1. **Task 1: Extend join_auction tool with ZK proof support** + **Task 2: Extend place_bid tool with ZK proof support** - `99bc11c` (feat)

**Plan metadata:** (to be set in final commit)

## Files Created/Modified

- `mcp-server/src/tools/join.ts` - Added proofPayload/generateProof Zod fields, proof resolution block, signJoin proofPayload wiring, engine error ZK translation, zkError helper
- `mcp-server/src/tools/bid.ts` - Added proofPayload/generateProof Zod fields, proof resolution block, proof-attach-after-sign pattern, engine error ZK translation, zkError helper

## Decisions Made

- BID EIP-712 type has no nullifier field, so the bid proof is attached via object spread onto the signed payload AFTER calling `signBid()`. This is distinct from `join.ts` where proof flows into `signJoin()` itself to influence the Poseidon nullifier computation.
- `zkError()` helper is duplicated in each tool file rather than extracted to a shared lib — keeps each tool self-contained, the function is trivially simple (3 lines).
- `loadAgentState` is imported in bid.ts even though the current implementation only calls `generateBidRangeProofForAgent` (which doesn't require agent state directly); the import is present for API consistency with join.ts and potential future extension.

## Deviations from Plan

None - plan executed exactly as written. TypeScript compiled cleanly on first attempt.

## Issues Encountered

None.

## User Setup Required

None - no new environment variables introduced. Existing `AGENT_STATE_FILE` and `BASE_SEPOLIA_RPC` from plan 02-01 apply to `generateProof=true` in both tools.

## Next Phase Readiness

- Plan 02-03 can build engine-side ZK verification knowing MCP tools correctly format and forward proofPayload
- The structured error format `{ code, detail, suggestion }` is locked — engine error strings now have a clear classification contract with MCP tools
- Both tools fully backward compatible: callers omitting proof params see no behavior change

---
*Phase: 02-mcp-engine-wiring*
*Completed: 2026-03-02*

## Self-Check: PASSED

- FOUND: mcp-server/src/tools/join.ts
- FOUND: mcp-server/src/tools/bid.ts
- FOUND: .planning/phases/02-mcp-engine-wiring/02-02-SUMMARY.md
- FOUND: commit 99bc11c
