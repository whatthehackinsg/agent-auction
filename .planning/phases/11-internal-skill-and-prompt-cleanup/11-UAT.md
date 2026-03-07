---
status: complete
phase: 11-internal-skill-and-prompt-cleanup
source: [11-01-SUMMARY.md, 11-02-SUMMARY.md]
started: 2026-03-07T00:30:00Z
updated: 2026-03-07T00:38:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Legacy internal auction skill tree is gone
expected: The stale `.claude/skills/auction/*` files are absent and the old repo-internal auction skill path no longer presents itself as active guidance.
result: pass
evidence: `test ! -e .claude/skills/auction/SKILL.md && test ! -e .claude/skills/auction/bond-management/SKILL.md && test ! -e .claude/skills/auction/sealed-bid/SKILL.md` passed, and the empty `.claude/skills/auction/` directory tree was removed.

### 2. check_identity now points to the current onboarding path
expected: The active `check_identity` helper should point agents to `register_identity` and the current MCP recovery path, not `selfRegister(uint256)` or the old hardcoded privacy-registry address.
result: pass
evidence: [identity.ts](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/mcp-server/src/tools/identity.ts) now emits `register_identity`-based recovery text, and `cd mcp-server && npx vitest run test/identity.test.ts` passed (3/3).

### 3. Active join/bid preflight errors no longer teach manual privacy bootstrap
expected: Active JOIN/BID preflight failures should route agents back through `register_identity` / `check_identity`, not tell them to run `prepareOnboarding()` or `registerOnChain()` manually.
result: pass
evidence: [identity-check.ts](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/mcp-server/src/lib/identity-check.ts) now uses MCP recovery text, and `cd mcp-server && npx vitest run test/join.test.ts test/bid.test.ts` passed (23/23) after the wording change.

### 4. Prompts and module-local guidance match the current fail-closed lifecycle
expected: Live MCP prompts and module instructions should describe `deposit_bond` as the primary bond path, `post_bond` as the manual fallback only, JOIN/BID as fail-closed `AGENT_STATE_FILE` / `proofPayload` flows, and exits via `claim_refund` / `withdraw_funds`.
result: pass
evidence: `rg -n "register_identity|deposit_bond|claim_refund|withdraw_funds|AGENT_STATE_FILE|proofPayload" mcp-server/src/prompts.ts mcp-server/AGENTS.md` returned the expected current terms, and the stale-term sweep over active internal surfaces returned clean.

### 5. mcp-server README is the canonical internal landing page
expected: The MCP README should explicitly act as the canonical internal landing page for the current lifecycle and explain that preserved `.planning/**` history may still mention removed legacy skill files.
result: pass
evidence: [README.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/mcp-server/README.md) now includes the canonical-landing-page note and the historical `.planning/**` explanation at the top of the file.

### 6. Internal deployment notes no longer teach the retired proof toggle
expected: The active sealed-bid verification note in `docs/zk-fix-deployment-steps.md` should describe the normal current path without a `generateProof` toggle and should allow an advanced `proofPayload` override instead.
result: pass
evidence: [zk-fix-deployment-steps.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/docs/zk-fix-deployment-steps.md) now describes `place_bid` with `sealed: true` on the normal path or an advanced `proofPayload` override, and the stale-term grep no longer finds `generateProof`.

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
