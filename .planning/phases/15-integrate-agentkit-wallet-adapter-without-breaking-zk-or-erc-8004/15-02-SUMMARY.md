---
phase: 15-integrate-agentkit-wallet-adapter-without-breaking-zk-or-erc-8004
plan: 02
subsystem: mcp-server
tags: [mcp, agentkit, cdp, onboarding, bond, exits]
provides:
  - "Backend-aware on-chain client helpers for the supported AgentKit/CDP path and the advanced raw-key bridge"
  - "Supported-path onboarding, explicit attach, bond deposit, refund, and withdrawal flows"
  - "Focused regression coverage for one-owner-wallet enforcement and fail-closed ZK state attachment"
affects:
  - 15-04-docs-env-and-live-signoff
tech-stack:
  patterns:
    - backend-aware on-chain clients
    - explicit attach-existing identity adoption
    - one-owner-wallet enforcement across ERC-8004, bond, refund, and withdrawal flows
key-files:
  modified:
    - mcp-server/src/lib/onchain.ts
    - mcp-server/src/lib/identity-check.ts
    - mcp-server/src/tools/identity.ts
    - mcp-server/src/tools/register-identity.ts
    - mcp-server/src/tools/bond.ts
    - mcp-server/src/tools/exits.ts
    - mcp-server/test/identity.test.ts
    - mcp-server/test/register-identity.test.ts
    - mcp-server/test/bond.test.ts
    - mcp-server/test/exits.test.ts
key-decisions:
  - "The supported AgentKit/CDP path reuses one persistent owner wallet for ERC-8004 ownership, bond funding, refunds, and withdrawals"
  - "Existing identity adoption is deliberate via attachExisting instead of implicit guessing"
  - "Missing or mismatched local ZK state remains fail-closed and is surfaced as attach guidance, not silently repaired"
requirements-completed: [AKIT-02, AKIT-03]
completed: 2026-03-07
---

# Phase 15 Plan 02: On-Chain Identity, Bond, and Exit Summary

**Backend-aware onboarding, explicit attach, bond deposit, refund, and withdrawal flows without weakening ERC-8004 ownership or ZK-state requirements**

## Accomplishments

- Added backend-aware Base Sepolia client creation so on-chain helpers can use either the supported AgentKit/CDP backend or the advanced raw-key bridge through the same write surface.
- Updated `check_identity` to resolve the configured wallet from the selected backend and to surface missing compatible local ZK state as an explicit attach requirement when a state path is configured.
- Extended `register_identity` with two deliberate entry paths:
  - platform-managed mint + privacy bootstrap
  - `attachExisting: true` for an already-owned ERC-8004 identity plus compatible local `agent-N.json`
- Moved `deposit_bond`, `claim_refund`, and `withdraw_funds` onto the selected backend while preserving the single owner-wallet invariant and adding `walletBackend` reporting in successful write responses.
- Kept the advanced raw-key bridge available, including the optional `fundingPrivateKey` override for `deposit_bond`, while marking that override unsupported on the primary AgentKit/CDP path.

## Verification

- `cd /Volumes/MainSSD/HomeData/zengy/workspace/auction-design/mcp-server && npm run typecheck && npx vitest run test/identity.test.ts test/register-identity.test.ts test/bond.test.ts test/exits.test.ts`

Result:
- `typecheck` passed
- focused identity/on-chain suite passed `35/35`

## Issues Encountered

- The existing test fixture clients were injected as raw `walletClient` stubs and did not always carry the richer backend metadata added in this phase.
- I normalized `register_identity` to fall back to the account address and selected backend path so the runtime and the focused tests both stay compatible.

## Next Phase Readiness

- `15-03` can now reuse the same backend contract for JOIN/BID/REVEAL typed-data signing.
- `15-04` can document the supported config contract and gather truthful live sign-off evidence.

## Self-Check: PASSED

- Found `.planning/phases/15-integrate-agentkit-wallet-adapter-without-breaking-zk-or-erc-8004/15-02-SUMMARY.md`
- Verified the backend-aware identity/bond/exit layer with focused typecheck and MCP regression coverage
