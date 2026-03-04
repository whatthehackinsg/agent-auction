# Phase 2: Finish MCP Server - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete the MCP server for production-ready agent use: audit tool coverage against the full agent participation flow, add missing tools/validation, add test coverage, and write Claude Agent Skills (SKILL.md format per platform.claude.com/docs/en/agents-and-tools/agent-skills/) that teach AI agents how to participate in auctions.

</domain>

<decisions>
## Implementation Decisions

### Agent Skills Format
- Write skills as Claude Agent Skills following the `.claude/skills/` SKILL.md format (frontmatter with name + description, markdown body with When to Use, Workflow, Checklist sections)
- Skills should be placed in `.claude/skills/auction/` directory
- Key skills needed: auction participation flow (discover → join → bid → monitor → settle), bond management, sealed-bid strategy
- Skills are consumed by AI agents at runtime — they teach agents HOW to use the MCP tools effectively
- Follow the same pattern as existing `.claude/skills/gitnexus/` and `.claude/skills/foundry-dev/` skills in this repo

### Tool Coverage
- Current 7 tools cover the core flow: discover, details, join, bid, bond (get+post), events, reveal
- Missing tools to evaluate: create_auction (admin), check_settlement_status, cancel/withdraw, agent_register (identity)
- Focus on what an agent PARTICIPANT needs — auction creation is admin-side, can be deferred
- ZK proof generation is already handled server-side via proof-generator.ts (agents don't need @agent-auction/crypto)

### Test Strategy
- Add tests for all tools that don't have coverage (discover, details, bond, events, reveal — currently only bid and join have tests)
- Mock engine HTTP responses (don't require running engine)
- Test both success and error paths
- Use existing test pattern from bid.test.ts and join.test.ts

### Validation & Error Messages
- Standardize error responses across all tools with structured format: `{ error: string, code: string, suggestion: string }`
- Agents need actionable error messages (e.g., "Bond required before joining — call get_bond_status first" not just "403 Forbidden")
- Zod validation already in place — ensure all tools have complete schemas with `.describe()` on every field

### MCP Prompts
- Existing `auction_rules` prompt is good — keep it
- Add prompts for: sealed-bid strategy guide, bonding walkthrough, troubleshooting common errors
- Prompts complement skills: skills are for Claude Code agents, prompts are for MCP-connected agents

### Claude's Discretion
- Exact error code taxonomy
- Test fixture data structure
- Internal code organization within tools
- Whether to add a `health_check` or `server_info` tool

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mcp-server/src/lib/engine.ts`: EngineClient with typed HTTP methods — all tools use this
- `mcp-server/src/lib/proof-generator.ts`: Server-side ZK proof generation (membership + bid range) — already wired into join/bid tools
- `mcp-server/src/lib/signer.ts`: EIP-712 signing for agent actions
- `mcp-server/src/lib/config.ts`: Environment config loader
- `mcp-server/test/fixtures/`: Existing test fixtures directory

### Established Patterns
- Tools register via `register*Tool(server, engine, config?, nonceTracker?)` pattern
- All tools use Zod schemas for input validation
- EngineClient handles HTTP + error wrapping
- Per-action nonce tracking via `nonceTracker` Map
- Proof generation gated by `AGENT_STATE_FILE` env var

### Integration Points
- `mcp-server/src/index.ts`: Tool registration in `createServer()` — new tools register here
- `mcp-server/src/prompts.ts`: Prompt registration — new prompts register here
- `.claude/skills/`: Skill files discovered automatically by Claude Code

</code_context>

<specifics>
## Specific Ideas

- Agent Skills should follow the Claude platform standard at platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- Skills should be practical enough that an AI agent can read the skill and successfully participate in an auction end-to-end
- The MCP README should include a "quick start" section showing how to connect an agent to the MCP server

</specifics>

<deferred>
## Deferred Ideas

- WebSocket streaming tool (real-time event subscription) — would need SSE or streaming MCP transport
- Auction creation tool — admin-side, not participant flow
- Multi-agent coordination skills — future phase
- Agent reputation/history tracking — future feature

</deferred>

---

*Phase: 02-finish-mcp-server*
*Context gathered: 2026-03-04*
