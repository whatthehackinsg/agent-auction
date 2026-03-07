# Phase 15: Integrate AgentKit wallet adapter without breaking ZK or ERC-8004 - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Integrate a supported `AgentKit + CDP Server Wallet` participation path into the current auction runtime without changing the existing ZK proof contract, ERC-8004 ownership model, or the advanced raw-key bridge. This phase delivers the adapter and supported runtime behavior for the current MCP/write lifecycle. It does not add a new public playbook, external skill/install flow, or broader wallet-creation product surface.

</domain>

<decisions>
## Implementation Decisions

### Adapter Surface
- Keep one MCP server and the existing tool surface rather than introducing a separate AgentKit product surface.
- Support explicit backend selection, but if both AgentKit/CDP and raw-key bridge config are present and no mode is set, default to the AgentKit path.
- Write-tool responses should clearly report which backend/path was used so operators can debug setup quickly.
- `AgentKit + CDP Server Wallet` becomes the primary supported path immediately; the raw-key route remains only as the advanced bridge.

### Wallet Bootstrap Contract
- Assume the participant agent already has its own AgentKit/CDP-backed wallet/provider; the repo adapts to that existing wallet instead of owning wallet creation.
- Follow the Coinbase-native AgentKit/CDP wallet/provider model even if that changes the current env-driven MCP shape.
- The supported default is one wallet and one active agent identity per runtime instance.
- Do not call the supported wallet path "ready" until it has real live sign-off, not just local connectivity.

### Identity and ZK State Handoff
- Preserve both Phase 14 entry paths:
  - platform-managed onboarding via `register_identity`
  - explicit attachment of an existing ERC-8004 identity plus compatible proof state
- Keep the current proof/state format and invariants intact, but let the adapter manage how that compatible state is located and reused.
- If compatible ZK state is missing, fail closed and explain the recovery path instead of degrading into a partial active-participant mode.
- Existing-identity adoption must be an explicit attach step, not implicit detection/guesswork.

### Fallback Behavior
- If the supported AgentKit/CDP write path is incomplete or invalid, write tools fail closed and point operators to the advanced raw-key bridge.
- Read-only tools remain available even when the supported write path is unavailable.
- When both backends are configured, AgentKit is the supported default path; the raw-key bridge remains opt-in/advanced.

### Claude's Discretion
- Exact adapter class/module boundaries inside `mcp-server/src/lib/*`
- Exact config variable names and whether the supported path uses envs, structured config, or a thin compatibility shim
- Exact response field names for reporting the chosen wallet backend
- How much of the raw-key compatibility layer is centralized versus handled per tool, as long as the supported/advanced distinction stays explicit

</decisions>

<specifics>
## Specific Ideas

- The supported path should feel like "the platform adapts to a real AgentKit/CDP-backed agent wallet" rather than "the repo invents its own wallet lifecycle."
- Phase 15 should preserve the current auction tool names and lifecycle instead of inventing a second participation product surface.
- Full live sign-off is part of the definition of done for the supported path.
- The single persistent owner-wallet rule from Phase 14 is already locked and should not be reopened here.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mcp-server/src/lib/signer.ts`: centralizes the current EIP-712 JOIN/BID signing flow and is the clearest insertion point for a wallet-backed signing abstraction.
- `mcp-server/src/lib/onchain.ts`: centralizes Base Sepolia viem reads/writes for ERC-8004, AgentPrivacyRegistry, USDC, and escrow flows; the adapter should reuse these contract interaction paths rather than inventing parallel write logic.
- `mcp-server/src/lib/config.ts`: currently owns the raw-key/env contract and is the obvious place to introduce supported AgentKit/CDP config alongside the advanced bridge.
- `mcp-server/src/lib/agent-target.ts`: centralizes identity/wallet resolution for write tools and is the strongest current seam for backend-aware target resolution.
- `mcp-server/src/tools/register-identity.ts`: already orchestrates identity minting, ZK bootstrap, local state persistence, privacy registration, and readiness checks in one flow.
- `mcp-server/src/tools/join.ts`: already demonstrates the fail-closed readiness boundary and local/on-chain proof-state reconciliation rules that Phase 15 must preserve.

### Established Patterns
- MCP write tools are thin orchestration layers over shared `lib/*` helpers rather than self-contained implementations.
- Base Sepolia interactions use viem clients and typed helper functions, which aligns well with Coinbase's viem-compatible Server Wallet path.
- Identity and proof checks are already intentionally fail-closed; the adapter must preserve that behavior rather than softening it.
- The raw-key path is currently the advanced bridge and is encoded primarily through `AGENT_PRIVATE_KEY`, `AGENT_ID`, and `AGENT_STATE_FILE`.

### Integration Points
- `mcp-server/src/lib/config.ts`
- `mcp-server/src/lib/agent-target.ts`
- `mcp-server/src/lib/signer.ts`
- `mcp-server/src/lib/onchain.ts`
- `mcp-server/src/tools/register-identity.ts`
- `mcp-server/src/tools/join.ts`
- related write tools that share the same identity/wallet contract: bid, bond, refund, and withdraw flows

### External Reference Truth
- Official AgentKit docs confirm custom action providers can act through a `WalletProvider`.
- Coinbase docs position CDP Wallet v2 / Server Wallet as the recommended AgentKit wallet provider, viem-compatible, and capable of EIP-712 signing.

</code_context>

<deferred>
## Deferred Ideas

- Repo-managed wallet creation/first-run wallet lifecycle as a first-class product surface
- Multi-agent participation from one supported AgentKit runtime instance
- Implicit existing-identity detection without an explicit attach step
- Automatic ZK-state regeneration/rebootstrap beyond the fail-closed recovery guidance
- External-facing install/playbook/skill work reserved for Phase 16

</deferred>

---

*Phase: 15-integrate-agentkit-wallet-adapter-without-breaking-zk-or-erc-8004*
*Context gathered: 2026-03-07*
