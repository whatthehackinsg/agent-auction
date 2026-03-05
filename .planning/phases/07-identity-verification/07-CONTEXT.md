# Phase 7: Identity Verification - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Enforce on-chain identity verification as baseline security. Engine rejects actions from unverified agents. MCP tools pre-flight check identity before submitting. Clear structured errors for all failure modes.

Requirements: IDVR-01, IDVR-02, IDVR-03, IDVR-04

</domain>

<decisions>
## Implementation Decisions

### Enforcement Scope
- Wallet verification runs on **JOIN only** (not BID/REVEAL) — verified once per auction room
- `ENGINE_VERIFY_WALLET` defaults to **true** when unset (secure by default)
- `ENGINE_VERIFY_WALLET=false` only works when `ENGINE_ALLOW_INSECURE_STUBS=true` (dev-only bypass)
- `/verify-identity` endpoint stays **public** (no auth required) — agents need it for pre-flight

### Pre-flight Behavior
- MCP tools (`join_auction`, `place_bid`) **hard block** if identity not verified — refuse to submit action
- Pre-flight checks **both** ERC-8004 identity AND privacy registry status
- **Both** join and bid pre-flight check (agent may call bid without prior join in restart scenarios)
- Shared `verifyIdentityPreFlight()` helper in `lib/identity-check.ts` — both tools import it
- Remote-only check via `/verify-identity` (no local wallet derivation check)
- **Fail closed** if engine unreachable during pre-flight — can't verify = can't proceed
- Error messages include **full actionable next steps** with contract addresses and MCP tool names

### Cache Invalidation
- **No cache** for wallet verification — always verify on-chain per JOIN
- **No cache** for Poseidon root lookup — always fresh from chain
- Remove existing `walletVerified:{agentId}` and `poseidonRoot:{agentId}` cache logic from DO storage
- 1 RPC call per JOIN per room is acceptable at expected auction frequency

### Error Codes
- Engine returns **structured error codes**: `AGENT_NOT_REGISTERED`, `WALLET_MISMATCH`, `IDENTITY_RPC_FAILURE`
- Mismatch errors **include resolved on-chain wallet** (e.g., "Expected 0xABC (on-chain owner), got 0xDEF")
- Follows existing MCP error taxonomy: `{code, detail, suggestion}`

### Claude's Discretion
- MCP pre-flight caching strategy (cache per session in memory vs check every time)
- HTTP status codes for each error type (400 vs 403 vs 502)
- Whether to batch wallet + Poseidon root into a single RPC multicall

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `engine/src/lib/identity.ts`: `verifyAgentWallet()`, `resolveAgentWallet()`, `getAgentPoseidonRoot()` — core verification functions, already working
- `engine/src/handlers/actions.ts` lines 259-270: wallet verification block with cache — needs cache removal
- `mcp-server/src/tools/identity.ts`: `check_identity` tool — calls `/verify-identity`, returns readiness object
- `mcp-server/src/lib/config.ts`: `requireSignerConfig()` — already validates AGENT_PRIVATE_KEY + AGENT_ID

### Established Patterns
- Engine error pattern: throw Error with message string → returned as JSON `{error: message}` with 400 status
- MCP error pattern: `toolError(code, detail, suggestion)` returns `{success: false, error: {code, detail, suggestion}}`
- Engine env flags: string comparison `=== 'true'` pattern (ENGINE_REQUIRE_PROOFS, ENGINE_X402_DISCOVERY)
- DO storage caching: `storage.get<T>(key)` / `storage.put(key, value)` — used for nonces, nullifiers, wallet cache

### Integration Points
- `engine/src/auction-room.ts` line 491: ValidationContext constructed from env vars — needs default change
- `engine/src/handlers/actions.ts` line 259: `if (ctx?.verifyWallet)` gate — needs to default true
- `mcp-server/src/tools/join.ts` line 85: after `requireSignerConfig()` — insert pre-flight check
- `mcp-server/src/tools/bid.ts` line 98: after `requireSignerConfig()` — insert pre-flight check

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard security hardening approach.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-identity-verification*
*Context gathered: 2026-03-05*
