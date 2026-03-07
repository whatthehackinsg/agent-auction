---
phase: 15-integrate-agentkit-wallet-adapter-without-breaking-zk-or-erc-8004
plan: 01
subsystem: mcp-server
tags: [mcp, agentkit, cdp, wallet-backend, config]
provides:
  - "Shared supported-vs-advanced wallet-backend selection for MCP write flows"
  - "AgentKit/CDP config surface and backend-aware health reporting"
  - "Focused regression coverage for backend selection, fallback boundaries, and backend-aware target resolution"
affects:
  - 15-02-onchain-identity-bond-exits
  - 15-03-signer-join-bid-reveal
tech-stack:
  added:
    - "@coinbase/agentkit"
  patterns:
    - supported-vs-advanced backend resolution
    - AgentKit/CDP as the default auto-selected write path
    - read-only MCP boot when no write backend is configured
key-files:
  created:
    - mcp-server/src/lib/wallet-backend.ts
    - mcp-server/test/wallet-backend.test.ts
  modified:
    - mcp-server/package.json
    - mcp-server/package-lock.json
    - mcp-server/.env.example
    - mcp-server/src/lib/config.ts
    - mcp-server/src/lib/agent-target.ts
    - mcp-server/src/index.ts
    - mcp-server/test/helpers.ts
key-decisions:
  - "The supported path is represented in code as an explicit wallet-backend contract rather than a raw-key special case"
  - "Auto mode prefers the supported AgentKit/CDP path only when the supported config is complete; partial CDP config is a hard error, not a silent downgrade"
  - "The MCP server now reports backend path and configuration health without requiring write credentials for read-only use"
requirements-completed: [AKIT-01]
completed: 2026-03-07
---

# Phase 15 Plan 01: Wallet Backend Foundation Summary

**Supported AgentKit/CDP backend selection, backend-aware health reporting, and focused config/target regression coverage**

## Accomplishments

- Added `mcp-server/src/lib/wallet-backend.ts` as the shared supported-vs-advanced write backend contract.
- Extended MCP config to understand `MCP_WALLET_BACKEND` plus the supported CDP wallet envs while keeping the raw-key route as the advanced bridge.
- Updated the MCP health endpoint and startup logs to expose backend path and backend misconfiguration clearly.
- Added focused tests that lock the key policy decisions:
  - explicit backend selection
  - AgentKit winning in auto mode when both paths are configured
  - read-only boot with no write backend
  - hard failure on partial CDP config
  - backend-aware target resolution

## Verification

- `cd /Volumes/MainSSD/HomeData/zengy/workspace/auction-design/mcp-server && npm run typecheck && npx vitest run test/wallet-backend.test.ts`

Result:
- `typecheck` passed
- `wallet-backend.test.ts` passed `5/5`

## Issues Encountered

- `@coinbase/agentkit` currently carries its own `viem` dependency tree, which produced type incompatibilities when trying to reuse AgentKit's `ViemWalletProvider` type directly with this repo's local `viem` clients.
- I resolved that by introducing a thin internal write-backend interface around the exact capabilities this repo needs (`signTypedData` and contract writes) instead of coupling the MCP server to AgentKit's internal `viem` types.

## Next Phase Readiness

- `15-02` can now route identity, bond, refund, and withdraw writes through the shared backend contract.
- `15-03` can now swap EIP-712 signing over to the selected backend without changing the auction action contract.

## Self-Check: PASSED

- Found `.planning/phases/15-integrate-agentkit-wallet-adapter-without-breaking-zk-or-erc-8004/15-01-SUMMARY.md`
- Verified the new backend foundation with `typecheck` and focused backend tests
