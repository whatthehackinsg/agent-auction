---
phase: 10-autonomous-mcp-tools
plan: 01
subsystem: api
tags: [mcp, erc-8004, viem, zk, onboarding]
requires:
  - phase: 09-zk-enforcement
    provides: fail-closed readiness checks and MCP proof/state expectations
provides:
  - register_identity bootstraps ERC-8004 minting, privacy registration, state-file persistence, and readiness verification in one MCP call
  - Shared Base Sepolia on-chain helpers for identity, privacy, escrow, and USDC interactions
  - Deterministic agent-N.json persistence helpers for multi-agent state files
affects: [phase-10-02-bonding, phase-10-03-exits, phase-10-04-docs, mcp-server]
tech-stack:
  added: []
  patterns:
    - Recovery-friendly MCP write tools that surface partial success details after on-chain side effects
    - Data-URI ERC-8004 registration payloads with saved local ZK state for immediate MCP reuse
key-files:
  created:
    - mcp-server/src/lib/onchain.ts
    - mcp-server/src/lib/agent-state.ts
    - mcp-server/src/tools/register-identity.ts
    - mcp-server/test/register-identity.test.ts
  modified:
    - mcp-server/src/lib/config.ts
    - mcp-server/src/index.ts
    - mcp-server/test/helpers.ts
key-decisions:
  - "register_identity mints via ERC-8004 register(string agentURI) using a self-contained data URI payload rather than legacy agent:// metadata."
  - "The tool persists agent-N.json before privacy registration so a minted identity can still be recovered if the second on-chain step fails."
  - "Success responses stay flat and machine-friendly, while partial failures include agentId, tx hash, wallet, and saved state-file recovery details."
patterns-established:
  - "Wave-1 contract helpers live in mcp-server/src/lib/onchain.ts and are reused via injected clients in tests."
  - "Registration-time config is validated with requireRegistrationConfig() so read-only MCP use remains unaffected."
requirements-completed: [TOOL-01]
duration: 24min
completed: 2026-03-06
---

# Phase 10 Plan 01: Autonomous Registration Summary

**One-shot MCP onboarding that mints a real ERC-8004 identity, bootstraps privacy membership, saves agent state, and confirms readiness immediately**

## Performance

- **Duration:** 24 min
- **Started:** 2026-03-06T19:13:00+08:00 (approx)
- **Completed:** 2026-03-06T19:37:00+08:00
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added a real `register_identity` MCP tool that creates a Base Sepolia ERC-8004 identity with a JSON data URI, runs privacy bootstrap, writes an `agent-N.json` file, and returns readiness in one response.
- Finalized shared Base Sepolia helpers for ERC-8004 registration, privacy registration, USDC transfer, and escrow reads/writes, alongside deterministic state-file persistence helpers for multi-agent workflows.
- Added focused tests covering the actual user flow: `register(string)`, data-URI payload generation, saved state-file output, readiness verification, and partial-failure recovery details.

## Task Commits

No commits were created during this local execution pass.

## Files Created/Modified

- `mcp-server/src/lib/config.ts` - adds registration-time config validation without breaking read-only MCP usage
- `mcp-server/src/lib/onchain.ts` - centralizes Base Sepolia ABIs, clients, identity minting, privacy registration, escrow helpers, and USDC transfer helper
- `mcp-server/src/lib/agent-state.ts` - serializes and persists deterministic `agent-N.json` files compatible with proof generation
- `mcp-server/src/tools/register-identity.ts` - implements the new one-shot MCP registration flow with recovery-friendly partial failures
- `mcp-server/src/index.ts` - wires `register_identity` into the MCP server alongside `check_identity`
- `mcp-server/test/helpers.ts` - adds reusable fake on-chain clients, receipts, and readiness helpers for contract-facing tool tests
- `mcp-server/test/register-identity.test.ts` - verifies the real bootstrap flow and config failure handling

## Decisions Made

- Used a JSON `data:` URI for ERC-8004 metadata so registration stays self-contained and does not depend on hosted metadata.
- Persisted local ZK state before the privacy tx so a minted identity is still recoverable if AgentPrivacyRegistry registration fails.
- Kept response fields flat (`agentId`, tx hashes, `stateFilePath`, readiness) so agents can consume the result without extra parsing logic.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Wave 1 had partial groundwork already present in the worktree (`config`, `onchain`, `agent-state`, and test-helper updates) from an earlier interrupted execution, so the local pass completed by adding the missing tool, tests, and MCP wiring on top of that base.

## User Setup Required

None - no new external setup beyond the already-required `AGENT_PRIVATE_KEY` and `BASE_SEPOLIA_RPC`.

## Next Phase Readiness

- Phase `10-02` can now reuse `mcp-server/src/lib/onchain.ts` for owner checks, USDC transfers, and escrow interactions.
- Multi-agent bonding work can rely on deterministic saved state-file paths (`agent-N.json`) instead of mutating process env.

## Self-Check: PASSED

- `cd mcp-server && npm run typecheck`
- `cd mcp-server && npx vitest run test/register-identity.test.ts`
- `cd mcp-server && npm test`
