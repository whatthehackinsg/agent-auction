---
status: complete
phase: 13-redeploy-agentprivacyregistry-and-repoint-base-sepolia-config
source:
  - 13-01-SUMMARY.md
  - 13-02-SUMMARY.md
  - 13-03-SUMMARY.md
started: 2026-03-07T00:05:00+08:00
updated: 2026-03-07T01:29:10+08:00
---

## Current Test

[passed with fresh local and deployed sign-off evidence]

## Closure Gate

- Final closure still requires two independent fresh-agent tracks:
  - local Worker runtime
  - deployed `workers.dev` runtime
- Mandatory lifecycle per track:
  - `register_identity`
  - `check_identity`
  - `deposit_bond`
  - `join_auction`
- BID evidence remains secondary and must be recorded as one of:
  - `proven`
  - `smoke-tested`
  - `deferred`
- If either runtime fails the mandatory JOIN path, Phase 13 stays blocked.

## Sign-Off Runbook

### Local Worker Runtime Track

Required setup:

- local engine running on the Cloudflare Worker runtime path, not plain Node-only imports
- local MCP server pointed at that local engine
- fresh wallet or clean state directory for the run
- fresh OPEN auction dedicated to this runtime track

Required evidence:

- local worker URL/version
- fresh `agentId`
- `stateFilePath`
- `auctionId`
- ERC-8004 tx hash
- bond tx hash or truthful pending state
- JOIN `seq` and `eventHash`
- raw MCP JSON for any failure
- BID status (`proven`, `smoke-tested`, or `deferred`)

### Deployed Worker Runtime Track

Required setup:

- current deployed engine URL (`workers.dev`)
- current worker deployment/version identifier
- second fresh wallet or clean state directory
- second fresh OPEN auction dedicated to this runtime track

Required evidence:

- deployed worker URL/version
- fresh `agentId`
- `stateFilePath`
- `auctionId`
- ERC-8004 tx hash
- bond tx hash or truthful pending state
- JOIN `seq` and `eventHash`
- raw MCP JSON for any failure
- BID status (`proven`, `smoke-tested`, or `deferred`)

## Tests

### 1. Local workerd harness reproduces the membership-proof runtime blocker on the shared verifier path
expected: |
  The same shared `verifyMembershipProof()` path used by the engine should succeed locally under
  workerd/Miniflare with the new Worker-safe verifier backend.
result: pass
evidence: |
  Verified with:
  - `cd engine && npm run test -- test/proof-runtime-worker.test.ts`

  The local Worker harness now calls the real shared export and returns:
  - `valid: true`
  - `reason: "valid"`

### 2. Local workerd harness reproduces the bid-range runtime blocker on the same shared path
expected: |
  `verifyBidRangeProof()` should also succeed inside workerd so JOIN and BID stay aligned on the
  shared verifier runtime truth.
result: pass
evidence: |
  Verified with:
  - `cd engine && npm run test -- test/proof-runtime-worker.test.ts`

  The bid-range harness now returns the same success family:
  - `valid: true`
  - `reason: "valid"`

### 3. Engine maps shared verifier outages to explicit fail-closed structured errors
expected: |
  JOIN and BID should return `PROOF_RUNTIME_UNAVAILABLE` with raw runtime detail preserved in
  diagnostics instead of flattening the failure to generic `PROOF_INVALID`.
result: pass
evidence: |
  Verified with:
  - `cd engine && npm run typecheck`
  - `cd engine && npm run test -- test/actions.test.ts test/join-proof.test.ts test/bid-proof.test.ts`

  Engine regression coverage now protects:
  - JOIN -> `PROOF_RUNTIME_UNAVAILABLE`
  - BID -> `PROOF_RUNTIME_UNAVAILABLE`
  - ordinary malformed/invalid proofs remaining separate

### 4. MCP JOIN and BID preserve the shared runtime-outage contract
expected: |
  MCP should surface the same `PROOF_RUNTIME_UNAVAILABLE` code family from engine responses while
  preserving JOIN's readiness-boundary explanation.
result: pass
evidence: |
  Verified with:
  - `cd mcp-server && npm run typecheck`
  - `cd mcp-server && npx vitest run test/join.test.ts test/bid.test.ts`

  Both tools now preserve:
  - `code: "PROOF_RUNTIME_UNAVAILABLE"`
  - `reason: "proof_runtime_unavailable"`
  - raw runtime detail in `detail` / `diagnostics`

### 5. Local fresh-agent sign-off track completes `register_identity -> check_identity -> deposit_bond -> join_auction`
expected: |
  A fresh local Worker-runtime end-to-end run should complete the mandatory MCP lifecycle using the
  normal auto-proof path.
