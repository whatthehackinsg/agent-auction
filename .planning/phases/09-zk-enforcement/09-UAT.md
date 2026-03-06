status: complete
phase: 09-zk-enforcement
source: [09-01-SUMMARY.md, 09-02-SUMMARY.md]
started: 2026-03-06T08:13:24Z
updated: 2026-03-06T09:17:52Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. check_identity exposes one readiness flag
expected: Call the MCP check_identity flow. The result should include a single actionable `readyToParticipate` flag and should NOT include the old `readyForZkProofs` field. The rest of the diagnostic detail can remain, but there should be just one readiness decision for participation.
result: pass
evidence: Direct built-handler invocation returned `readiness.readyToParticipate: true` and confirmed `readyForZkProofs` is absent.

### 2. join_auction auto-generates a proof when agent state exists
expected: Call `join_auction` without supplying a manual proof payload. If `AGENT_STATE_FILE` is configured, the tool should auto-generate the membership proof and continue the join flow without needing any `generateProof` toggle.
result: pass
evidence: Direct built-handler invocation with `packages/crypto/test-agents/agent-1.json` posted a non-null proof and no `generateProof` field.

### 3. join_auction fails closed when no proof source is available
expected: Call `join_auction` with no `proofPayload` and without a usable `AGENT_STATE_FILE`. The tool should stop before submission and return a `ZK_STATE_REQUIRED` style error telling you to configure local agent state or provide a pre-built proof.
result: pass
evidence: Direct built-handler invocation with `agentStateFile: null` returned `error.code = ZK_STATE_REQUIRED` before any engine action submission.

### 4. place_bid auto-generates a proof when agent state exists
expected: Call `place_bid` without supplying a manual proof payload. If `AGENT_STATE_FILE` is configured, the tool should auto-generate the bid-range proof and continue the bid flow without any `generateProof` toggle.
result: pass
evidence: Direct built-handler invocation with `packages/crypto/test-agents/agent-1.json` and an in-range amount posted a non-null proof, omitted `generateProof`, and included `revealSalt`.

### 5. place_bid fails closed when no proof source is available
expected: Call `place_bid` with no `proofPayload` and without a usable `AGENT_STATE_FILE`. The tool should stop before submission and return a `ZK_STATE_REQUIRED` style error telling you to configure local agent state or provide a pre-built proof.
result: pass
evidence: Direct built-handler invocation with `agentStateFile: null` returned `error.code = ZK_STATE_REQUIRED` before any engine action submission.

### 6. Engine rejects proofless JOIN and BID by default
expected: Send JOIN or BID through the live engine room path without a proof while `ENGINE_REQUIRE_PROOFS` is unset. The action should be rejected with a structured `PROOF_REQUIRED` response instead of silently accepting a null proof.
result: pass
evidence: `cd engine && npm run test -- test/join-proof.test.ts test/bid-proof.test.ts` passed (4/4), covering default-on room-level proof rejection and valid-proof acceptance.

### 7. Engine proof-path tests use real Groth16 proofs
expected: The targeted engine proof suites should pass using real Groth16 fixtures, covering both missing-proof rejection and valid-proof acceptance. The known unrelated `bond-watcher.test.ts` failure is acceptable if it is the only remaining red test in the full engine suite.
result: pass
evidence: Fresh `cd engine && npm run test -- test/actions.test.ts test/join-proof.test.ts test/bid-proof.test.ts` passed (37/37), and fresh `cd engine && npm run test` showed the only remaining red test is the unrelated `bond-watcher.test.ts` failure (209 passed, 1 failed).

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
