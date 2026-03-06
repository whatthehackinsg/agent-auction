# Phase 12: Debug Live Phase 10 Registration and Proof Failures - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the real Base Sepolia failures exposed during Phase 10 UAT: `register_identity` returning an incorrect failure contract after successful bootstrap, and `join_auction` failing live with invalid membership proof after a confirmed bond. This phase is about making the existing autonomous flow truthful and usable in live conditions, not adding new auction capabilities.

</domain>

<decisions>
## Implementation Decisions

### Onboarding truthfulness
- `register_identity` must reconcile final chain state, local state persistence, and engine-visible readiness before deciding its final result.
- Any post-mint mismatch should trigger reconciliation rather than trusting an intermediate step.
- If the reconciled end state shows the new agent is actually ready to participate, the tool should return success with a warning rather than a hard failure.
- If the reconciled end state is incomplete, the tool should return actionable recovery data, including the transaction hash, `agentId` when known, local state file path, and the exact next step to try.

### Join proof UX
- `join_auction` should keep the current automatic proof path, but the normal user experience should be guided diagnostics rather than a vague "try again" failure.
- If a "ready" agent still cannot produce or submit a valid join proof, the tool should return a structured diagnostic error with likely mismatch causes and exact next actions.
- While this issue is being debugged, the join path should remain fail-closed; do not relax ZK enforcement to get requests through.
- Manual/operator-only proof override is not the primary product contract for this phase.

### Live completion bar
- The proof issue is considered fixed when a real Base Sepolia `deposit_bond -> join_auction` flow succeeds for a newly onboarded agent.
- A live `place_bid` success is useful follow-up evidence, but it is not required to close this specific debug phase.
- Participant-masked read-side verification stays outside the minimum done bar for this phase.

### Claude's Discretion
- Exact warning and diagnostic field names in MCP responses
- How much low-level proof/debug metadata to expose by default versus behind advanced detail fields
- Whether to add targeted temporary logging around proof generation and engine verification as long as it does not weaken privacy guarantees

</decisions>

<specifics>
## Specific Ideas

- Phase 10 live UAT showed `register_identity` could mint and persist a usable identity, while the immediate follow-up readiness check still came back `readyToParticipate: true`; the tool response should reflect that reconciled truth.
- Phase 10 live UAT also showed `deposit_bond` can reach `CONFIRMED`, but the next `join_auction` fails with `Invalid membership proof for agent 1515`.
- Current readiness is narrower than full join success: `/verify-identity` and `check_identity` effectively mean "ERC-8004 owner matches and a non-zero per-agent Poseidon root is visible", not "the local witness and on-chain proof state are already aligned for JOIN".
- The user wants real-user behavior verified in live conditions, not legacy compatibility cases or purely synthetic tests.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mcp-server/src/tools/register-identity.ts` already has partial-failure scaffolding around on-chain registration, local persistence, and follow-up readiness checks.
- `mcp-server/src/lib/onchain.ts` now has a fallback that extracts the new `agentId` from the ERC-721 mint `Transfer` log when the old registry event shape is absent, so mint receipt parsing should be treated as partly hardened already.
- `mcp-server/src/lib/tool-response.ts` provides the structured MCP success/error response pattern this phase should continue using.
- `mcp-server/src/lib/proof-generator.ts` already centralizes proof generation for join/bid flows and is the main MCP-side entry point for the live proof mismatch.

### Established Patterns
- Phase 09 intentionally made proof enforcement fail closed; this phase should preserve that posture.
- `deposit_bond` and explicit per-call `agentId` targeting have already been proven in live Base Sepolia use and should be treated as stable baselines rather than re-opened design questions.
- The current proof path uses per-agent Poseidon-root-derived membership state on both MCP and engine sides; the remaining bug is likely in how that shared state is constructed, persisted, or compared across the boundary.
- The current readiness gate is weaker than the join gate: `/verify-identity` checks ERC-8004 ownership plus Poseidon-root visibility, but does not validate on-chain capability commitment parity or the presence/correctness of the local `agent-N.json` witness.

### Integration Points
- `register_identity` needs to reconcile the on-chain registration result, local `agent-*.json` state, and the existing `check_identity` readiness path before finalizing its response.
- `join_auction` connects MCP proof generation to engine join verification; the debug plan should instrument both sides tightly enough to explain why a "ready" agent still fails proof verification.
- `engine/src/handlers/actions.ts` and the engine proof verification helpers are the main downstream consumers of MCP-generated membership proofs for the join path.
- Live verification for this phase should use the real Base Sepolia flow already exercised in Phase 10 UAT, not only local unit tests.

</code_context>

<deferred>
## Deferred Ideas

- Refund success-path UX, withdraw UX polish, and read-side privacy follow-up stay out of scope unless they are directly needed to confirm the join fix.
- Broader MCP tool redesign or new lifecycle capabilities do not belong in this phase.

</deferred>

---

*Phase: 12-debug-live-phase-10-registration-and-proof-failures*
*Context gathered: 2026-03-06*
