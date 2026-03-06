# Phase 13: Cloudflare Worker Proof Runtime Compatibility - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the remaining live proof-runtime blocker after Phase 12-03: Cloudflare Worker proof verification currently fails with `URL.createObjectURL() is not implemented` during the deployed `join_auction` path, even though the privacy-registry redeploy/repoint is already complete. This phase should focus on making proof verification work in the Worker runtime itself, with JOIN as the live sign-off path and BID included because it shares the same proof-runtime surface. It should not expand into new auction capabilities.

</domain>

<decisions>
## Implementation Decisions

### Done bar
- The minimum live success path is `check_identity -> deposit_bond -> join_auction`.
- Final sign-off must use a fresh agent, not only the previously debugged agent `1532`.
- Final sign-off should use a fresh auction, even though reusing an existing auction is acceptable during debugging.
- The phase stays blocked unless both a real local end-to-end proof run and a deployed-Worker end-to-end proof run are green.
- Final summary evidence should be full-fidelity: fresh `agentId`, state file path, worker version, auctionId, tx hashes, and successful MCP tool outputs.
- If one runtime passes and the other still fails, the phase does not close.

### Scope boundary
- Phase 13 should cover the shared proof-runtime surface for both JOIN and BID, not only the current live JOIN blocker.
- JOIN is still the live sign-off path; BID should be exercised as part of the shared runtime work, but it can remain follow-up evidence unless it actually fails.
- Cleanup should be targeted: only proof-runtime shims, comments, tests, and notes that directly support the final fix.
- Targeted tests and planning/UAT notes belong in the same phase; broader polishing or skill/document rewrites do not.
- The phase should stay strict about Worker-side proof verification. Do not broaden the main goal into a non-Worker verification architecture just because debugging is hard.
- Contract-side work is not the main target, but it may be reopened as a contingency if the runtime investigation unexpectedly points back to deployed contract/config behavior.
- Engine and MCP are both in scope for targeted alignment; ad hoc live-run helpers may be used during the phase, but helper tooling is not part of the deliverable.

### Failure behavior
- JOIN and BID should converge on a shared proof-runtime outage code family if that failure mode is confirmed, rather than each inventing unrelated wording.
- User-facing tool responses should stay structured and guided, but include the raw runtime clue in diagnostic detail when it helps debugging.
- `check_identity` should remain about identity/privacy readiness; it should not be redefined to mean proof-runtime health.
- MCP may fail early when the runtime failure is known and deterministic, but otherwise the engine remains the source of truth for write-path rejection.

### Claude's Discretion
- Exact error-code names and payload field names for the shared proof-runtime failure surface
- How much low-level runtime detail appears in default tool output versus diagnostics fields
- Whether the local proof-runtime validation is implemented as a dedicated script, targeted tests, or another reproducible engineering path, as long as it proves true local end-to-end behavior

</decisions>

<specifics>
## Specific Ideas

- The immediate blocker to anchor on is the deployed Worker error:
  `Membership proof verification errored for agent 1532: URL.createObjectURL() is not implemented`
- Phase 12-03 already proved the contract side is no longer the main problem:
  - per-agent `AgentPrivacyRegistry` is deployed at `0x5b4f09A5D5188dCe1b1ba0caeDBcEb52CaCD1902`
  - `check_identity` is green
  - `deposit_bond` is `CONFIRMED`
  - only proof verification still fails
- The user wants Phase 13 to stay strict about making proof verification actually work in Cloudflare Workers, not to quietly route around the Worker runtime by default.
- Even though the live blocker first showed up on JOIN, Phase 13 should not ignore BID because both proof paths are anchored in the same engine proof-runtime layer.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `engine/src/lib/crypto.ts`: owns both `verifyMembershipProof()` and `verifyBidRangeProof()`, so it is the core shared proof-runtime surface for JOIN and BID.
- `engine/src/lib/snarkjs-runtime.ts`: current bundling shim that tries to force Wrangler toward the Node/CJS `snarkjs` entry.
- `engine/src/handlers/actions.ts`: maps proof verification results into structured JOIN/BID failures and is the main engine-side user-facing boundary.
- `mcp-server/src/tools/join.ts`: already separates readiness from join success and has preflight/error-shaping logic for structured proof failures.
- `mcp-server/src/tools/bid.ts`: shares the same verification/readiness contract and should stay aligned if the runtime failure gets a shared code family.
- `.planning/phases/12-debug-live-phase-10-registration-and-proof-failures/12-03-SUMMARY.md`: freshest live evidence for the post-registry-redeploy blocker.

### Established Patterns
- Phase 09 made proof enforcement fail-closed by default. Phase 13 should preserve that stance.
- Phase 12 intentionally kept `check_identity` narrower than JOIN/BID success. That boundary should remain intact.
- Engine and MCP now point at the same per-agent privacy-registry deployment, so the next debugging cycle should assume contract/address alignment is already fixed unless new evidence contradicts it.
- JOIN and BID share enough of the proof-runtime path that a partial fix for only one path is suspect and should be treated carefully.

### Integration Points
- Any Worker-runtime proof fix will likely touch the engine verification layer first, then the structured error mapping in `engine/src/handlers/actions.ts`, then MCP JOIN/BID surfacing in `mcp-server/src/tools/join.ts` and `mcp-server/src/tools/bid.ts`.
- Local sign-off needs a real local end-to-end proof run, not only unit coverage, because the phase explicitly requires local-versus-deployed runtime parity.
- Deployed sign-off must rerun the same MCP lifecycle against the real Worker with a fresh agent and a fresh auction so the final evidence is current.

</code_context>

<deferred>
## Deferred Ideas

- Broader docs, prompt, or skill rewrites beyond targeted test/note updates belong in later phases.
- New auction capabilities or UX changes outside JOIN/BID proof-runtime handling are out of scope.
- A permanent alternate non-Worker verification architecture is not the default scope for this phase; if it becomes necessary, that should be called out explicitly during planning rather than assumed.

</deferred>

---

*Phase: 13-redeploy-agentprivacyregistry-and-repoint-base-sepolia-config*
*Context gathered: 2026-03-06*
