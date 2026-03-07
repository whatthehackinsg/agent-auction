---
phase: 15-integrate-agentkit-wallet-adapter-without-breaking-zk-or-erc-8004
plan: 03
subsystem: mcp-server
tags: [mcp, agentkit, cdp, eip712, join, bid, reveal]
provides:
  - "Backend-aware EIP-712 action signing for JOIN, BID, BID_COMMIT, and REVEAL"
  - "Supported-path MCP write responses that report the active backend"
  - "Focused regression coverage for AgentKit/CDP-backed JOIN, BID, and REVEAL flows"
affects:
  - 15-04-docs-env-and-live-signoff
tech-stack:
  patterns:
    - backend-backed typed-data signing
    - explicit fail-closed backend selection
    - invariant-preserving JOIN/BID/REVEAL action wiring
key-files:
  modified:
    - mcp-server/src/lib/signer.ts
    - mcp-server/src/tools/join.ts
    - mcp-server/src/tools/bid.ts
    - mcp-server/src/tools/reveal.ts
    - mcp-server/test/join.test.ts
    - mcp-server/test/bid.test.ts
    - mcp-server/test/reveal.test.ts
key-decisions:
  - "The EIP-712 domain/types, JOIN nullifier derivation, and proof payload semantics stay unchanged"
  - "The selected backend only replaces the signing source; it does not change the auction action contract"
  - "Incomplete supported-path config fails closed and points operators to the advanced bridge instead of silently downgrading"
requirements-completed: [AKIT-02, AKIT-03]
completed: 2026-03-07
---

# Phase 15 Plan 03: Action Signing Summary

**AgentKit/CDP-backed JOIN, BID, BID_COMMIT, and REVEAL signing without changing the current ZK proof or EIP-712 contracts**

## Accomplishments

- Refactored `ActionSigner` so it can sign from either a raw private key or a backend-provided `signTypedData` capability.
- Updated `join_auction`, `place_bid`, and `reveal_bid` to resolve the selected backend and use it for typed-data signing while preserving:
  - the current EIP-712 domain and type definitions
  - JOIN proof-bound Poseidon nullifier semantics
  - BID/BID_COMMIT proof attachment behavior
  - REVEAL signature shape
- Added `walletBackend` reporting to successful JOIN/BID/BID_COMMIT/REVEAL responses so supported-path writes are distinguishable from the advanced raw-key bridge.
- Added focused supported-path tests by mocking the AgentKit/CDP provider surface and verifying the MCP tools still behave correctly without changing proof or signing invariants.

## Verification

- `cd /Volumes/MainSSD/HomeData/zengy/workspace/auction-design/mcp-server && npm run typecheck && npx vitest run test/wallet-backend.test.ts test/join.test.ts test/bid.test.ts test/reveal.test.ts`

Result:
- `typecheck` passed
- focused backend/signing suite passed `36/36`

## Issues Encountered

- The supported AgentKit path and the advanced raw-key path need to share the same tool surface without sharing the same concrete signer type.
- I resolved that by making `ActionSigner` depend on a tiny address + `signTypedData` contract instead of a specific account implementation.

## Next Phase Readiness

- `15-04` can now document the supported config contract and gather truthful live Base Sepolia evidence for the full supported path.

## Self-Check: PASSED

- Found `.planning/phases/15-integrate-agentkit-wallet-adapter-without-breaking-zk-or-erc-8004/15-03-SUMMARY.md`
- Verified backend-aware signing with focused JOIN/BID/REVEAL regression coverage
