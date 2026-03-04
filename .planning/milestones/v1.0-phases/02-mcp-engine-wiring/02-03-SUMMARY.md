---
phase: 02-mcp-engine-wiring
plan: 03
subsystem: api
tags: [zk-proofs, groth16, vitest, testing, snarkjs, signer, eip-712, poseidon, fixtures]

# Dependency graph
requires:
  - phase: 02-mcp-engine-wiring
    plan: 01
    provides: "signJoin() with proofPayload parameter, proof-generator.ts exports"
  - phase: 02-mcp-engine-wiring
    plan: 02
    provides: "join_auction/place_bid tool ZK proof wiring, structured error codes"
provides:
  - "vitest ^3.2.1 test infrastructure for mcp-server"
  - "membership-proof.json: real Groth16 RegistryMembership proof fixture (3 publicSignals)"
  - "bidrange-proof.json: real Groth16 BidRange proof fixture (4 publicSignals)"
  - "mcp-server/test/join.test.ts: 9 tests covering signJoin nullifier branching and join tool behavior"
  - "mcp-server/test/bid.test.ts: 5 tests covering place_bid proof pass-through and error codes"
  - "engine/test/actions.test.ts: 2 new positive-case tests for handleJoin/handleBid with requireProofs=true"
  - "engine/test/fixtures/: proof fixture copies for engine test independence"
affects:
  - 02-04-mcp-engine-wiring

# Tech tracking
tech-stack:
  added:
    - "vitest@^3.2.1 — fast ESM test runner for mcp-server (globals: true)"
  patterns:
    - "Capturing MCP server mock: registerTool intercepts handler callback for direct invocation without MCP transport"
    - "Capturing engine mock: post/get methods store payloads in array for assertion"
    - "Fixture-based ZK testing: pre-generated real Groth16 proofs committed as JSON, loaded via fs.readFileSync(new URL(...))"
    - "ENGINE_ALLOW_INSECURE_STUBS=true bypasses EIP-712 sig check in engine tests — only proof verification path tested"

key-files:
  created:
    - "mcp-server/vitest.config.ts"
    - "mcp-server/test/fixtures/membership-proof.json"
    - "mcp-server/test/fixtures/bidrange-proof.json"
    - "mcp-server/test/join.test.ts"
    - "mcp-server/test/bid.test.ts"
    - "engine/test/fixtures/membership-proof.json"
    - "engine/test/fixtures/bidrange-proof.json"
  modified:
    - "mcp-server/package.json"
    - "mcp-server/package-lock.json"
    - "engine/test/actions.test.ts"

key-decisions:
  - "Fixtures generated once via one-off .mjs script using same test values as packages/crypto/tests/circuits.test.ts, then committed as JSON — avoids slow snarkjs fullProve at test time"
  - "Capturing mock MCP server intercepts registerTool() to expose handler callback directly — no need for MCP transport or server startup"
  - "engine/test/fixtures/ created as independent copy of mcp-server fixtures — engine tests are self-contained, no cross-module path dependency"
  - "Bond-watcher pre-existing failure documented as out-of-scope (pre-dates this plan, unrelated to ZK proof changes)"

patterns-established:
  - "Two-fixture test pattern: membership-proof.json (3 signals) for JOIN tests, bidrange-proof.json (4 signals) for BID tests"
  - "Tool handler test via mock MCP server: makeCapturingMcpServer() + makeCapturingEngine() pattern enables direct handler invocation"
  - "Structured error assertion pattern: parse JSON from content[0].text, assert body.error.code"

requirements-completed: [MCPE-04]

# Metrics
duration: ~8min
completed: 2026-03-02
---

# Phase 2 Plan 3: MCP Server Test Infrastructure and Proof Fixtures Summary

**MCP server vitest infrastructure set up with pre-generated Groth16 proof fixtures and 14 integration tests validating ZK proof pass-through pipeline — signJoin() Poseidon/keccak256 nullifier branching, proof payload reaching engine POST body, and structured error codes; plus 2 new engine tests confirming valid proofs accepted with ENGINE_REQUIRE_PROOFS=true**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-02T15:41:32Z
- **Completed:** 2026-03-02T15:49:40Z
- **Tasks:** 3
- **Files modified:** 3 (+ 7 created)

## Accomplishments