result: pass
evidence: |
  Verified on 2026-03-07 against `http://127.0.0.1:9988` via a real `wrangler dev` runtime.

  Fresh local evidence:
  - worker URL: `http://127.0.0.1:9988`
  - fresh agent: `1543`
  - state file: `/tmp/phase13-local-1772818148/agent-1543.json`
  - fresh auction: `0x7cf47763a64f9fefc060c8e0c2b8c2dc11e5edfde3e430799a4af52a42085eec`
  - on-chain auction tx: `0xddd658be1c731c78cdafdb584464d4bf7a0d8fb73d6048df48176e1d049689fa`
  - ERC-8004 tx: `0xa11fa57115a8e0b8cb6dab781bc98a2e705eaf8a9a04ca08d7ae90478005e7bf`
  - privacy tx: `0x73fa2c88b2ce08a34999efc655b6aa32a2b9aeeb558feced56fcca895bb39dfa`
  - bond tx: `0x5910eb535f12b587694eea34d32b86c9545771772b96517c79c90c188844ef25`
  - JOIN seq/eventHash: `1` / `0x13ff937f0c9cca152da451a8818f665a853634ce4f914a30b0dce61341c9d226`

  Notes:
  - `register_identity` initially returned `ONBOARDING_INCOMPLETE`, then recovered via `check_identity` polling once privacy state became visible.
  - `check_identity`, `deposit_bond`, and `join_auction` all completed successfully afterward.
  - BID status for the local track: `deferred` (shared verifier path already proven by local workerd/Node automated coverage).

### 6. Deployed fresh-agent sign-off track completes the same lifecycle on `workers.dev`
expected: |
  A second fresh agent and fresh auction should pass the same mandatory lifecycle on the currently
  deployed Worker runtime.
result: pass
evidence: |
  Verified on 2026-03-07 against deployed Worker version `ef5c79eb-a899-4ae5-b1bc-94afb9f6f548`.

  Fresh deployed evidence:
  - worker URL: `https://auction-engine.zengyuzhi2002-efc.workers.dev`
  - fresh agent: `1542`
  - state file: `/tmp/phase13-live-1772818024/agent-1542.json`
  - fresh auction: `0x837c9831792abef4bb9485ddb760984c3bd745aade8e359f0f0a3481e21731ab`
  - on-chain auction tx: `0x390710dab9abe83ea0a02902c2de5831d12e05894e0b6f9f96d19b0bb86fb94a`
  - ERC-8004 tx: `0xa006ce8fd03f14245643450d7d355a5883b0d5f82985dfb93fa9198ebe21fc13`
  - privacy tx: `0xf2eaa7e8be57ad9a6964d34d338698077efc80e47674ac1d0473ed41d316ef61`
  - bond tx: `0xce383022e6d867aafcab6057cbde45aeef4851fc60f826396e751619247bd391`
  - JOIN seq/eventHash: `1` / `0x093726e6151dfea2457596c80b50d6f5cd28939b351b66e7a15d470b542fe3ff`

  Additional deployment fix required during sign-off:
  - Remote D1 schema was missing `events.zk_nullifier`, so JOIN initially failed with `D1_ERROR`.
  - Remote D1 was reconciled and `d1_migrations` was populated through `0004_add_zk_nullifier_to_events.sql`.

  BID status for the deployed track: `deferred` (JOIN is the closure gate; bid-range verifier remains covered by the shared automated suites).

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0

## Gaps

- truth: "Both the local Worker runtime and the deployed Worker runtime complete the mandatory JOIN sign-off path with fresh evidence."
  status: passed
  reason: "Fresh local and deployed sign-off both completed successfully after the Worker-safe verifier backend swap and D1 schema reconciliation."
  severity: none
  tests:
    - 5
    - 6
  root_cause: "Closed."
  artifacts:
    - path: "engine/src/lib/snarkjs-runtime.ts"
      issue: "Now contains the Worker-safe `verifyGroth16()` backend plus runtime-aware wasm loading."
    - path: "engine/test/proof-runtime-worker.test.ts"
      issue: "Permanent workerd harness now proves the shared verifier succeeds locally."
    - path: ".planning/phases/13-redeploy-agentprivacyregistry-and-repoint-base-sepolia-config/13-01-SUMMARY.md"
      issue: "Documents the backend swap and the Cloudflare constraint that motivated it."
    - path: ".planning/phases/13-redeploy-agentprivacyregistry-and-repoint-base-sepolia-config/13-03-SUMMARY.md"
      issue: "Records the final local/deployed closure evidence and D1 reconciliation."
  missing:
    - "None for Phase 13 closure."
