---
status: complete
phase: 07-identity-verification
source: [07-01-SUMMARY.md, 07-02-SUMMARY.md]
started: 2026-03-05T15:10:00Z
updated: 2026-03-05T15:10:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Engine tests pass with identity hardening
expected: Running `npm run test` in engine/ passes. New identity verification tests (wallet default policy, structured errors, fail-closed RPC) all green. Pre-existing bond-watcher.test.ts failure is known/acceptable.
result: pass

### 2. ENGINE_VERIFY_WALLET defaults to true
expected: With ENGINE_VERIFY_WALLET unset (not in env), the engine treats wallet verification as enabled. A JOIN with a wallet that doesn't match ERC-8004 ownerOf(agentId) is rejected. Verify by checking `resolveVerifyWalletSetting()` returns true when env var is absent.
result: pass

### 3. Structured error codes on /verify-identity
expected: POST /verify-identity returns JSON with `errorCode` field: `AGENT_NOT_REGISTERED` for unknown agentId, `WALLET_MISMATCH` for wrong wallet, `IDENTITY_RPC_FAILURE` (502) for RPC failures. Each includes actionable detail.
result: pass

### 4. Wallet cache removed from DO storage
expected: No references to `walletVerified:` or `poseidonRoot:` cache keys in engine/src/handlers/actions.ts. Every JOIN does fresh on-chain verification (no storage.get/put for wallet cache).
result: pass

### 5. MCP server typechecks clean
expected: Running `npx tsc --noEmit` in mcp-server/ passes with zero errors. The new identity-check.ts and modified join.ts/bid.ts compile cleanly.
result: pass

### 6. join_auction pre-flight blocks unverified agents
expected: Calling join_auction MCP tool when agent is not ERC-8004 verified returns a structured error (toolError with code, detail, suggestion) BEFORE any action is submitted to the engine. Error message includes actionable next steps.
result: pass

### 7. place_bid pre-flight blocks unverified agents
expected: Calling place_bid MCP tool when agent is not verified returns a structured error BEFORE submitting the bid. Works even in restart scenarios where agent calls bid without prior join.
result: pass

### 8. Pre-flight fails closed when engine unreachable
expected: If the engine's /verify-identity endpoint is unreachable, both join_auction and place_bid refuse to proceed (fail closed). They do NOT silently skip verification.
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

[none — all tests passed after fixing test mocks]
