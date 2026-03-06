---
phase: 13-redeploy-agentprivacyregistry-and-repoint-base-sepolia-config
plan: 01
subsystem: engine
tags: [cloudflare-workers, workerd, snarkjs, ffjavascript, wasm]
requires:
  - phase: 12-debug-live-phase-10-registration-and-proof-failures
    plan: 03
    provides: truthful live blocker showing deployed JOIN fails inside Worker proof verification
provides:
  - shared workerd regression harness for membership and bid-range verification
  - Worker-safe Groth16 verifier path backed by imported/precompiled `bn128.wasm`
  - verified local workerd success for membership and bid-range proof verification
affects: [join_auction, place_bid, engine-proof-verifier, cloudflare-workers]
tech-stack:
  added: []
  patterns:
    - Reproduce the deployed runtime failure locally before trusting a fix
    - Keep the Node and Worker verifier backends aligned behind one shared engine entrypoint
key-files:
  created:
    - .planning/phases/13-redeploy-agentprivacyregistry-and-repoint-base-sepolia-config/13-01-SUMMARY.md
  modified:
    - engine/src/lib/snarkjs-runtime.ts
    - engine/src/lib/crypto.ts
    - engine/src/test-helpers/proof-fixtures.ts
    - engine/test/proof-runtime-worker.test.ts
key-decisions:
  - "The shared verifier path now has a permanent workerd/Miniflare regression harness before any future runtime fix is attempted."
  - "The engine verifier now calls the Worker-safe `verifyGroth16()` implementation directly instead of routing through a mixed Node/Worker `snarkjs` loader."
patterns-established:
  - "Worker-runtime proof fixes must keep one lazy verifier entrypoint in `crypto.ts` while letting the runtime wrapper own the Node-vs-Worker wasm loading differences."
requirements-completed:
  - ZKRQ-01
  - ZKRQ-02
duration: 2h
completed: 2026-03-07
---

# Phase 13 Plan 01: Worker-Safe Verifier Summary

**The shared engine verifier now succeeds under workerd by using the Worker-safe `verifyGroth16()` backend with imported/precompiled `bn128.wasm`**

## Performance

- **Duration:** ~2h
- **Completed:** 2026-03-07T00:29:58+08:00
- **Tasks:** 2
- **Files modified:** 3 repo files

## Accomplishments

- Added `engine/test/proof-runtime-worker.test.ts`, a bundled Miniflare/workerd harness that executes the real shared engine exports:
  - `verifyMembershipProof()`
  - `verifyBidRangeProof()`
- Reworked `engine/src/lib/snarkjs-runtime.ts` into the real backend instead of a compatibility shim:
  - exports a named `verifyGroth16()` implementation
  - loads compiled `.wasm` modules under workerd/Wrangler
  - falls back to reading raw wasm bytes from disk in Node/Vitest
  - normalizes the two `WebAssembly.instantiate()` return shapes so `SingleThreadManager` receives a real instance in both runtimes
- Updated `engine/src/lib/crypto.ts` to use one shared lazy verifier entrypoint:
  - removed the direct `import('snarkjs')` branch from the engine verifier path
  - kept all higher-level business checks unchanged
- Strengthened `engine/src/test-helpers/proof-fixtures.ts` so generated proof fixture failures preserve the verification detail that failed.
- Proved the same shared runtime path now works for both JOIN and BID verification under workerd:
  - membership proof harness result: `valid`
  - bid-range proof harness result: `valid`

## External Verification

Cloudflare's official Workers docs still explain why this backend change was necessary:

- Workers web standards reference: `WebAssembly.compile`, `WebAssembly.compileStreaming`, and `WebAssembly.instantiate()` with a buffer source are unavailable in Workers.
- Workers WebAssembly reference: Workers supports imported/precompiled `.wasm` modules.

References:

- https://developers.cloudflare.com/workers/runtime-apis/web-standards/
- https://developers.cloudflare.com/workers/runtime-apis/webassembly/
- https://developers.cloudflare.com/workers/wrangler/bundling/

## Task Commits

No commits were created during this execution pass.

## Files Created/Modified

- `engine/src/lib/snarkjs-runtime.ts` - became the shared Worker-safe Groth16 verifier backend with runtime-aware wasm loading
- `engine/src/lib/crypto.ts` - now lazily imports named `verifyGroth16()` and preserves the existing proof result semantics
- `engine/src/test-helpers/proof-fixtures.ts` - improved fixture failure detail for verifier debugging
- `engine/test/proof-runtime-worker.test.ts` - proves the shared membership and bid-range verifiers now pass inside workerd
- `.planning/phases/13-redeploy-agentprivacyregistry-and-repoint-base-sepolia-config/13-01-SUMMARY.md` - recorded the runtime investigation outcome

## Decisions Made

- Kept the proof verifier fail-closed instead of masking runtime crashes as normal proof invalidity.
- Treated the Cloudflare documentation as a design constraint for the replacement backend: use imported/precompiled `.wasm`, not runtime compilation.
- Did not change circuits, verification keys, signal ordering, or higher-level engine proof checks; only the Worker-side verifier implementation changed.

## Deviations from Plan

- The original plan started as a runtime investigation, but it grew into the real backend swap once the workerd harness showed a clear, reproducible failure mode.
- That was a productive deviation: the plan now closes with a green local Worker-safe verifier instead of stopping at diagnosis.

## Issues Encountered

- A top-level static wasm import worked for Wrangler/workerd but broke plain Node/Vitest with `Cannot find package 'env'` during raw module execution.
- A temporary crypto-side Node fallback fixed Node but broke the Worker bundle because even an unreachable opaque dynamic `snarkjs` import polluted Miniflare's static module graph.
- Node and Worker also differ on the return shape of `WebAssembly.instantiate()`, so the runtime had to normalize `WebAssembly.Instance` versus `{ instance, module }`.

## User Setup Required

- No user-side setup is required for this specific blocker.
- The next user-facing step is live verification, not more local runtime surgery.

## Next Phase Readiness

- Plan 13-02 remains valid because the structured runtime-outage contract still protects future failures.
- Phase 13 is no longer blocked by the local workerd harness; the remaining gap is fresh-agent sign-off against the deployed Worker runtime.

## Self-Check: PASSED

- `cd engine && npm run typecheck`
- `cd engine && npm run test -- test/proof-runtime-worker.test.ts test/proof-fixtures.test.ts test/crypto.test.ts test/join-proof.test.ts test/bid-proof.test.ts test/actions.test.ts`
