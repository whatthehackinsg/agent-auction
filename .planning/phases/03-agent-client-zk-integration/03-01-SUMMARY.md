---
phase: 03-agent-client-zk-integration
plan: 01
subsystem: agent-client
tags: [zk-proofs, groth16, agent-client, poseidon, nullifier, privacy]
dependency_graph:
  requires:
    - 02-mcp-engine-wiring (engine verifies ZK proofs, MCP server proof-generator.ts reference)
  provides:
    - agent-client ZK proof generation (RegistryMembership + BidRange)
    - Poseidon nullifier in joinAuction EIP-712 signatures
    - BidRange proof forwarding in placeBid
    - Multi-agent state file loading infrastructure
  affects:
    - agent-client/src/zk.ts (new)
    - agent-client/src/auction.ts (proof wiring)
    - agent-client/src/privacy.ts (keccak → Poseidon)
tech_stack:
  added:
    - "@agent-auction/crypto: file:../packages/crypto (Groth16 proof generation)"
    - "ethers: ^6.13.0 (required by readRegistryRoot in crypto package)"
  patterns:
    - "Poseidon nullifier gated on proofPayload presence — keccak fallback preserved (backward compatible)"
    - "AgentStateWithNullifiers extends AgentPrivateState — usedNullifiers tracked per agent"
    - "persistNullifier() writes AFTER successful engine response only — prevents false spend marking"
    - "validateBidRange() pre-validates before fullProve to avoid wasted ~2s circuit execution"
    - "fetchRegistryRoot() 5-min TTL cache — avoids repeated RPC calls during session"
key_files:
  created:
    - agent-client/src/zk.ts
  modified:
    - agent-client/package.json
    - agent-client/package-lock.json
    - agent-client/src/config.ts
    - agent-client/src/auction.ts
    - agent-client/src/privacy.ts
decisions:
  - "computeRegistrationCommit from @agent-auction/crypto is synchronous keccak256 (not Poseidon hash) — matches onboarding.ts pattern; preparePrivacyState uses it correctly without await"
  - "privacy.ts re-exports AgentPrivateState type from @agent-auction/crypto instead of redefining locally — ensures type compatibility with proof generation functions"
  - "preparePrivacyState() changed from sync to async (buildPoseidonMerkleTree is async) — callers must await"
  - "npm install --legacy-peer-deps required — permissionless@0.3.4 has optional peer ox@^0.11.3 conflict"
metrics:
  duration: "~3 minutes"
  completed_date: "2026-03-03"
  tasks_completed: 3
  files_created: 1
  files_modified: 5
---

# Phase 3 Plan 1: ZK Proof Wiring into Agent-Client Summary

**One-liner:** Agent-client wired with real Groth16 ZK proof generation via @agent-auction/crypto — RegistryMembership Poseidon nullifier in EIP-712 Join, BidRange proof forwarding in Bid, full error class hierarchy.

## Tasks Completed

| # | Task | Commit | Key files |
|---|------|--------|-----------|
| 1 | Add @agent-auction/crypto dependency and extend config | 57e1af6 | package.json, src/config.ts |
| 2 | Create zk.ts — proof generation, state management, error classes | bd1d39b | src/zk.ts (new, 258 lines) |
| 3 | Wire proof payloads into joinAuction/placeBid + replace privacy.ts keccak | 533b40c | src/auction.ts, src/privacy.ts |

## What Was Built

### zk.ts (new module, 258 lines)

Full ZK proof generation infrastructure mirroring `mcp-server/src/lib/proof-generator.ts` with agent-client-specific additions:

**Error classes:**
- `ZkProofError` — base class with `code`, `detail`, `suggestion` fields
- `NullifierReusedError` — thrown when `usedNullifiers` contains the new nullifier (NULLIFIER_REUSED)
- `BidOutOfRangeError` — thrown by `validateBidRange()` before proof generation (BID_OUT_OF_RANGE)

**State management:**
- `AgentStateWithNullifiers` — extends `AgentPrivateState` with `usedNullifiers: string[]`
- `loadAgentState(filePath)` — reads agent-N.json, deserializes trailing-`n` bigint fields
- `persistNullifier(filePath, nullifier)` — writes used nullifier back to state file AFTER success

