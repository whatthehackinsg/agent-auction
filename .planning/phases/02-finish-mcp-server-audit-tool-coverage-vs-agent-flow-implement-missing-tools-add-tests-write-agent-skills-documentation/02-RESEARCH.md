# Phase 2: Finish MCP Server - Research

**Researched:** 2026-03-04
**Domain:** MCP server tool coverage, testing, agent skills documentation
**Confidence:** HIGH

## Summary

The MCP server (`mcp-server/`) currently has 7 tools (discover, details, join, bid, bond x2, events, reveal) covering the core agent participation flow. Two tools have tests (bid, join) while five lack any test coverage (discover, details, bond, events, reveal). The existing test pattern uses a "capturing mock" approach -- mock `McpServer` that captures the registered handler, mock `EngineClient` that captures POST payloads -- which is well-established and should be replicated for all untested tools.

The agent-client (`agent-client/src/`) demonstrates the complete end-to-end flow including steps the MCP server does NOT yet expose: `createAuction` (admin), `waitForSettlement` (on-chain polling), `claimRefund` (on-chain TX), and `registerIdentity` (ERC-8004). Per CONTEXT.md decisions, auction creation is deferred (admin-side), but `check_settlement_status` is a candidate for addition since agents need post-auction awareness. The server also needs new MCP prompts (sealed-bid strategy, bonding walkthrough, troubleshooting) and Claude Agent Skills in `.claude/skills/auction/`.

