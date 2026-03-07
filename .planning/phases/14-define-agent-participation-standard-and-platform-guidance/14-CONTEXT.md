# Phase 14: Define agent participation standard and platform guidance - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Define the minimum supported participant stack, wallet requirements, and repo/website guidance for human and agent operators. This phase sets the participation standard and the guidance surfaces that explain it. It does not implement the AgentKit wallet adapter itself and it does not write the full external-facing participation skill/playbook.

</domain>

<decisions>
## Implementation Decisions

### Supported participant stack policy
- The first-class participation standard should be `AgentKit + CDP Server Wallet`.
- Guidance should use a short matrix with labels like `Supported`, `Advanced`, and `Future`.
- `Agentic Wallet` alone should be called out clearly as not yet a verified participation path for this protocol.
- The existing raw-private-key MCP path remains available only as an advanced bridge for power users, not the primary standard path.
- Advanced wallets may be allowed, but only if they satisfy the same explicit capability checklist as the standard path.
- Network scope for the standard is Base Sepolia only.
- EIP-4337 / account abstraction should be described as advanced or optional context, not a required part of the standard.

### Audience split and guidance surfaces
- Create a new dedicated, public frontend participation/setup page as the canonical external handoff surface.
- That page should be checklist-first and intentionally suitable for AI agents to read during setup.
- The page should support one standard with two tracks:
  - a human/operator setup track
  - an agent/runtime participation track
- The page should act as a summary/front door with deep links into the repo/docs, not as the only detailed source.
- It should expose a stable handoff URL that humans can give to agents explicitly.
- The setup guide should be linked prominently from the landing page, docs surfaces, and auction pages.
- The frontend CTA language should clearly communicate that this is the agent setup guide.

### Minimum participation requirements
- The minimum active-participant baseline should be an active bidder baseline, not an observer-only baseline.
- Active participation requires one persistent Base Sepolia owner wallet that remains the ERC-8004 owner, action signer, and bond/refund wallet.
- The standard should explicitly name required assets: Base Sepolia ETH for gas and USDC for bond flows, without hardcoding exact starter balances yet.
- The standard should allow both entry paths:
  - platform-managed onboarding through `register_identity`
  - externally prepared ERC-8004 identity plus compatible ZK state
- The standard should define protocol capabilities first, then map them to supported entry paths.
- The guidance should publish a concise checklist of required config inputs rather than a vague narrative or a full env dump.

### Human assistance and fallback policy
- The platform should optimize for minimal bootstrap help, not a permanently human-in-the-loop flow.
- Acceptable human assistance is limited to initial funding, credential connection, or launching the flow once; normal participation should be agent-driven afterward.
- If an agent cannot satisfy active-participant requirements, the platform should route it to read-only observation or an advanced manual bridge rather than implying active participation is supported.
- The current raw-key/manual MCP route should be documented only as an advanced bridge while the AgentKit adapter work is handled separately.

### Claude's Discretion
- Exact route name and URL shape for the new participation/setup page
- Exact copy for the support matrix and checklist headings
- The detailed visual treatment of the agent handoff CTA and any copyable handoff block
- How much existing README content should be mirrored on the frontend page versus deep-linked

</decisions>

<specifics>
## Specific Ideas

- The public guidance should make it easy for a human to tell an agent: "Read this setup guide first."
- The setup page should feel more suitable for agents than a normal human-only docs page because operators will use agents to help them configure participation.
- The standard should be explicit about what the protocol requires, rather than burying the real requirements inside implementation docs.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `README.md`: already provides the public architecture overview, lifecycle summary, and current repository map.
- `mcp-server/README.md`: already acts as the canonical internal landing page for the current autonomous lifecycle, including the 15-tool flow and current env/config checklist.
- `mcp-server/src/prompts.ts`: contains reusable rules, participation-loop, bond, and troubleshooting language that can seed the public participation guidance.

### Established Patterns
- Current participation truth is split across repo docs and MCP docs; there is no single dedicated public setup page yet.
- The landing page is built as a sectioned Next.js composition with a CTA section and top-level nav, which makes it straightforward to add a prominent setup-guide entry point.
- The current MCP implementation is still raw-key/env oriented (`AGENT_PRIVATE_KEY`, `AGENT_ID`, `AGENT_STATE_FILE`, `BASE_SEPOLIA_RPC`), so a wallet-provider abstraction belongs to the next phase, not this one.

### Integration Points
- Frontend landing surfaces in `frontend/src/components/landing/*` are the natural place for a new setup-guide CTA and route link.
- Repo guidance surfaces that will need alignment are `README.md`, `docs/README.md`, and `mcp-server/README.md`.
- The underlying participation requirements are defined today by the MCP write-path and engine verification flow (`register_identity`, `check_identity`, `deposit_bond`, `join_auction`, `place_bid`, engine identity checks).

</code_context>

<deferred>
## Deferred Ideas

- Implementing the AgentKit-compatible wallet adapter belongs to Phase 15.
- Writing the external-facing agent auction skill, package/setup instructions, and autonomous participation playbook belongs to Phase 16.
- A standalone, fully verified `Agentic Wallet` participation path remains future work until its protocol-signing capabilities are proven for this auction flow.

</deferred>

---

*Phase: 14-define-agent-participation-standard-and-platform-guidance*
*Context gathered: 2026-03-07*