**Proof generation:**
- `generateMembershipProofForAgent(agentState, auctionId, registryRoot)` — rebuilds Poseidon Merkle tree, calls `generateMembershipProof`
- `generateBidRangeProofForAgent(bidAmount, reservePrice, maxBudget)` — maxBudget=0 → BigInt(2**48) sentinel
- `validateBidRange(bid, reservePrice, maxBudget)` — pre-validation throws before fullProve

**Infrastructure:**
- `fetchRegistryRoot(rpcUrl)` — reads AgentPrivacyRegistry.getRoot() with 5-min TTL cache
- `getAgentStateFiles(count)` — resolves agent-1.json..agent-N.json from AGENT_STATE_DIR

### auction.ts changes

- `joinAuction()` extended with optional `proofPayload?: { proof: unknown; publicSignals: string[] }`
- Poseidon nullifier path: `BigInt(proofPayload.publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER])` when proofPayload present
- keccak256 fallback preserved via `deriveJoinNullifier()` when no proofPayload
- `placeBid()` extended with same optional `proofPayload` — forwarded to engine in `proof` field
- EIP-712 Bid type unchanged (no nullifier field) — proof attached after signing

### privacy.ts changes

- Removed local `generateSecret()` and `computeRegistrationCommit()` (keccak-based)
- Now imports `generateSecret`, `computeRegistrationCommit`, `buildPoseidonMerkleTree` from `@agent-auction/crypto`
- `preparePrivacyState()` now uses Poseidon Merkle tree for capabilityMerkleRoot computation
- `AgentPrivateState` re-exported from `@agent-auction/crypto` (not redefined locally)
- `registerPrivacy()` and `readRegistryRoot()` unchanged

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] computeRegistrationCommit is synchronous, not async**
- **Found during:** Task 3 — TypeScript error TS2554 on line 81
- **Issue:** Plan indicated `poseidonCommit` should be awaited; actual `computeRegistrationCommit` in `@agent-auction/crypto/onboarding.ts` returns `string` synchronously (uses ethers.solidityPackedKeccak256)
- **Fix:** Removed `await` from `poseidonCommit()` call in `preparePrivacyState()`
- **Files modified:** agent-client/src/privacy.ts
- **Commit:** 533b40c (same task commit, caught before commit)

**2. [Rule 3 - Blocking] npm install peer dep conflict**
- **Found during:** Task 1 — npm error on permissionless@0.3.4 peerOptional ox@^0.11.3
- **Issue:** `npm install` failed due to optional peer dependency conflict
- **Fix:** Used `npm install --legacy-peer-deps` (same approach as existing monorepo pattern)
- **Files modified:** agent-client/package-lock.json
- **Commit:** 57e1af6

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| agent-client/src/zk.ts exists | FOUND |
| agent-client/src/auction.ts exists | FOUND |
| agent-client/src/privacy.ts exists | FOUND |
| agent-client/src/config.ts exists | FOUND |
| 03-01-SUMMARY.md exists | FOUND |
| Commit 57e1af6 (Task 1) | FOUND |
| Commit bd1d39b (Task 2) | FOUND |
| Commit 533b40c (Task 3) | FOUND |
| ZkProofError exported | FOUND |
| NullifierReusedError exported | FOUND |
| BidOutOfRangeError exported | FOUND |
| AgentStateWithNullifiers exported | FOUND |
| loadAgentState exported | FOUND |
| persistNullifier exported | FOUND |
| getAgentStateFiles exported | FOUND |
| fetchRegistryRoot exported | FOUND |
| generateMembershipProofForAgent exported | FOUND |
| generateBidRangeProofForAgent exported | FOUND |
| validateBidRange exported | FOUND |
| MEMBERSHIP_SIGNALS.NULLIFIER used in auction.ts | FOUND |
| proofPayload param on joinAuction | FOUND |
| proofPayload param on placeBid | FOUND |
| @agent-auction/crypto in package.json | FOUND |
| npx tsc --noEmit passes | PASSED |
| node import test passes | PASSED |