**Primary recommendation:** Add test coverage for 5 untested tools using existing mock patterns, add a `check_settlement_status` tool, standardize error responses, create 3 new MCP prompts, and write 2-3 Claude Agent Skills following the existing `.claude/skills/` SKILL.md format (YAML frontmatter + markdown body).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Write skills as Claude Agent Skills following the `.claude/skills/` SKILL.md format (frontmatter with name + description, markdown body with When to Use, Workflow, Checklist sections)
- Skills should be placed in `.claude/skills/auction/` directory
- Key skills needed: auction participation flow (discover -> join -> bid -> monitor -> settle), bond management, sealed-bid strategy
- Skills are consumed by AI agents at runtime -- they teach agents HOW to use the MCP tools effectively
- Follow the same pattern as existing `.claude/skills/gitnexus/` and `.claude/skills/foundry-dev/` skills in this repo
- Current 7 tools cover the core flow: discover, details, join, bid, bond (get+post), events, reveal
- Missing tools to evaluate: create_auction (admin), check_settlement_status, cancel/withdraw, agent_register (identity)
- Focus on what an agent PARTICIPANT needs -- auction creation is admin-side, can be deferred
- ZK proof generation is already handled server-side via proof-generator.ts (agents don't need @agent-auction/crypto)
- Add tests for all tools that don't have coverage (discover, details, bond, events, reveal -- currently only bid and join have tests)
- Mock engine HTTP responses (don't require running engine)
- Test both success and error paths
- Use existing test pattern from bid.test.ts and join.test.ts
- Standardize error responses across all tools with structured format: `{ error: string, code: string, suggestion: string }`
- Agents need actionable error messages
- Zod validation already in place -- ensure all tools have complete schemas with `.describe()` on every field
- Existing `auction_rules` prompt is good -- keep it
- Add prompts for: sealed-bid strategy guide, bonding walkthrough, troubleshooting common errors
- Prompts complement skills: skills are for Claude Code agents, prompts are for MCP-connected agents
- MCP README should include a "quick start" section showing how to connect an agent to the MCP server

### Claude's Discretion
- Exact error code taxonomy
- Test fixture data structure
- Internal code organization within tools
- Whether to add a `health_check` or `server_info` tool

### Deferred Ideas (OUT OF SCOPE)
- WebSocket streaming tool (real-time event subscription) -- would need SSE or streaming MCP transport
- Auction creation tool -- admin-side, not participant flow
- Multi-agent coordination skills -- future phase
- Agent reputation/history tracking -- future feature
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | 1.27.1 | MCP server framework | Official MCP SDK, Streamable HTTP transport |
| `vitest` | 3.2.1 | Test framework | Already configured, matches project convention |
| `zod` | 3.25.0 | Input validation schemas | Already used by all tools, MCP SDK integration |
| `viem` | 2.46.2 | EIP-712 signing, hex utilities | Already used by signer.ts |
| `express` | 5.1.0 | HTTP framework | Already configured for MCP transport |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@agent-auction/crypto` | workspace | ZK proof generation | Server-side proof gen in proof-generator.ts |
| `ethers` | 6.16.0 | RPC provider for registry root reads | Only in proof-generator.ts |
| `tsx` | 4.20.3 | Dev server runner | Development only |

**No new dependencies needed.** All required libraries are already installed.

## Architecture Patterns

### Existing Project Structure (mcp-server/)
```
src/
  index.ts              # Express app, session management, tool registration
  prompts.ts            # MCP prompt templates
  lib/
    config.ts           # Environment config + requireSignerConfig()
    engine.ts           # EngineClient HTTP wrapper
    signer.ts           # EIP-712 ActionSigner
    proof-generator.ts  # Server-side ZK proof generation
  tools/
    discover.ts         # discover_auctions (read)
    details.ts          # get_auction_details (read)
    events.ts           # get_auction_events (read, participant-gated)
    join.ts             # join_auction (write, EIP-712)
    bid.ts              # place_bid (write, EIP-712)
    bond.ts             # get_bond_status + post_bond (read + write)
    reveal.ts           # reveal_bid (write, EIP-712)
test/
  bid.test.ts           # 5 tests (proof pass-through + structured errors)
  join.test.ts          # 7 tests (nullifier derivation + proof + errors)
  fixtures/
    bidrange-proof.json
    membership-proof.json
```

### Pattern 1: Tool Registration
**What:** Each tool lives in its own file, exports a `register*Tool(server, engine, config?, nonceTracker?)` function.
**When to use:** Every new tool must follow this pattern.
**Example:**
```typescript
// Source: mcp-server/src/tools/discover.ts
export function registerDiscoverTool(server: McpServer, engine: EngineClient): void {
  server.registerTool(
    'tool_name',
    {
      title: 'Human Title',
      description: 'What this tool does and when to use it.',
      inputSchema: z.object({
        param: z.string().describe('Description of this parameter'),
      }),
    },
    async ({ param }) => {
      // Implementation
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    },
  )
}
```

### Pattern 2: Capturing Mock Test Pattern
**What:** Tests capture the tool handler callback and mock engine responses without running a real server.
**When to use:** All tool tests must follow this pattern.
**Example:**
```typescript
// Source: mcp-server/test/bid.test.ts
function makeCapturingMcpServer() {
  let capturedHandler: ((params: Record<string, unknown>) => Promise<unknown>) | null = null
  const mockServer = {
    registerTool: (_name: string, _def: unknown, handler: Function) => {
      capturedHandler = handler
    },
  } as unknown as McpServer
  return { mockServer, getHandler: () => capturedHandler! }
}

function makeCapturingEngine(overrides?) {
  const capturedPayloads: unknown[] = []
  const mockEngine = {
    post: async (path, body) => { capturedPayloads.push(body); return { seq: 1, eventHash: '0xabc', prevHash: '0x000' } },
    get: async (path) => { return { /* mock response */ } },
  } as unknown as EngineClient
  return { mockEngine, capturedPayloads }
}
```

### Pattern 3: Structured Error Responses
**What:** Write tools return structured errors with code, detail, and suggestion fields.
**When to use:** All error paths in all tools should use this pattern.
**Example:**
```typescript
// Source: mcp-server/src/tools/join.ts (zkError pattern)
function structuredError(code: string, detail: string, suggestion: string) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ success: false, error: { code, detail, suggestion } }, null, 2),
    }],
  }
}
```

### Pattern 4: Read vs Write Tool Separation
**What:** Read tools (discover, details, events, bond status) work without signer config. Write tools (join, bid, post_bond, reveal) call `requireSignerConfig(config)` at the start.
**When to use:** New tools must respect this separation per AGENTS.md local rules.

### Anti-Patterns to Avoid
- **Throwing raw errors from tools:** Always return structured error content blocks instead of throwing, so the MCP client (AI agent) receives actionable information
- **Hardcoding engine URLs in tool files:** Use `EngineClient` which gets base URL from config
- **Adding stdio transport:** The server uses Streamable HTTP only (per AGENTS.md)
- **Making read tools require signer config:** Read tools must remain usable without `AGENT_PRIVATE_KEY`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Input validation | Custom validation logic | Zod schemas with `.describe()` | MCP SDK integrates Zod natively; descriptions become tool parameter docs |
| HTTP client | Custom fetch wrapper | `EngineClient.get()` / `.post()` | Already handles admin key injection, error wrapping |
| EIP-712 signing | Manual signature construction | `ActionSigner` class | Already aligned with engine and agent-client |
| ZK proof generation | Client-side proof gen | `proof-generator.ts` server-side | Already wired, agents don't need @agent-auction/crypto |
| Session management | Custom session tracking | MCP SDK `StreamableHTTPServerTransport` | Built-in session lifecycle |

**Key insight:** The MCP server is a thin translation layer. Tools should call `EngineClient` methods and format responses -- they should NOT implement business logic, validation, or cryptographic operations themselves.

## Common Pitfalls

### Pitfall 1: Test Isolation with Shared nonceTracker
**What goes wrong:** Tests that share a `nonceTracker` Map can interfere with each other since nonce increments persist across test calls.
**Why it happens:** The nonceTracker is passed by reference to register functions.
**How to avoid:** Create a fresh `new Map<string, number>()` in each test case (existing tests already do this correctly).
**Warning signs:** Tests pass individually but fail when run together.

### Pitfall 2: Inconsistent Error Response Shapes
**What goes wrong:** Some tools throw errors (propagated as MCP error responses) while others return structured `{ success: false, error: {...} }` content blocks.
**Why it happens:** The bid/join tools have structured error handling (zkError), but reveal and bond tools have partial coverage.
**How to avoid:** Standardize ALL tools to return structured error content blocks with `{ success: boolean, error?: { code, detail, suggestion } }` format.
**Warning signs:** AI agents receiving raw error strings instead of actionable structured data.

### Pitfall 3: Missing `.describe()` on Zod Schema Fields
**What goes wrong:** MCP clients (AI agents) don't know what parameters mean or what format to use.
**Why it happens:** Some optional parameters lack `.describe()` calls.
**How to avoid:** Audit all Zod schemas; every field must have `.describe()` with format hints (e.g., "USDC base units, 6 decimals").
**Warning signs:** Agents passing wrong formats (e.g., "50 USDC" instead of "50000000").

### Pitfall 4: Engine Response Shape Assumptions
**What goes wrong:** Tests mock engine responses with minimal objects that don't match real engine shapes.
**Why it happens:** No shared type definitions for engine API responses.
**How to avoid:** Create typed fixture factories that match real engine response shapes. Check engine API routes for actual response shapes.
**Warning signs:** Tests pass but tools fail against real engine.

### Pitfall 5: Reveal Tool Missing Salt Storage Context
**What goes wrong:** Agent calls `reveal_bid` but doesn't have the salt from the `place_bid` sealed response.
**Why it happens:** The sealed bid response includes `revealSalt` but there's no mechanism to persist it across tool calls.
**How to avoid:** The `reveal_bid` tool description must clearly state agents need to save the `revealSalt` from `place_bid`. Skills documentation should emphasize this.
**Warning signs:** Agents calling reveal without the correct salt.

## Tool Coverage Gap Analysis

### Current Tool vs Agent Flow Mapping

| Agent Flow Step | Engine Endpoint | MCP Tool | Status |
|----------------|-----------------|----------|--------|
| 1. Discover auctions | `GET /auctions` | `discover_auctions` | COVERED |
| 2. Get auction details | `GET /auctions/:id` | `get_auction_details` | COVERED |
| 3. On-chain USDC transfer | (wallet TX, outside MCP) | N/A | N/A -- on-chain |
| 4. Submit bond proof | `POST /auctions/:id/bonds` | `post_bond` | COVERED |
| 5. Check bond status | `GET /auctions/:id/bonds/:agentId` | `get_bond_status` | COVERED |
| 6. Join auction | `POST /auctions/:id/action` (JOIN) | `join_auction` | COVERED |
| 7. Place bid | `POST /auctions/:id/action` (BID) | `place_bid` | COVERED |
| 8. Sealed bid commit | `POST /auctions/:id/action` (BID_COMMIT) | `place_bid` (sealed=true) | COVERED |
| 9. Reveal sealed bid | `POST /auctions/:id/action` (REVEAL) | `reveal_bid` | COVERED |
| 10. Monitor events | `GET /auctions/:id/events` | `get_auction_events` | COVERED |
| 11. Check settlement | (on-chain getAuctionState) | -- | MISSING |
| 12. Get stats | `GET /stats` | -- | NOT NEEDED (admin) |
| 13. Close auction | `POST /auctions/:id/close` | -- | DEFERRED (admin) |
| 14. Cancel auction | `POST /auctions/:id/cancel` | -- | DEFERRED (admin) |
| 15. Claim refund | (on-chain claimRefund) | -- | NOT FEASIBLE via MCP (requires wallet TX) |

### Recommended New Tool: `check_settlement_status`

The agent-client demonstrates `waitForSettlement()` which polls `getAuctionState()` on-chain. A lightweight MCP tool can provide this by reading auction status from the engine snapshot (already available via `GET /auctions/:id`). No on-chain call needed -- the engine's snapshot includes `status` which reflects the on-chain state machine.

Implementation approach: read `GET /auctions/:id` and return a focused settlement-oriented view:
```typescript
// check_settlement_status response shape
{
  auctionId: string,
  status: 'OPEN' | 'CLOSED' | 'SETTLED' | 'CANCELLED',
  winnerAgentId: string | null,
  winnerWallet: string | null,
  winningBidAmount: string | null,
  isSettled: boolean,
  suggestion: string  // e.g. "Settlement in progress via CRE" or "Auction still open"
}
```

### Test Coverage Matrix

| Tool | Tests Exist | Tests Needed |
|------|-------------|-------------|
| `join_auction` | YES (7 tests) | Sufficient |
| `place_bid` | YES (5 tests) | Sufficient |
| `discover_auctions` | NO | Success, status filter, NFT filter, empty list |
| `get_auction_details` | NO | Success, auction not found (engine error), response shape |
| `get_bond_status` | NO | Success (each status), missing agentId fallback to config, no agentId error |
| `post_bond` | NO | Success, missing signer config error |
| `get_auction_events` | NO | Success, with limit, participant token pass-through, empty events |
| `reveal_bid` | NO | Success, commitment mismatch error, reveal window error, missing signer config |
| `check_settlement_status` | NO (new tool) | Success (each status), not-found error |

## Code Examples

### Test Template for Read Tools (e.g., discover_auctions)
```typescript
// Source: Based on mcp-server/test/bid.test.ts pattern
import { describe, it, expect } from 'vitest'
import type { EngineClient } from '../src/lib/engine.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerDiscoverTool } from '../src/tools/discover.js'

