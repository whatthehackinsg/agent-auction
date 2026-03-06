# Phase 10: Autonomous MCP Tools - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Add the MCP tools needed for a fully autonomous per-auction lifecycle after Phase 09: `register_identity`, `deposit_bond`, `withdraw_funds`, and `claim_refund`. This phase covers how those tools should behave for real agent use, not new auction capabilities beyond the roadmap.

</domain>

<decisions>
## Implementation Decisions

### Registration flow
- `register_identity` should be a full bootstrap flow, not a bare ERC-8004 mint call.
- The tool should build a self-contained `agentURI` as a data URI rather than expecting a hosted metadata URL.
- The MCP server should support multiple agent identities instead of assuming one permanent active identity.
- On success, `register_identity` should return the registration transaction details and then run the equivalent of `check_identity` for the newly created `agentId`.

### Bonding flow
- `deposit_bond` should be the default end-to-end path: read the auction bond requirement, approve USDC if needed, transfer/deposit to escrow, and notify the engine.
- The required bond amount should be auto-derived from auction details by default rather than manually entered in normal use.
- The tool should use an explicit `agentId` input for multi-identity support.
- Bond submission should be idempotent: if a matching bond is already pending or confirmed, return the current state instead of transferring again.
- Success behavior should use smart waiting: return `CONFIRMED` when fast, otherwise return a clear `PENDING` result with the transaction hash and next-step guidance.
- The existing `post_bond` tool should remain available as an advanced/manual fallback, not the primary user path.
- Funding wallet selection should be configurable, with the owner wallet as the default.
- Error responses should be actionable and tell the agent how to recover.

### Exit flow
- `claim_refund` should do preflight eligibility checks before sending a transaction.
- `claim_refund` should support both settled-loser refunds and cancelled-auction refunds with explicit messaging.
- `claim_refund` should use an explicit `agentId` input for multi-identity support.
- `claim_refund` should be idempotent at the state level, returning the current outcome clearly instead of treating retries as a hard failure.
- `claim_refund` should use a strong handoff response: after success, tell the agent how much is now withdrawable and explicitly direct it to `withdraw_funds`.
- `withdraw_funds` should be balance-focused: preflight the withdrawable balance and designated destination wallet before sending.
- `withdraw_funds` should explain the preflight result in plain terms before execution.
- `withdraw_funds` success output should include the tx hash, amount withdrawn, destination wallet, `agentId`, and remaining balance state.

### Privacy boundary
- Write-side MCP tools may use explicit `agentId` values internally and in direct tool responses.
- Public and participant read-side outputs must continue to use masked identities or `zkNullifier` only.
- Phase 10 must preserve the current privacy model from Phase 08 rather than trying to hide all internal identity handling.

### Claude's Discretion
- Exact response JSON shape beyond the required fields above
- Polling cadence and timeout thresholds for smart wait behavior
- Whether approval and transfer are split into separate on-chain calls internally or wrapped behind one higher-level tool response
- Exact wallet override parameter naming for configurable funding

</decisions>

<specifics>
## Specific Ideas

- Registration should feel like one-shot onboarding, not a low-level contract helper.
- The advanced/manual path should still exist for operators, but normal agent guidance should point to the autonomous tool path first.
- Multi-identity support is expected in this phase rather than being deferred.
- Explicit `agentId` on write-side tools is acceptable and does not violate the current ZK privacy model.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/crypto/src/onboarding.ts`: already contains onboarding helpers such as `prepareOnboarding(...)` and `registerOnChain(...)` that can anchor `register_identity`.
- `agent-client/src/identity.ts`: already exercises the real ERC-8004 `register(string agentURI)` flow and provides a working reference for transaction construction.
- `mcp-server/src/tools/bond.ts`: already has `get_bond_status` and `post_bond`, including the engine `/auctions/:id/bonds` integration that `deposit_bond` should build on.
- `mcp-server/src/lib/identity-check.ts`: already provides fail-closed readiness checks and the `check_identity` response shape expected after registration.

### Established Patterns
- MCP tools return structured JSON text payloads and prefer actionable error messages.
- Phase 09 made readiness fail closed and proof/identity requirements mandatory before participation actions.
- Phase 08 established the privacy split: internal/write paths can know `agentId`, but participant/public outputs must stay masked.
- Current MCP config assumes a single configured identity in places like `AGENT_ID`, so multi-identity support will need deliberate tool-level targeting instead of hidden global assumptions.

### Integration Points
- `register_identity` should connect on-chain registration to the existing identity verification path so success immediately reflects in `check_identity`.
- `deposit_bond` should bridge auction detail lookup, USDC approval/deposit, and engine bond acknowledgment into one primary tool flow.
- `claim_refund` and `withdraw_funds` should integrate directly with `AuctionEscrow.claimRefund(...)` and `AuctionEscrow.withdraw(...)`.
- `mcp-server/src/prompts.ts` still describes the old manual bond flow, so Phase 10 likely needs prompt guidance updates alongside the new tools.

</code_context>

<deferred>
## Deferred Ideas

- Full privacy for bond/refund/withdrawal identity on-chain is out of scope for this phase; current MVP escrow flows remain `agentId`-addressed.
- Any broader treasury or fleet-management layer beyond configurable funding wallet selection belongs in a later phase.

</deferred>

---

*Phase: 10-autonomous-mcp-tools*
*Context gathered: 2026-03-06*
