---
phase: 01-zk-foundation
plan: 02
subsystem: testing
tags: [snarkjs, groth16, circom, zk-proofs, vitest, poseidon, merkle-tree]

# Dependency graph
requires:
  - phase: 01-01
    provides: MEMBERSHIP_SIGNALS and BID_RANGE_SIGNALS constants from signal-indices.ts
provides:
  - End-to-end proof generation + verification tests for both ZK circuits
  - Confirmed .wasm/.zkey artifacts are consistent with vkeys
  - Confirmed full generate→verify path works in packages/crypto isolation
affects:
  - 02-mcp-integration (Phase 2 can rely on tested proof pipeline)
  - future phases using generateMembershipProof / generateBidRangeProof

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Disk vkey loading in tests: fs.readFileSync + JSON.parse on circuits/keys/*.json (no engine import)"
    - "Named signal constant indexing: publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER] instead of publicSignals[2]"
    - "BidRange out-of-range tested via expect(generateBidRangeProof(...)).rejects.toThrow() — circuit constraint throws"
    - "Per-test 60s timeout for ZK proof generation (vitest test-level timeout)"

key-files:
  created:
    - packages/crypto/tests/circuits.test.ts
  modified: []

key-decisions:
  - "Used fs.readFileSync in tests to load vkeys from disk rather than importing snarkjs-verify.ts helpers — keeps tests independent of engine paths and validates the full disk→verify pipeline"
  - "BidRange out-of-range test uses rejects.toThrow() pattern since Circom constraints cause fullProve to throw (not return RANGE_OK=0)"
  - "Created tests/ subdirectory (not test/) matching plan spec; vitest discovers both via **/*.test.ts glob"

patterns-established:
  - "Circuit tests live in packages/crypto/tests/ and load vkeys directly from circuits/keys/ via fs.readFileSync"
  - "All signal index accesses use MEMBERSHIP_SIGNALS / BID_RANGE_SIGNALS named constants"

requirements-completed: [ZKFN-01]

# Metrics
duration: 2min
completed: 2026-03-02
---

# Phase 1 Plan 02: Circuit E2E Tests Summary

**Groth16 proof generate+verify tests for RegistryMembership and BidRange circuits using disk vkeys, covering happy path, tamper detection, and out-of-range rejection**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-02T04:46:15Z
- **Completed:** 2026-03-02T04:47:18Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- 4 new circuit tests added to `packages/crypto/tests/circuits.test.ts`
- RegistryMembership proof generates and verifies (publicSignals root matches Merkle root, nullifier non-zero)
- Tamper test confirms zeroing nullifier makes `groth16.verify` return false
- BidRange in-range proof verifies with RANGE_OK=1
- BidRange out-of-range (bid < reservePrice) correctly throws from circuit constraint
- Total test count: 56 → 60, all passing, exit 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Write circuit proof generation and verification tests** - `8069ae4` (test)

**Plan metadata:** (committed with SUMMARY.md below)

_Note: TDD task — implementation already existed in proof-generator.ts; tests written and run GREEN directly._

## Files Created/Modified

- `packages/crypto/tests/circuits.test.ts` - E2E tests for both Groth16 circuits using disk vkeys and named signal constants

## Decisions Made

- Used `fs.readFileSync` in tests to load vkeys from `circuits/keys/*.json` directly — validates the full disk→verify pipeline without coupling to `snarkjs-verify.ts` helpers
- BidRange out-of-range test uses `rejects.toThrow()` pattern because Circom constraint violation causes `fullProve` to throw (circuit never outputs RANGE_OK=0 for invalid witness)
- Created `tests/` subdirectory as specified in plan; vitest discovers it via `**/*.test.ts` glob without config change

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ZK proof generation + verification pipeline fully tested end-to-end in isolation
- Both circuit artifacts (RegistryMembership, BidRange) confirmed working with their vkeys
- Phase 2 (MCP integration) can import `generateMembershipProof` / `generateBidRangeProof` with confidence
- MEMBERSHIP_SIGNALS / BID_RANGE_SIGNALS constants usage pattern is now established and tested

---
*Phase: 01-zk-foundation*
*Completed: 2026-03-02*