function makeCapturingMcpServer() {
  let capturedHandler: ((params: Record<string, unknown>) => Promise<unknown>) | null = null
  const mockServer = {
    registerTool: (_name: string, _definition: unknown, handler: Function) => {
      capturedHandler = handler
    },
  } as unknown as McpServer
  return { mockServer, getHandler: () => capturedHandler! }
}

function makeMockEngine(response: unknown) {
  return {
    get: async (_path: string) => response,
    post: async (_path: string, _body: unknown) => response,
  } as unknown as EngineClient
}

describe('discover_auctions', () => {
  it('returns all auctions with status labels', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const mockEngine = makeMockEngine({
      auctions: [
        { auction_id: '0x01', title: 'Test', status: 1, reserve_price: '100', /* ... */ },
      ],
    })
    registerDiscoverTool(mockServer, mockEngine)
    const handler = getHandler()
    const result = await handler({}) as { content: Array<{ text: string }> }
    const body = JSON.parse(result.content[0].text)
    expect(body.auctions).toHaveLength(1)
    expect(body.auctions[0].status).toBe('OPEN')
  })

  it('filters by status', async () => { /* ... */ })
  it('filters by NFT presence', async () => { /* ... */ })
  it('returns empty list gracefully', async () => { /* ... */ })
})
```

### Structured Error Pattern (standardized)
```typescript
// Recommended helper to extract into shared utility
function toolError(code: string, detail: string, suggestion: string) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ success: false, error: { code, detail, suggestion } }, null, 2),
    }],
  }
}

