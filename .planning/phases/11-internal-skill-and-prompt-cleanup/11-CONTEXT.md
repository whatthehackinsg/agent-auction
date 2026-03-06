# Phase 11: Internal skill and prompt cleanup - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Clean up stale repo-internal skill and prompt artifacts that contradict the current MCP tool set, ERC-8004 onboarding ABI, and mandatory ZK participation flow. This phase is internal-facing only: it should remove or fix stale internal guidance without defining the external agent participation standard, the AgentKit wallet path, or the public participation playbook.

</domain>

<decisions>
## Implementation Decisions

### Artifact disposition
- Delete `.claude/skills/auction/SKILL.md` outright.
- Delete `.claude/skills/auction/bond-management/SKILL.md` and `.claude/skills/auction/sealed-bid/SKILL.md` outright.
- Remove the `.claude/skills/auction/` path entirely if nothing current remains in it.
- Do not keep redirect stubs, compatibility placeholders, or archive copies for these stale skill files.

### Historical reference policy
- Leave historical `.planning/**` records untouched even if they reference the removed skill files.
- Phase 11 should only fix active repo-internal references outside historical planning records.
- Verification should treat "no active stale references" as success; it does not need a repo-wide grep clean across archived or historical planning artifacts.
- Leave one brief current note explaining that historical references may still mention the removed skills because those files are part of old execution records.

### Internal canonical source
- After cleanup, `mcp-server/README.md` is the canonical internal landing page for the current auction participation flow.
- Registered MCP prompts in `mcp-server/src/prompts.ts` remain operational helpers for agents, not the primary internal source of truth.
- Leave one small pointer in an existing live doc rather than creating a new internal guide file in this phase.
- Update obvious active comments/help text when they contradict the current post-Phase-13 flow, but do not expand this phase into new public-facing guidance.

### Claude's Discretion
- Exact wording and placement of the brief note that explains why historical `.planning/**` references are intentionally left untouched.
- Which active comments or examples count as "obviously stale" during the cleanup pass, as long as the phase stays internal-facing and avoids expanding into Phase 14-16 work.
- The exact verification commands or grep targets used to prove active stale references were removed.

</decisions>

<specifics>
## Specific Ideas

- The stale `.claude/skills/auction/*` files currently teach the pre-Phase-10 flow, including `selfRegister(uint256)`, optional ZK setup, `generateProof`, `post_bond` as the normal bond path, and human-operated bond transfer.
- The internal cleanup should align remaining active guidance with the current flow: `register_identity`, `check_identity`, `deposit_bond`, `join_auction`, `place_bid`, privacy-preserving reads, and `claim_refund` / `withdraw_funds`.
- Keep this phase surgical. It should clean active internal guidance, not invent the external standard or the future AgentKit story.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mcp-server/README.md`: already documents the current 15-tool lifecycle, prompt list, environment variables, and recommended autonomous participation flow.
- `mcp-server/src/prompts.ts`: already contains current prompt helpers for auction rules, participation loop, bonding walkthrough, sealed-bid guidance, and troubleshooting.
- `mcp-server/src/index.ts`: central registration point for the live prompt set via `registerPrompts(server)`.

### Established Patterns
- The current internal lifecycle is `register_identity -> check_identity -> discover_auctions -> get_auction_details -> deposit_bond -> join_auction -> place_bid -> monitor_auction -> claim_refund / withdraw_funds`.
- `deposit_bond` is the primary bond path; `post_bond` is only the manual fallback.
- JOIN and BID are described as fail-closed proof paths tied to current readiness checks, not optional `generateProof` toggles.
- Historical `.planning/**` files act as execution records and should not be rewritten unless a later phase explicitly expands scope.

### Integration Points
- Delete or replace stale assets under `.claude/skills/auction/`.
- Scan active repo-internal docs, prompts, and obvious comments for references to `selfRegister`, optional proof mode, `generateProof`, or the old bond flow.
- Add one brief live note in an existing active document explaining that old planning records may still reference removed skill files.

</code_context>

<deferred>
## Deferred Ideas

- Define the supported external participant stack, wallet requirements, and operator guidance in Phase 14.
- Implement the AgentKit-compatible wallet abstraction in Phase 15.
- Publish the external-facing agent auction skill and autonomous participation playbook in Phase 16.

</deferred>

---

*Phase: 11-internal-skill-and-prompt-cleanup*
*Context gathered: 2026-03-07*
