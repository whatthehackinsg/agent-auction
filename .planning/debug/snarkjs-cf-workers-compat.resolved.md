---
status: resolved
trigger: "Engine deploy to Cloudflare Workers fails because snarkjs/ffjavascript calls URL.createObjectURL() which isn't available in the Workers runtime. A previous fix existed (commit ac9e050) but it's broken again."
created: 2026-03-04T00:00:00Z
updated: 2026-03-04T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED - engine barrel import of @agent-auction/crypto pulls in snarkjs-verify.ts which does top-level `import * as snarkjs from "snarkjs"`, which triggers URL.createObjectURL() at bundle time.
test: Fix by adding ./signal-indices sub-path export and updating engine import
expecting: Deploy succeeds without URL.createObjectURL() error
next_action: Apply fix to packages/crypto/package.json and engine/src/lib/crypto.ts

## Symptoms

expected: npm run deploy in engine/ deploys successfully to Cloudflare Workers
actual: Deploy fails with validation error 10021
errors: |
  Uncaught Error: URL.createObjectURL() is not implemented
    at null.<anonymous> (file:///...packages/crypto/node_modules/snarkjs/node_modules/ffjavascript/build/browser.esm.js:15687:28)
reproduction: cd engine && npm run deploy
started: Broke after phase 02 crypto/engine changes; previously worked after commit ac9e050

## Eliminated

- hypothesis: wrangler.toml config was changed to stop marking snarkjs as external
  evidence: wrangler.toml has no external modules config — never relied on that approach
  timestamp: 2026-03-04T00:01:00Z

- hypothesis: engine/src/lib/crypto.ts changed its import from sub-path back to barrel
  evidence: crypto.ts still correctly uses @agent-auction/crypto/poseidon-chain and @agent-auction/crypto/replay-bundle for those symbols; BUT it uses the barrel for MEMBERSHIP_SIGNALS and BID_RANGE_SIGNALS (line 23: `import { MEMBERSHIP_SIGNALS, BID_RANGE_SIGNALS } from '@agent-auction/crypto'`)
  timestamp: 2026-03-04T00:01:00Z

## Evidence

- timestamp: 2026-03-04T00:00:30Z
  checked: engine/src/lib/crypto.ts line 23
  found: `import { MEMBERSHIP_SIGNALS, BID_RANGE_SIGNALS } from '@agent-auction/crypto'` — barrel import
  implication: This import was ADDED by commit 388dcd4 (feat(01-01): create signal-indices.ts) AFTER ac9e050. It re-introduced the barrel import.

- timestamp: 2026-03-04T00:00:31Z
  checked: packages/crypto/src/index.ts (barrel)
  found: barrel exports from snarkjs-verify.js which has top-level `import * as snarkjs from "snarkjs"`
  implication: Any import from barrel triggers snarkjs at module init time → URL.createObjectURL() crash

- timestamp: 2026-03-04T00:00:32Z
  checked: packages/crypto/src/snarkjs-verify.ts line 7
  found: `import * as snarkjs from "snarkjs"` — unconditional top-level import
  implication: This is what triggers browser.esm.js which calls URL.createObjectURL()

- timestamp: 2026-03-04T00:00:33Z
  checked: packages/crypto/src/signal-indices.ts
  found: Pure constants file — MEMBERSHIP_SIGNALS and BID_RANGE_SIGNALS are just const objects with no imports at all
  implication: Safe to import directly. Just needs a sub-path export added to package.json.

- timestamp: 2026-03-04T00:00:34Z
  checked: git log ac9e050..HEAD -- engine/ packages/crypto/
  found: commit 388dcd4 (feat(01-01): create signal-indices.ts) added `export * from './signal-indices.js'` to barrel AND engine/src/lib/crypto.ts started importing MEMBERSHIP_SIGNALS/BID_RANGE_SIGNALS from the barrel
  implication: This is the regression. The fix had kept all engine imports off the barrel; commit 388dcd4 added a new barrel import for the signal constants.

## Resolution

root_cause: Commit 388dcd4 added `import { MEMBERSHIP_SIGNALS, BID_RANGE_SIGNALS } from '@agent-auction/crypto'` to engine/src/lib/crypto.ts. The @agent-auction/crypto barrel re-exports snarkjs-verify.ts which has a top-level `import * as snarkjs from "snarkjs"`. esbuild (wrangler) includes this at bundle time, pulling in ffjavascript browser.esm.js which calls URL.createObjectURL() — an API that doesn't exist in Cloudflare Workers.
fix: Add `./signal-indices` sub-path export to packages/crypto/package.json; change engine import to use that sub-path instead of the barrel.
verification:
files_changed:
  - packages/crypto/package.json
  - engine/src/lib/crypto.ts
