---
status: testing
phase: 02-mcp-engine-wiring
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md]
started: 2026-03-02T16:30:00Z
updated: 2026-03-02T16:30:00Z
---

## Current Test

number: 1
name: MCP Server TypeScript Compilation
expected: |
  Running `npx tsc --noEmit` in `mcp-server/` should complete with zero errors. All new types (proof-generator exports, extended ServerConfig, signer proofPayload param) should resolve cleanly.
awaiting: user response

## Tests

### 1. MCP Server TypeScript Compilation
expected: Running `npx tsc --noEmit` in `mcp-server/` completes with zero errors — all new types resolve cleanly.
result: [pending]

### 2. MCP Server Test Suite
expected: Running `npm test` in `mcp-server/` passes all 14 tests — 9 join tests (Poseidon/keccak256 nullifier branching, proof pass-through, error codes) and 5 bid tests (proof pass-through, attach-after-sign, error codes).
result: [pending]

### 3. Engine Test Suite (No Regressions)
expected: Running `npm run test` in `engine/` passes all ZK-related action tests — including 2 new positive-case tests (handleJoin + handleBid with requireProofs=true). Only pre-existing bond-watcher failure is acceptable.
result: [pending]

### 4. join_auction Accepts ZK Proof Params
expected: The `join_auction` MCP tool's Zod schema includes optional `proofPayload` (Groth16 proof object) and `generateProof` (boolean) fields. When `proofPayload` is provided, it reaches the engine POST body. When neither is provided, backward-compatible behavior is preserved.
result: [pending]

### 5. place_bid Accepts ZK Proof Params
expected: The `place_bid` MCP tool's Zod schema includes optional `proofPayload` and `generateProof` fields. Bid proof is attached AFTER `signBid()` (not passed into signer) because BID EIP-712 has no nullifier field.
result: [pending]

### 6. Proof Generator Module Exports
expected: `mcp-server/src/lib/proof-generator.ts` exports 4 functions: `loadAgentState`, `generateMembershipProofForAgent`, `generateBidRangeProofForAgent`, `fetchRegistryRoot`. The registry root fetch has a 5-min TTL cache.
result: [pending]

### 7. Signer Poseidon Nullifier Branch
expected: `signJoin()` in `mcp-server/src/lib/signer.ts` accepts optional `proofPayload` param. When present, it uses `BigInt(publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER])` for the Poseidon nullifier. Without proof, falls back to keccak256 derivation.
result: [pending]

### 8. bidCommitment Threading in Engine
expected: `AuctionEvent` type in `engine/src/types/engine.ts` includes `bidCommitment?: string`. The field is populated from BidRange proof verification in `handleBid()` and threaded through `ingestAction()` into event storage.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0

## Gaps

[none yet]
