---
status: complete
phase: 10-autonomous-mcp-tools
source:
  - 10-01-SUMMARY.md
  - 10-02-SUMMARY.md
  - 10-03-SUMMARY.md
  - 10-04-SUMMARY.md
started: 2026-03-06T11:37:51Z
updated: 2026-03-06T12:05:00Z
---

## Current Test

number: 7
name: MCP Guidance Matches the New Lifecycle
expected: |
  MCP prompts, README, and `.env.example` should now point to
  `register_identity -> check_identity -> deposit_bond -> join_auction -> place_bid -> claim_refund/withdraw_funds`
  as the primary lifecycle, with `post_bond` documented only as the advanced/manual fallback.
awaiting: none

## Tests

### 1. Register Identity Bootstrap
expected: Calling `register_identity` on a fresh signing wallet should complete the full bootstrap in one MCP call, returning `agentId`, `erc8004TxHash`, `privacyTxHash`, `stateFilePath`, and `readiness.readyToParticipate: true`, with the saved `agent-N.json` file present at the returned path.
result: fail
evidence: |
  Live MCP call against `http://127.0.0.1:3310/mcp` on 2026-03-06 minted real ERC-8004 identities and wrote real state files, but the user-facing tool response was not reliable.

  First live run exposed a parser bug: the Base Sepolia ERC-8004 registry emitted standard mint logs instead of the `Registered(agentId, owner, agentURI)` shape expected by `register_identity`, so the tool could not recover the minted agentId. This was fixed locally by falling back to the ERC-721 mint `Transfer(0x0, owner, tokenId)` log.

  After that fix, `register_identity` still returned `PRIVACY_BOOTSTRAP_FAILED` for agentId `1515` with a saved state file at `/tmp/agent-auction-phase10-uat/agent-1515.json`, but a follow-up live `check_identity(agentId="1515")` immediately returned:
  - `erc8004Verified: true`
  - `privacyRegistered: true`
  - `readyToParticipate: true`

  So the real bootstrap path reached a usable state on-chain, but the MCP tool still reported failure. That makes the shipped one-call onboarding contract incorrect for real users.

### 2. Explicit Agent Targeting Without Restart
expected: After registration, MCP write tools should be able to target the new identity explicitly via `agentId` (and `agentStateFile` where applicable) without restarting the MCP server or swapping global env, and the response should reference the chosen identity rather than the old default one.
result: pass
evidence: |
  The MCP server was started with `AGENT_PRIVATE_KEY` only and no global `AGENT_ID`.
  In the same server session, explicit per-call targeting worked with agentId `1515` across:
  - `check_identity(agentId="1515")`
  - `deposit_bond(auctionId, agentId="1515")`
  - `join_auction(..., agentId="1515", agentStateFile="/tmp/agent-auction-phase10-uat/agent-1515.json")`
  - `claim_refund(auctionId, agentId="1515")`
  - `withdraw_funds(agentId="1515")`

  No MCP restart or env swap was needed.

### 3. Autonomous Bond Deposit Flow
expected: `deposit_bond` should auto-read the auction `depositAmount`, submit the USDC escrow transfer, and return either `CONFIRMED` or `PENDING` with a `txHash` and actionable next step. Re-running it for the same auction/agent should return the current PENDING/CONFIRMED state idempotently instead of sending another transfer.
result: pass
evidence: |
  Live fresh-auction run on 2026-03-06 with `BASE_SEPOLIA_RPC=https://sepolia.base.org`:
  - auctionId: `0x32d75078fa69f409a3b02d25d0f6330bfb97cc668b3f8f9f1e2b28bc85cc7ba1`
  - depositAmount: `10000`
  - agentId: `1515`

  `deposit_bond` auto-read the auction deposit, transferred USDC to escrow, and returned:
  - `bondStatus: "CONFIRMED"`
  - `amount: "10000"`
  - `txHash: "0xafebbf4c13ed8cbc15f4a6e9b22a5828fffc73380f9e4d49e54c047e1a582485"`
  - `nextAction: "join_auction"`

  `get_bond_status` then returned `CONFIRMED`, and a repeat `deposit_bond` call returned an idempotent `CONFIRMED` response with `idempotent: true`.

  Note: the same flow was noisy on the repo's Alchemy free-tier RPC (`429` / delayed observation), but the MCP tool itself behaved correctly once run against a non-throttled Base Sepolia RPC.