- Configured vitest in mcp-server with `globals: true`, added `"test": "vitest run"` script
- Generated real Groth16 proof fixtures using same inputs as `packages/crypto/tests/circuits.test.ts`:
  - `membership-proof.json`: RegistryMembership proof with 3 publicSignals (registryRoot, capabilityCommitment, nullifier)
  - `bidrange-proof.json`: BidRange proof with 4 publicSignals (rangeOk, bidCommitment, reservePrice, maxBudget)
- Wrote 9 join tests: signJoin Poseidon nullifier (with proof), keccak256 fallback (without proof), proof pass-through unchanged, publicSignals count, engine POST body with/without proof, AGENT_NOT_REGISTERED / NULLIFIER_REUSED / PROOF_INVALID structured errors
- Wrote 5 bid tests: bid range proof in engine POST body, proof: null without proof, attach-after-sign pattern validation, PROOF_INVALID and AGENT_NOT_REGISTERED error codes
- Extended engine actions.test.ts with 2 positive-case tests: handleJoin accepts valid membership proof with `requireProofs: true` (zkNullifier populated), handleBid accepts valid bid range proof with `requireProofs: true` (action.proof defined)
- Copied proof fixtures to `engine/test/fixtures/` for engine test independence

## Task Commits

1. **Task 1: Set up vitest and generate proof fixtures** - `6b655db` (feat)
2. **Task 2: Write signer and tool integration tests** - `417e1bf` (test)
3. **Task 3: Extend engine tests — valid proof accepted** - `0f148b1` (test)

## Files Created/Modified

- `mcp-server/vitest.config.ts` - Vitest configuration with globals: true
- `mcp-server/package.json` - Added vitest devDependency and test script
- `mcp-server/test/fixtures/membership-proof.json` - Real RegistryMembership Groth16 proof (3 publicSignals)
- `mcp-server/test/fixtures/bidrange-proof.json` - Real BidRange Groth16 proof (4 publicSignals)
- `mcp-server/test/join.test.ts` - 9 tests for signJoin nullifier derivation and join tool behavior
- `mcp-server/test/bid.test.ts` - 5 tests for place_bid proof pass-through and error codes
- `engine/test/fixtures/membership-proof.json` - Engine-local copy of membership proof fixture
- `engine/test/fixtures/bidrange-proof.json` - Engine-local copy of bid range proof fixture
- `engine/test/actions.test.ts` - Added import fs, 2 new positive requireProofs tests

## Decisions Made

- Generated fixtures via one-off `.mjs` script using `packages/crypto/dist/index.js` directly (crypto built), then deleted script — fixtures committed as static JSON for fast test execution
- Test helper pattern: `makeCapturingMcpServer()` intercepts `registerTool()` to get handler callback; `makeCapturingEngine()` captures POST body payloads — clean mock without MCP transport overhead
- Fixtures copied to `engine/test/fixtures/` independently so engine tests don't cross-reference mcp-server paths
- Pre-existing `bond-watcher.test.ts` failure (1 test) is unrelated to this plan — logged as deferred

## Deviations from Plan

None - plan executed exactly as written. All 14 mcp-server tests and 27 engine actions tests pass.

## Issues Encountered

Pre-existing `engine/test/bond-watcher.test.ts` failure (1 test: "detects transfer log and calls recordBond, then marks CONFIRMED") — confirmed pre-dates this plan by git log, unrelated to ZK proof test work. Logged to deferred-items.

## Slow Test Tier (Deferred as Planned)

Per plan's `<deferred_scope>`: the slow real-generation test tier (`generateProof: true` end-to-end with .wasm/.zkey) is intentionally deferred to post-hackathon CI hardening. The fast fixture tier validates the same proof pipeline correctness; fixtures ARE real Groth16 proofs from the circuits.

---
*Phase: 02-mcp-engine-wiring*
*Completed: 2026-03-02*

## Self-Check: PASSED

- FOUND: mcp-server/vitest.config.ts
- FOUND: mcp-server/test/fixtures/membership-proof.json
- FOUND: mcp-server/test/fixtures/bidrange-proof.json
- FOUND: mcp-server/test/join.test.ts
- FOUND: mcp-server/test/bid.test.ts
- FOUND: engine/test/fixtures/membership-proof.json
- FOUND: engine/test/fixtures/bidrange-proof.json
- FOUND: .planning/phases/02-mcp-engine-wiring/02-03-SUMMARY.md
- FOUND commit: 6b655db
- FOUND commit: 417e1bf
- FOUND commit: 0f148b1
