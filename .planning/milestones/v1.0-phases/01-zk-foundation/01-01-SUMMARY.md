---
phase: 01-zk-foundation
plan: 01
subsystem: api
tags: [snarkjs, groth16, zk-proofs, poseidon, circom, typescript]

# Dependency graph
requires: []
provides:
  - Named signal index constants for RegistryMembership and BidRange ZK circuits
  - Engine verifier free of keccak/Poseidon root cross-check (real Groth16 proofs no longer silently rejected)
affects:
  - 01-zk-foundation/01-02 (agent onboarding uses signal constants)
  - 01-zk-foundation/01-03 (MCP proof submission wiring)
  - 01-zk-foundation/01-04 (nullifier type unification)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Named signal index constants (MEMBERSHIP_SIGNALS, BID_RANGE_SIGNALS) instead of magic numbers for ZK circuit publicSignals[] access
    - Poseidon root is circuit-internal; Groth16 proof provides cryptographic binding — no external root cross-check needed

key-files:
  created:
    - packages/crypto/src/signal-indices.ts
  modified:
    - packages/crypto/src/index.ts
    - engine/src/lib/crypto.ts

key-decisions:
  - "Import signal constants from @agent-auction/crypto in engine — no circular import because dependency is one-directional (engine -> crypto)"
  - "Remove unused expectedRoot local variable entirely rather than leaving it assigned but unused to avoid strict TypeScript warning"
  - "Pre-existing build errors in packages/crypto (snarkjs types, ethers Uint8Array) are out of scope — signal-indices.ts itself typechecks cleanly"

patterns-established:
  - "Signal index constants pattern: define positional indices as named const objects in signal-indices.ts, re-export from index.ts, import in engine"
  - "Cross-check removal pattern: replace deleted logic with explanatory comment referencing issue ID and stating 'Do NOT reinstate'"

requirements-completed: [ZKFN-04, ZKFN-02]

# Metrics
duration: 2min
completed: 2026-03-02
---

# Phase 1 Plan 01: ZK Foundation Signal Constants and Cross-Check Removal Summary

**Named ZK circuit signal index constants (MEMBERSHIP_SIGNALS, BID_RANGE_SIGNALS) added to packages/crypto; engine keccak/Poseidon Merkle root cross-check removed so real Groth16 proofs are no longer silently rejected**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-02T04:15:57Z
- **Completed:** 2026-03-02T04:17:05Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `packages/crypto/src/signal-indices.ts` with `MEMBERSHIP_SIGNALS` (3 signals) and `BID_RANGE_SIGNALS` (4 signals) const objects and their key types
- Re-exported all four symbols from `packages/crypto/src/index.ts`
- Removed the `expectedRegistryRoot` cross-check from `engine/src/lib/crypto.ts` — the check compared a keccak256 on-chain root against a Poseidon circuit root, which can never match, silently rejecting all real ZK proofs
- Replaced all `publicSignals[N]` magic number accesses in both `verifyMembershipProof` and `verifyBidRangeProof` with named constant references

## Task Commits

Each task was committed atomically:

1. **Task 1: Create signal-indices.ts and update index.ts exports** - `388dcd4` (feat)
2. **Task 2: Remove expectedRegistryRoot cross-check and use named signal constants in engine** - `6d793d2` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `packages/crypto/src/signal-indices.ts` - MEMBERSHIP_SIGNALS and BID_RANGE_SIGNALS const objects with MembershipSignalKey and BidRangeSignalKey types; explanatory comment on Poseidon vs keccak256 root mismatch
- `packages/crypto/src/index.ts` - Added `export * from './signal-indices.js'` re-export line
- `engine/src/lib/crypto.ts` - Imports MEMBERSHIP_SIGNALS and BID_RANGE_SIGNALS; removed cross-check; replaced all magic indices with named constants; added ZKFN-02 explanatory comment with "Do NOT reinstate" guard

## Decisions Made
- Import from `@agent-auction/crypto` (not a relative path) — the dependency is already declared in engine/package.json and the dist already contains signal-indices; no circular import risk
- Removed the `const expectedRoot = options?.expectedRegistryRoot` local variable entirely since it became unused after removing the cross-check — avoids a TypeScript strict-mode "declared but never used" error
- Pre-existing `packages/crypto` build errors (snarkjs types, ethers Uint8Array compatibility with newer TS) are out of scope — they predate this plan and `signal-indices.ts` itself is error-free

## Deviations from Plan

None - plan executed exactly as written.

The plan mentioned a possible circular import issue if `@agent-auction/crypto` import was problematic. No issue occurred — engine already imported from `@agent-auction/crypto/poseidon-chain` on line 22, confirming one-directional dependency.

## Issues Encountered
- Pre-existing TypeScript errors in `packages/crypto` build (snarkjs missing types, ethers Uint8Array incompatibility with newer TypeScript) — not caused by this plan's changes, confirmed by checking that `signal-indices.ts` and `index.ts` additions produce zero new errors

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Signal constants are defined and exported — subsequent plans can import `MEMBERSHIP_SIGNALS` and `BID_RANGE_SIGNALS` from `@agent-auction/crypto`
- Engine verifier no longer rejects real Groth16 proofs due to keccak/Poseidon mismatch — ZK proof submission E2E is unblocked
- Ready for Plan 02: agent onboarding and Poseidon Merkle tree population

## Self-Check: PASSED

- FOUND: packages/crypto/src/signal-indices.ts
- FOUND: packages/crypto/src/index.ts
- FOUND: engine/src/lib/crypto.ts
- FOUND: 01-01-SUMMARY.md
- FOUND commit: 388dcd4 (Task 1)
- FOUND commit: 6d793d2 (Task 2)

---
*Phase: 01-zk-foundation*
*Completed: 2026-03-02*
