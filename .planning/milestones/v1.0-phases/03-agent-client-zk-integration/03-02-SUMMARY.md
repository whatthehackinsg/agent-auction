---
phase: 03-agent-client-zk-integration
plan: "02"
subsystem: agent-client
tags: [zk-proofs, groth16, demo, nullifier, bid-range, membership]
dependency_graph:
  requires: [03-01]
  provides: [AGZK-01, AGZK-02, AGZK-03, AGZK-04]
  affects: [agent-client/src/index.ts]
tech_stack:
  added: []
  patterns:
    - Groth16 RegistryMembership proof generated per-agent before joinAuction()
    - Groth16 BidRange proof generated per-agent before placeBid()
    - Nullifier persisted to agent state file AFTER successful engine join response
    - Local usedNullifiers array checked before engine call for double-join prevention
    - validateBidRange() called before generateBidRangeProofForAgent() to fail-fast
key_files:
  created: []
  modified:
    - agent-client/src/index.ts
decisions:
  - agentIds switched from [1001, 1002, 1003] to [1, 2, 3] to match test-agent state files and embedded Merkle commitments
  - Both tasks implemented in one file write and committed as single atomic commit (same file, inseparable flow)
  - In-memory agentState.usedNullifiers updated after persistNullifier() call so double-join demo sees correct state without reloading from disk
metrics:
  duration_minutes: 8
  completed_date: "2026-03-03T13:50:55Z"
  tasks_completed: 2
  files_modified: 1
---

# Phase 3 Plan 2: Agent-Client ZK Proof Demo Integration Summary

**One-liner:** 3-agent demo wired to real Groth16 RegistryMembership + BidRange proofs with nullifier persistence, timing output, and failure case demonstrations (double-join + out-of-range bid).

## What Was Built

Updated `agent-client/src/index.ts` to use the ZK infrastructure from Plan 01 end-to-end:

- **agentIds changed** from `[1001, 1002, 1003]` to `[1, 2, 3]` — matching on-chain registered test-agent state files where agentId is embedded in the Merkle tree commitment
- **Agent state loading**: `getAgentStateFiles(3)` + `loadAgentState()` loads per-agent JSON state (bigint fields, usedNullifiers array)
- **Registry root fetch**: `fetchRegistryRoot(RPC_URL)` reads live on-chain root with 5-min TTL cache
- **RegistryMembership proofs**: generated per-agent before `joinAuction()`, timing printed via `logStep('zk', ...)`
- **Nullifier tracking**: local `usedNullifiers` checked before engine call; `persistNullifier()` called after successful join response; in-memory state updated for same-process double-join detection
- **BidRange proofs**: generated per-agent before `placeBid()` using `generateBidRangeProofForAgent()`, with `validateBidRange()` pre-check to fail-fast before ~2s proof generation
- **Failure case 1 — double-join**: Re-generates same membership proof for Agent-A, catches `NullifierReusedError` locally, logs `PASS: double-join prevented locally`
- **Failure case 2 — out-of-range bid**: Calls `validateBidRange(1 USDC, 80 USDC reserve)`, catches `BidOutOfRangeError`, logs `PASS: out-of-range bid caught` with detail and suggestion
- Settlement/winner/refund logic preserved unchanged

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Integrate ZK proof generation into demo happy path | 7420006 | agent-client/src/index.ts |
| 2 | Add failure case demonstrations (double-join + out-of-range bid) | 7420006 | agent-client/src/index.ts |

## Decisions Made

1. **agentIds [1, 2, 3]**: Required for ZK proofs to verify — agentId is embedded in the Merkle tree commitment; test-agent state files use IDs 1/2/3 matching on-chain registration
2. **Single commit for both tasks**: Both tasks modify the same file; splitting would create a broken intermediate state (happy path without failure demos in same flow)
3. **In-memory usedNullifiers update**: After `persistNullifier()`, push nullifier into `agent.agentState.usedNullifiers` in memory so the double-join demo detects it without reloading from disk

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `npx tsc --noEmit` in agent-client: zero errors
- agentIds confirmed as [BigInt(1), BigInt(2), BigInt(3)]
- All 3 `joinAuction()` calls include `proofPayload: membershipProof`
- All 3 `placeBid()` calls include `proofPayload: bidProofA/B/C`
- Proof timing printed for both membership and bid range proofs
- `persistNullifier()` called after successful `joinAuction()` response
- Double-join demo catches `NullifierReusedError` → logs PASS
- Out-of-range bid demo catches `BidOutOfRangeError` → logs PASS with detail
- Settlement/winner/refund code unchanged

## Self-Check: PASSED

Files exist:
- FOUND: agent-client/src/index.ts

Commits exist:
- FOUND: 7420006 (feat(03-02): integrate ZK proofs end-to-end in agent-client demo)
