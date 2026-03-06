---
phase: 12-debug-live-phase-10-registration-and-proof-failures
plan: 03
subsystem: contracts
tags: [base-sepolia, privacy-registry, live-uat, cloudflare-workers]
requires:
  - phase: 12-debug-live-phase-10-registration-and-proof-failures
    plan: 02
    provides: truthful live JOIN diagnostics against per-agent privacy state
provides:
  - fresh per-agent AgentPrivacyRegistry deployment on Base Sepolia
  - engine and MCP repointed to the same live privacy-registry address
  - honest rerun evidence for register_identity, check_identity, deposit_bond, and join_auction
affects: [register_identity, check_identity, deposit_bond, join_auction, base-sepolia-uat]
tech-stack:
  added: []
  patterns:
    - Verify contract shape on-chain before trusting a config address
    - Stop at the exact remaining live blocker instead of claiming end-to-end closure
key-files:
  created:
    - .planning/phases/12-debug-live-phase-10-registration-and-proof-failures/12-03-SUMMARY.md
  modified:
    - contracts/broadcast/DeployPrivacyRegistry.s.sol/84532/run-latest.json
    - engine/src/lib/addresses.ts
    - mcp-server/src/lib/onchain.ts
    - mcp-server/src/lib/proof-generator.ts
key-decisions:
  - "Base Sepolia now uses per-agent AgentPrivacyRegistry `0x5b4f09A5D5188dCe1b1ba0caeDBcEb52CaCD1902`."
  - "The gap plan stops with a truthful live blocker because JOIN still fails inside Cloudflare Worker proof verification with `URL.createObjectURL() is not implemented`."
patterns-established:
  - "Post-deploy sanity checks call `getAgentPoseidonRoot(uint256)` and `getAgentCapabilityCommitment(uint256)` before updating engine/MCP config."
requirements-completed: []
duration: 2h
completed: 2026-03-06
---

# Phase 12 Plan 03: Privacy Registry Redeploy Summary

**The legacy Base Sepolia privacy-registry deployment is fixed, but the live JOIN path is still blocked by Worker-side `snarkjs` runtime compatibility**

## Performance

- **Duration:** ~2h
- **Completed:** 2026-03-06T15:23:44Z
- **Tasks:** 2
- **Files modified:** 4 repo files + 1 deployment artifact

## Accomplishments

- Deployed a fresh per-agent `AgentPrivacyRegistry` to Base Sepolia at `0x5b4f09A5D5188dCe1b1ba0caeDBcEb52CaCD1902`.
- Verified the new registry exposes both required per-agent getters without reverting:
  - `getAgentPoseidonRoot(1532)` -> `0x2d83670208ed0b5fcf1ecf1439e088bde722c5059f07c408f94fed25becdc535`
  - `getAgentCapabilityCommitment(1532)` -> `0x173e9b131821b5b2c0cda05640ed1a6a2d560bd9618685db5d4c81266ca6ad18`
- Repointed every hard-coded Base Sepolia consumer to the same new registry address:
  - `engine/src/lib/addresses.ts`
  - `mcp-server/src/lib/onchain.ts`
  - `mcp-server/src/lib/proof-generator.ts`
- Reran the live MCP path after the repoint:
  - fresh `register_identity` minted agent `1532`
  - follow-up `check_identity` returned `readyToParticipate: true`
  - `deposit_bond` reached `CONFIRMED` and reran idempotently
  - `join_auction` still failed, but now only because Worker proof verification errored at runtime

## Task Commits

No commits were created during this local execution pass.

## Files Created/Modified

- `contracts/broadcast/DeployPrivacyRegistry.s.sol/84532/run-latest.json` - recorded the fresh Base Sepolia deployment
- `engine/src/lib/addresses.ts` - repointed engine chain reads to the new privacy-registry address
- `mcp-server/src/lib/onchain.ts` - repointed MCP onboarding writes to the new privacy-registry address
- `mcp-server/src/lib/proof-generator.ts` - repointed MCP proof-state reads to the new privacy-registry address
- `.planning/phases/12-debug-live-phase-10-registration-and-proof-failures/12-03-SUMMARY.md` - recorded the exact post-redeploy live outcome

## Decisions Made

- Fixed the deployment/config truth directly instead of adding a legacy-registry compatibility path.
- Treated the post-redeploy `join_auction` failure as a separate runtime blocker, not as evidence that the registry fix was incomplete.
- Kept the summary honest: `check_identity` and `deposit_bond` are now healthy on the corrected registry, but end-to-end JOIN is still not closed.

## Deviations from Plan

- The plan’s finish line was a fresh successful live `register_identity -> check_identity -> deposit_bond -> join_auction` pass.
- That final step was not reached because Cloudflare Worker proof verification still throws `URL.createObjectURL() is not implemented` during `join_auction`.

## Issues Encountered

- The original configured registry `0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff` was confirmed to be the legacy global-root contract:
  - `getRoot()` succeeded
  - `getAgentPoseidonRoot(agentId)` reverted
  - `getAgentCapabilityCommitment(agentId)` reverted
- After redeploy/repoint, the fresh live agent `1532` proved the registry fix itself is correct:
  - state file: `/tmp/agent-auction-phase12-live/agent-1532.json`
  - worker URL: `https://auction-engine.zengyuzhi2002-efc.workers.dev`
  - live auction rerun: `0x01cc19b91ef47b551a20783ed68136baa96dc5c45712179c391da29858f90aea`
  - confirmed bond tx: `0x19a35ba11d9fe499eb6e0b7de99dd4af7cf5e0fb265a6835fdd13589a0dc6878`
- The remaining failure is now:
  - `join_auction` -> `PROOF_INVALID`
  - detail: `Membership proof verification errored for agent 1532: URL.createObjectURL() is not implemented`

## User Setup Required

- No additional Base Sepolia privacy-registry redeploy is required for this blocker.
- The next engineering step is to make engine proof verification compatible with Cloudflare Workers or move that verification out of the Worker runtime.

## Next Phase Readiness

- Phase 12 gap closure is partially successful: deployment/config truth is fixed and verified.
- The remaining work is no longer a contract-address issue; it is a Worker runtime compatibility issue for `snarkjs` / `ffjavascript`.
- Phase 13, as originally added for redeploy/repoint work, now needs re-scoping before execution.

## Self-Check: PASSED

- `cast call 0x5b4f09A5D5188dCe1b1ba0caeDBcEb52CaCD1902 "getAgentPoseidonRoot(uint256)(bytes32)" 1532 --rpc-url https://sepolia.base.org`
- `cast call 0x5b4f09A5D5188dCe1b1ba0caeDBcEb52CaCD1902 "getAgentCapabilityCommitment(uint256)(bytes32)" 1532 --rpc-url https://sepolia.base.org`
- `rg -n "0x5b4f09A5D5188dCe1b1ba0caeDBcEb52CaCD1902" engine/src/lib/addresses.ts mcp-server/src/lib/onchain.ts mcp-server/src/lib/proof-generator.ts`
- `cd engine && npm run typecheck`
- `cd mcp-server && npm run typecheck`