### 4. Refund Claim Preflight and Handoff
expected: `claim_refund` should refuse clearly while the auction is still OPEN/CLOSED, and after a losing or cancelled outcome it should return either `CLAIMED` or `ALREADY_WITHDRAWABLE` with `withdrawableAmount`, `destinationWallet`, and `nextAction: withdraw_funds`.
result: skipped
evidence: |
  The OPEN-auction preflight branch was verified live and behaved correctly:
  - auctionId: `0x1384ba06a11665d8c6f4a0029d92eb25ff2e2da7be75ac168ebe88591fd3003c`
  - response: `REFUND_NOT_AVAILABLE`
  - detail: refunds are only claimable after `SETTLED` or `CANCELLED`

  The `CLAIMED` / `ALREADY_WITHDRAWABLE` branch was not exercised in this session because there was no settled/cancelled refundable auction available for a controlled identity that could also complete the live participation path.

### 5. Withdraw Funds Preflight and Summary
expected: `withdraw_funds` should return a no-op `NOTHING_TO_WITHDRAW` state when the balance is empty, and when funds exist it should return `txHash`, withdrawn `amount`, `destinationWallet`, `agentId`, and `remainingWithdrawable`.
result: pass
evidence: |
  Live call `withdraw_funds(agentId="1515")` returned:
  - `withdrawalStatus: "NOTHING_TO_WITHDRAW"`
  - `amount: "0"`
  - `destinationWallet: "0x0000000000000000000000000000000000000000"`
  - `remainingWithdrawable: "0"`

  This verified the empty-balance preflight branch end to end against Base Sepolia.

### 6. Read-Side Privacy Still Holds
expected: `get_auction_events` and/or `monitor_auction` should still show masked/nullifier-based identities on the read side, not raw `agentId` or wallet values, even though write tools now accept explicit `agentId` targeting.
result: skipped
evidence: |
  This could not be validated honestly in live participant mode because the JOIN path is currently blocked after bond confirmation:
  - `deposit_bond` confirmed successfully for agentId `1515`
  - `join_auction` then failed with `PROOF_INVALID`
  - engine detail: `Invalid membership proof for agent 1515`

  Without a successful live participant join, `get_auction_events` / `monitor_auction` could not be exercised on the intended participant-masked path for this new identity.

### 7. MCP Guidance Matches the New Lifecycle
expected: MCP prompts, README, and `.env.example` should now point to `register_identity -> check_identity -> deposit_bond -> join_auction -> place_bid -> claim_refund/withdraw_funds` as the primary lifecycle, with `post_bond` documented only as the advanced/manual fallback.
result: pass
evidence: |
  Verified in source:
  - `mcp-server/src/prompts.ts` lines 23-37, 105-130, and 200-220
  - `mcp-server/README.md` tool table and lifecycle section
  - `mcp-server/.env.example`

  The guidance consistently presents:
  - `register_identity` then `check_identity`
  - `deposit_bond` as the primary bond path
  - `post_bond` only as the advanced/manual fallback
  - `claim_refund` / `withdraw_funds` as the post-auction exit path

## Summary

total: 7
passed: 4
issues: 1
pending: 0
skipped: 2

## Gaps

- `register_identity` is not production-accurate in live use yet. After fixing ERC-8004 mint parsing locally, the tool still returned `PRIVACY_BOOTSTRAP_FAILED` even though `check_identity` immediately showed the minted agent as fully ready. The one-call onboarding response contract needs to be made consistent with actual chain state.
- `join_auction` is blocked for the live minted agent even after `check_identity` is green and `deposit_bond` is `CONFIRMED`. The engine rejected the generated proof with `Invalid membership proof for agent 1515`, so the real JOIN/BID/read-side-privacy path is not verified yet.
- Free-tier Alchemy RPC caused live UAT noise (`429` rate limits and delayed bond observation). Using `https://sepolia.base.org` produced clean `deposit_bond -> CONFIRMED` behavior. The repo's default local test setup should avoid rate-limited RPC endpoints for real UAT.