function toolSuccess(data: Record<string, unknown>) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ success: true, ...data }, null, 2),
    }],
  }
}
```

### Claude Agent Skill Format (SKILL.md)
```markdown
---
name: auction-participation
description: Guide AI agents through the auction participation lifecycle using MCP tools. Use when an agent needs to discover, evaluate, join, bid in, or monitor auctions on the agent-native auction platform.
---

# Auction Participation

You are an AI agent participating in an agent-native auction platform via MCP tools.

## When to Use
- Agent needs to find and evaluate open auctions
- Agent needs to post bond, join, and bid in an auction
- Agent needs to monitor auction progress and settlement

## Workflow
1. Call `discover_auctions` with statusFilter="OPEN"
2. Call `get_auction_details` for interesting auctions
3. Evaluate: reserve price vs budget, deposit amount, competition level
4. Post USDC bond on-chain, then call `post_bond` with tx hash
5. Call `get_bond_status` until CONFIRMED
6. Call `join_auction` with auction ID and bond amount
7. Call `place_bid` with amount exceeding highest bid
8. Monitor via `get_auction_events` and `get_auction_details`

## Checklist
- [ ] Budget > reserve price + deposit amount
- [ ] Bond CONFIRMED before joining
- [ ] Bid amount > current highest bid
- [ ] Save revealSalt if using sealed bids
- [ ] Monitor timeRemainingSec for deadline
```

## Error Code Taxonomy (Claude's Discretion)

Recommended error codes organized by category:

| Code | Category | When Used |
|------|----------|-----------|
| `MISSING_CONFIG` | Config | AGENT_PRIVATE_KEY or AGENT_ID not set |
| `AGENT_NOT_REGISTERED` | ZK | AGENT_STATE_FILE not set for proof generation |
| `STALE_ROOT` | ZK | BASE_SEPOLIA_RPC not set for registry root |
| `INVALID_SECRET` | ZK | Proof generation failed |
| `PROOF_INVALID` | ZK | Engine rejected ZK proof |
| `PROOF_REQUIRED` | ZK | Sealed bid requires proof but none provided |
| `NULLIFIER_REUSED` | ZK | Agent already joined this auction |
| `BID_COMMIT_FAILED` | Engine | Sealed bid commit rejected |
| `BOND_NOT_CONFIRMED` | Bond | Attempted join before bond confirmed |
| `AUCTION_NOT_FOUND` | Engine | Invalid auction ID |
| `AUCTION_CLOSED` | Engine | Action on non-OPEN auction |
| `BID_TOO_LOW` | Engine | Bid does not exceed current highest |
| `ENGINE_ERROR` | Engine | Unhandled engine error (include raw message) |
| `REVEAL_MISMATCH` | Reveal | Bid/salt don't match commitment |
| `REVEAL_WINDOW_CLOSED` | Reveal | Reveal window not open |

## MCP Prompts Plan

### Existing Prompts (keep as-is)
1. `auction_rules` -- Platform rules explanation
2. `bidding_strategy` -- Bidding framework with maxBudget param
3. `participation_loop` -- Step-by-step autonomous workflow

### New Prompts to Add
4. `sealed_bid_guide` -- How sealed-bid auctions work: BID_COMMIT -> reveal window -> REVEAL. Emphasize saving revealSalt.
5. `bonding_walkthrough` -- Step-by-step bonding: on-chain USDC transfer -> post_bond -> get_bond_status polling -> CONFIRMED. Include AuctionEscrow address and USDC format.
6. `troubleshooting` -- Common error codes and their fixes. Map error codes to resolution steps.

## Agent Skills Plan

### Skill 1: `auction-participation` (primary skill)
- **Location:** `.claude/skills/auction/SKILL.md`
- **Scope:** Full lifecycle: discover -> evaluate -> bond -> join -> bid -> monitor -> settle
- **Format:** YAML frontmatter (name, description) + markdown (When to Use, Workflow, Checklist)
- **Key content:** Tool call sequence, parameter formats (USDC 6 decimals, 0x-prefixed IDs), decision framework

### Skill 2: `sealed-bid-strategy`
- **Location:** `.claude/skills/auction/sealed-bid/SKILL.md`
- **Scope:** Sealed-bid auction strategy: commit phase, reveal phase, salt management
- **Key content:** BID_COMMIT flow, revealSalt persistence, timing the reveal window

### Skill 3: `auction-bond-management`
- **Location:** `.claude/skills/auction/bond-management/SKILL.md`
- **Scope:** Bond lifecycle: check requirements, on-chain transfer, proof submission, status polling
- **Key content:** AuctionEscrow address, USDC format, polling pattern, error recovery

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| stdio MCP transport | Streamable HTTP transport | MCP SDK 1.x | Server uses Express + StreamableHTTPServerTransport |
| Manual tool definitions | Zod schema + registerTool | MCP SDK 1.x | Input validation and docs from Zod schemas |
| No ZK proofs in MCP | Server-side proof gen | Phase 1 | Agents don't need ZK libraries, server handles it |
| Raw error strings | Structured error codes | This phase | Agents get actionable error information |

## Open Questions

1. **Should `check_settlement_status` read from engine or on-chain?**
   - What we know: Engine snapshot has `status` field reflecting on-chain state. Agent-client polls on-chain directly.
   - What's unclear: How fresh is the engine snapshot after settlement? Is there any delay?
   - Recommendation: Use engine snapshot (already available via `GET /auctions/:id`). Simpler, no RPC dependency. The engine's DO updates status on close/settle events.

2. **Should we add a `health_check` MCP tool?**
   - What we know: `/health` HTTP endpoint exists but is NOT exposed as an MCP tool. It returns engine URL and agent config status.
   - What's unclear: Whether MCP clients benefit from a health check tool vs the HTTP endpoint.
   - Recommendation: Skip. The `/health` endpoint is already available for infrastructure monitoring. MCP tools should focus on auction operations. If an agent needs to verify connectivity, calling `discover_auctions` serves the same purpose.

3. **Should test fixtures share a common factory?**
   - What we know: bid.test.ts and join.test.ts both define `makeCapturingMcpServer()` and `makeCapturingEngine()` independently.
   - Recommendation: Extract shared test helpers into `test/helpers.ts` to avoid duplication across 7+ test files.

## Sources

### Primary (HIGH confidence)
- `mcp-server/src/` -- All 7 tool implementations, lib utilities, prompts (read directly)
- `mcp-server/test/` -- Existing test patterns for bid and join (read directly)
- `mcp-server/AGENTS.md` -- Local rules and constraints (read directly)
- `mcp-server/README.md` -- Architecture and tool documentation (read directly)
- `mcp-server/package.json` -- Dependencies and versions (read directly)
- `agent-client/src/` -- Complete agent flow including settlement, refund (read directly)
- `engine/src/index.ts` -- All 20+ engine API routes (grep for full coverage)
- `.claude/skills/` -- 6 existing skill directories with SKILL.md format examples (read directly)

### Secondary (MEDIUM confidence)
- [Claude Code Agent Skills docs](https://code.claude.com/docs/en/skills) -- SKILL.md format specification
- [Anthropic Skills repository](https://github.com/anthropics/skills) -- Official skill examples
- [Claude Agent Skills best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) -- Authoring guidelines
- MCP SDK 1.27.1 -- Verified installed version via package.json

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all dependencies already installed, no new libraries needed
- Architecture: HIGH -- complete codebase read, patterns well-established
- Pitfalls: HIGH -- derived from direct code analysis of error handling gaps
- Test coverage: HIGH -- exact tool-by-test mapping verified by reading all files
- Skills format: MEDIUM -- based on existing repo examples + web search for official spec

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable -- MCP SDK and project architecture unlikely to change)
