---
status: complete
phase: 12-debug-live-phase-10-registration-and-proof-failures
source:
  - 12-01-SUMMARY.md
  - 12-02-SUMMARY.md
  - 12-03-SUMMARY.md
started: 2026-03-06T13:59:00Z
updated: 2026-03-06T15:23:44Z
---

## Current Test

[testing complete]

## Tests

### 1. register_identity Tells the Reconciled Truth
expected: |
  If live onboarding partially fails but the final chain state is usable, `register_identity`
  should return success with warning metadata instead of a misleading hard failure. If the local
  state file is missing or final readiness is incomplete, it should fail with an actionable next step.
result: pass
evidence: |
  Verified with targeted MCP regression coverage:
  - `cd mcp-server && npx vitest run test/register-identity.test.ts`
  - recovered-ready branch passes with `warning.recoveredFrom`
  - incomplete onboarding branch returns `nextAction`
  - missing local state file still fails closed

### 2. join_auction Surfaces Structured Proof Diagnostics
expected: |
  When the engine rejects JOIN for a specific proof-state reason, `join_auction` should expose that
  reason and recovery guidance instead of collapsing everything to a generic `PROOF_INVALID` retry.
result: pass
evidence: |
  Verified with `cd mcp-server && npx vitest run test/join.test.ts`.
  The MCP tool now preserves structured engine errors like `PRIVACY_STATE_UNREADABLE` and keeps the
  readiness-vs-join distinction visible in the returned detail/suggestion fields.

### 3. join_auction Rejects Local State Mismatches Before Submission
expected: |
  With `BASE_SEPOLIA_RPC` configured, auto-generated JOIN proofs should fail before signing/POSTing
  when the local `agent-N.json` file does not match the on-chain Poseidon root or capability commitment
  for the target agent.
result: pass
evidence: |
  Verified with `cd mcp-server && npx vitest run test/join.test.ts`.
  The MCP tool now rejects:
  - mismatched `agentStateFile` vs `agentId`
  - mismatched Poseidon root
  - mismatched capability commitment
  before any engine POST is attempted.

### 4. Engine Fails Closed on Missing or Unreadable Privacy State
expected: |
  JOIN should reject explicitly when per-agent privacy proof state is missing or unreadable on-chain.
  The engine should no longer silently skip those reads and turn the result into a generic invalid proof.
result: pass
evidence: |
  Verified with:
  - `cd engine && npm run test -- test/actions.test.ts test/join-proof.test.ts`
  - `cd engine && npm run typecheck`
  Engine now returns structured fail-closed reasons for:
  - `PRIVACY_STATE_MISSING`
  - `PRIVACY_STATE_UNREADABLE`
  - `registry_root_mismatch`
  - `capability_commitment_mismatch`
  - `groth16_invalid`

### 5. Live Base Sepolia deposit_bond -> join_auction Succeeds for a Fresh Agent
expected: |
  A real Base Sepolia flow `register_identity -> check_identity -> deposit_bond -> join_auction`
  should succeed for a newly onboarded agent using the normal MCP path.
result: issue
reported: "Live Base Sepolia now passes privacy-registry reads, readiness, and bond confirmation, but `join_auction` still cannot complete because Cloudflare Worker proof verification errors with `URL.createObjectURL() is not implemented`."
severity: blocker
evidence: |
  Live chain evidence gathered on 2026-03-06 after the registry redeploy/repoint:
  - new registry address: `0x5b4f09A5D5188dCe1b1ba0caeDBcEb52CaCD1902`
  - agent: `1532`
  - state file: `/tmp/agent-auction-phase12-live/agent-1532.json`
  - `getAgentPoseidonRoot(1532)` returned `0x2d83670208ed0b5fcf1ecf1439e088bde722c5059f07c408f94fed25becdc535`
  - `getAgentCapabilityCommitment(1532)` returned `0x173e9b131821b5b2c0cda05640ed1a6a2d560bd9618685db5d4c81266ca6ad18`
  - `check_identity` returned `readyToParticipate: true`
  - `deposit_bond` returned `CONFIRMED`
  - `join_auction` still failed with:
    `Membership proof verification errored for agent 1532: URL.createObjectURL() is not implemented`

## Summary

total: 5
passed: 4
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "A real Base Sepolia `register_identity -> check_identity -> deposit_bond -> join_auction` flow succeeds for a newly onboarded agent"
  status: failed
  reason: "Live Base Sepolia now uses the correct per-agent privacy registry, but deployed Cloudflare Worker proof verification still fails at runtime with `URL.createObjectURL() is not implemented`."
  severity: blocker
  test: 5
  root_cause: "The remaining blocker is no longer the privacy-registry contract shape. The deployed Worker still cannot complete `snarkjs` / `ffjavascript` proof verification in its current runtime, returning `URL.createObjectURL() is not implemented` during live JOIN verification."
  artifacts:
    - path: "contracts/broadcast/DeployPrivacyRegistry.s.sol/84532/run-latest.json"
      issue: "Contains the successful per-agent registry deployment used for the rerun"
    - path: "engine/src/lib/addresses.ts"
      issue: "Engine now points at the corrected registry address"
    - path: "mcp-server/src/lib/onchain.ts"
      issue: "MCP onboarding writes now target the corrected registry address"
    - path: "mcp-server/src/lib/proof-generator.ts"
      issue: "MCP JOIN proof-state reads now target the corrected registry address"
    - path: ".planning/phases/12-debug-live-phase-10-registration-and-proof-failures/12-03-SUMMARY.md"
      issue: "Live rerun evidence shows the remaining blocker moved from contract deployment to Worker proof runtime"
  missing:
    - "Make `snarkjs` / `ffjavascript` proof verification run inside Cloudflare Workers, or move that verification out of the Worker runtime."
    - "Repeat live `register_identity -> check_identity -> deposit_bond -> join_auction` UAT after the Worker proof-runtime fix."
  debug_session: ".planning/phases/12-debug-live-phase-10-registration-and-proof-failures/12-03-SUMMARY.md"
