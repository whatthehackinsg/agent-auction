---
status: complete
phase: 15-integrate-agentkit-wallet-adapter-without-breaking-zk-or-erc-8004
source:
  - 15-01-SUMMARY.md
  - 15-02-SUMMARY.md
  - 15-03-SUMMARY.md
  - 15-04-SUMMARY.md
started: 2026-03-08T03:44:38+08:00
updated: 2026-03-08T03:44:38+08:00
---

## Current Test

[passed with one non-blocking follow-up]

## Tests

### 1. Supported backend contract is live and regression-covered
expected: The MCP server should expose one tool surface with the supported AgentKit/CDP backend as the primary write path, and the focused regression suite should still pass after the adapter rollout.
result: pass
evidence: |
  Verified with:
  - `cd mcp-server && npm run typecheck`
  - `cd mcp-server && npm test`

  Result:
  - `typecheck` passed
  - full MCP suite passed `98/98`

### 2. register_identity works through the supported AgentKit/CDP backend on Base Sepolia
expected: A fresh supported-path run should mint an ERC-8004 identity, register privacy state, write a compatible local state file, and leave the identity ready for active participation.
result: pass
evidence: |
  Live supported-path evidence:
  - backend: `supported-agentkit-cdp`
  - wallet: `0x6a275Db9e617526C9E787574e1c3ec7A8175629A`
  - fresh agent: `1605`
  - state file: `mcp-server/agent-1605.json`
  - ERC-8004 tx: `0x0bfbdb95418452400ed5c7e5c2f79e30d05a0175d2f57a2b6fea2b9745255479`
  - privacy tx: `0x0aae228ae0dbff14bf459cbed2ff88d490ef3d96d5efd112d4839ddccb899b5c`

### 3. check_identity preserves ERC-8004 ownership and readiness on the supported path
expected: The supported backend should keep the one-owner-wallet rule intact and report truthful readiness through `check_identity`.
result: pass
evidence: |
  Live MCP call `check_identity(agentId="1605")` returned `readyToParticipate: true` for the same CDP wallet that minted the ERC-8004 identity and wrote the compatible local ZK state.

### 4. Read-side auction discovery remains usable with the supported backend configured
expected: `discover_auctions` and `get_auction_details` should still work with the supported backend configured, and they should not require a write-path fallback.
result: pass
evidence: |
  Both `discover_auctions` and `get_auction_details` succeeded in the same supported-path MCP session before bond/join/bid execution on auction `0xbc2355d74a6a4ffc2d91e7b641014670d878d1e2d5b1a2dbae9343da671d091d`.

### 5. deposit_bond succeeds through the supported backend without breaking owner-wallet rules
expected: The supported path should be able to transfer the auction bond and reach a confirmed bond state for the active ERC-8004 owner wallet.
result: pass
evidence: |
  Live supported-path bond evidence:
  - auction: `0xbc2355d74a6a4ffc2d91e7b641014670d878d1e2d5b1a2dbae9343da671d091d`
  - agent: `1605`
  - bond tx: `0x3ec0b978a6853f1e648c8479c4f2442834d88a170122ad663d77aecf36bb482d`
  - tool result: confirmed bond, next action `join_auction`

### 6. join_auction succeeds through the supported backend with mandatory ZK proofs intact
expected: The supported backend should sign and submit JOIN without changing the current proof/nullifier contract or ERC-8004 owner expectations.
result: pass
evidence: |
  Live supported-path JOIN evidence:
  - auction: `0xbc2355d74a6a4ffc2d91e7b641014670d878d1e2d5b1a2dbae9343da671d091d`
  - agent: `1605`
  - JOIN seq/eventHash: `1` / `0x04d757cf9d39e8a809fb420c42ab5a256206543a88ab759cd3ba62a822c402ee`

  This run used the normal MCP proof flow and did not require any no-proof downgrade.

### 7. place_bid succeeds through the supported backend with the existing EIP-712 and proof contract
expected: The supported backend should sign and submit BID through the existing MCP tool surface without changing bid proof semantics.
result: pass
evidence: |
  Live supported-path BID evidence:
  - auction: `0xbc2355d74a6a4ffc2d91e7b641014670d878d1e2d5b1a2dbae9343da671d091d`
  - agent: `1605`
  - amount: `3000000`
  - BID seq/eventHash: `2` / `0x15bd6cbcad0ccabfd4c47353c858e9ca3270ea162d96609c42452280a25b9391`

### 8. Explicit attach and exit flows remain covered even though they were not re-run live in this sign-off
expected: The supported-path closeout may accept explicit attach and exit tools as regression-covered if the single-room live sign-off already proves the main active-participation lifecycle.
result: pass
evidence: |
  Regression evidence stayed green in the full MCP suite (`98/98`), including:
  - `test/register-identity.test.ts` for explicit attach behavior
  - `test/exits.test.ts` for `claim_refund` and `withdraw_funds`

  Those flows were accepted as regression-covered rather than re-exercised live in the same sign-off loop.

### 9. Same agent can participate in multiple auction rooms platform-wide, but MCP JOIN nonce tracking is still too broad
expected: The same `agentId` should be able to participate in multiple auctions without the platform, contracts, or CRE rejecting the second room. If MCP blocks it, the issue should be recorded as a follow-up bug rather than hidden.
result: issue
reported: "Platform-level multi-room participation works, but the standard MCP runtime still tracks JOIN nonce as `JOIN:<agentId>` instead of scoping it per room."
severity: medium
evidence: |
  Live evidence:
  - first room JOIN/BID already succeeded for agent `1605` on `0xbc2355d74a6a4ffc2d91e7b641014670d878d1e2d5b1a2dbae9343da671d091d`
  - second room bond then JOIN on the same MCP runtime failed with:
    `Invalid nonce: expected 0 for first JOIN action from agent 1605, got 1`
  - a fresh MCP process joined the second room successfully:
    - second auction: `0xac50451be51e092832759d02f4f3d929c81c7a910fda1843a2445211f343af6c`
    - bond tx: `0x1e5d944f27ac480f084c24216fc326d462aad826057e111e04462f4235e50d55`
    - JOIN seq/eventHash: `1` / `0x16415d07eb5edf8cfb48be693677953a59ff118ae6302a7b6c70f479332289f3`

  Conclusion:
  - engine/platform/contracts/CRE allow the same `agentId` across rooms
  - the residual bug is MCP-side nonce scoping only

## Summary

total: 9
passed: 8
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "The same MCP runtime can reuse one `agentId` across multiple auction rooms without manual reset"
  status: partial
  reason: "The platform supports multi-room participation, but MCP still tracks JOIN nonce too broadly as `JOIN:<agentId>` instead of per room."
  severity: medium
  test: 9
  root_cause: "Client-side nonce tracking in `mcp-server/src/tools/join.ts` is not room-scoped."
  artifacts:
    - path: "mcp-server/src/tools/join.ts"
      issue: "JOIN nonce tracking is keyed by agent only, not by agent + auction."
    - path: ".planning/phases/15-integrate-agentkit-wallet-adapter-without-breaking-zk-or-erc-8004/15-04-SUMMARY.md"
      issue: "Records the supported-path closure gate and the residual multi-room follow-up."
  missing:
    - "Scope MCP JOIN nonce tracking per auction room and rerun the same-agent multi-room live test on the main runtime."
