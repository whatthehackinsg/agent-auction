---
phase: 13-redeploy-agentprivacyregistry-and-repoint-base-sepolia-config
plan: 02
subsystem: engine+mcp-server
tags: [cloudflare-workers, mcp, join, bid, error-contracts]
requires:
  - phase: 13-redeploy-agentprivacyregistry-and-repoint-base-sepolia-config
    plan: 01
    provides: shared Worker-safe verifier backend plus permanent workerd regression harness
provides:
  - shared `PROOF_RUNTIME_UNAVAILABLE` contract across engine JOIN/BID
  - shared MCP proof-error parser for JOIN/BID
  - regression coverage protecting runtime-outage surfacing and ordinary invalid-proof behavior
affects: [join_auction, place_bid, engine-proof-verifier, mcp-error-contracts]
tech-stack:
  added: []
  patterns:
    - Fail closed with structured recovery guidance when the verifier runtime is unavailable
    - Keep runtime outages distinct from malformed proofs, Groth16 invalidity, and on-chain proof-state mismatches
key-files:
  created:
    - .planning/phases/13-redeploy-agentprivacyregistry-and-repoint-base-sepolia-config/13-02-SUMMARY.md
  modified:
    - engine/src/handlers/actions.ts
    - engine/src/lib/crypto.ts
    - engine/test/actions.test.ts
    - mcp-server/src/lib/proof-errors.ts
    - mcp-server/src/tools/join.ts
    - mcp-server/src/tools/bid.ts
    - mcp-server/test/join.test.ts
    - mcp-server/test/bid.test.ts
key-decisions:
  - "JOIN and BID now share the same runtime-outage code family instead of flattening verifier failures into generic proof invalidity."
  - "`check_identity` remains an identity/privacy readiness check; proof-runtime health stays on the write path."
patterns-established:
  - "Engine structured errors carry `reason` and `diagnostics`, and MCP preserves them instead of string-matching legacy failure text."
requirements-completed:
  - ZKRQ-01
  - ZKRQ-02
  - TOOL-02
duration: 1h
completed: 2026-03-07
---

# Phase 13 Plan 02: Shared Runtime-Outage Contract Summary

**JOIN and BID now fail closed with the same structured proof-runtime outage contract across engine and MCP**

## Performance

- **Duration:** ~1h
- **Completed:** 2026-03-07T00:29:58+08:00
- **Tasks:** 2
- **Files modified:** 8 repo files

## Accomplishments

- Extended engine proof verification to classify shared runtime failures explicitly:
  - `proof_runtime_unavailable`
  - while keeping existing lanes like `groth16_invalid`, `malformed_proof`, `registry_root_mismatch`, and `capability_commitment_mismatch`
- Updated `engine/src/handlers/actions.ts` so:
  - JOIN returns structured `PROOF_RUNTIME_UNAVAILABLE`
  - BID returns the same structured `PROOF_RUNTIME_UNAVAILABLE`
  - on-chain privacy-state failures remain distinct as `PRIVACY_STATE_MISSING` and `PRIVACY_STATE_UNREADABLE`
- Added `mcp-server/src/lib/proof-errors.ts` so both MCP tools parse the same structured engine payloads.
- Updated `join_auction` and `place_bid` to surface:
  - `error`
  - `reason`
  - `detail`
  - `suggestion`
  - `diagnostics`
  rather than collapsing everything to generic proof errors.
- Preserved the readiness boundary in JOIN responses: `check_identity` being green still does not imply JOIN proof-runtime health.

## Representative Error Contract

Shared runtime outage contract now looks like:

- `error: "PROOF_RUNTIME_UNAVAILABLE"`
- `reason: "proof_runtime_unavailable"`
- `detail`: includes the human-readable runtime summary
- `diagnostics.verificationDetail`: preserves the raw runtime clue such as `Wasm code generation disallowed by embedder`

## Task Commits

No commits were created during this execution pass.

## Files Created/Modified

- `engine/src/lib/crypto.ts` - introduced structured runtime-outage classification for membership and bid-range verification
- `engine/src/handlers/actions.ts` - mapped verifier runtime failures to fail-closed structured JOIN/BID errors
- `engine/test/actions.test.ts` - protected both JOIN and BID runtime-outage paths with regression coverage
- `mcp-server/src/lib/proof-errors.ts` - added the shared parser for structured engine proof errors
- `mcp-server/src/tools/join.ts` - preserved the readiness-boundary note while surfacing structured runtime outages
- `mcp-server/src/tools/bid.ts` - switched BID to structured engine proof-error parsing
- `mcp-server/test/join.test.ts` - added runtime-outage regression coverage for JOIN
- `mcp-server/test/bid.test.ts` - added runtime-outage regression coverage for BID

## Decisions Made

- Chose a shared engine+MCP contract instead of ad hoc tool-specific error handling.
- Preserved ordinary proof-invalid guidance for malformed or cryptographically invalid proofs.
- Kept the new fail-closed privacy-state checks ahead of JOIN verification, then adjusted tests so the runtime-outage lane is exercised only when on-chain proof state is present.

## Deviations from Plan

- No major scope deviation. The plan was completed as intended, and the structured runtime-outage contract remains valuable even after Plan 13-01 turned the local Worker verifier green.

## Issues Encountered

- A copied JOIN runtime-outage test originally lived in the bid block and short-circuited on `PRIVACY_STATE_MISSING` because the new fail-closed preflight was behaving correctly.
- The regression was fixed by supplying valid mocked privacy-state context before asserting the runtime-outage lane.

## User Setup Required

- None. This change improves failure truthfulness without requiring any environment changes.

## Next Phase Readiness

- The repo now has stable, test-protected runtime-outage handling on top of a Worker-safe local verifier path.
- Final closure now depends on fresh-agent deployed sign-off, not on replacing the verifier backend again.

## Self-Check: PASSED

- `cd engine && npm run typecheck && npm run test -- test/actions.test.ts test/join-proof.test.ts test/bid-proof.test.ts`
- `cd mcp-server && npm run typecheck && npx vitest run test/join.test.ts test/bid.test.ts`
