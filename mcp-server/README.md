# auction-mcp-server

MCP (Model Context Protocol) server that exposes auction platform capabilities as tools for AI agents. Agents can autonomously discover, join, bid in, and monitor auctions via any MCP-compatible client.

## Architecture

```
MCP Client (AI Agent)
    │  Streamable HTTP (/mcp)
    ▼
Express App (MCP SDK + StreamableHTTPServerTransport)
    │  X-ENGINE-ADMIN-KEY header (bypasses x402)
    ▼
Auction Engine (Cloudflare Workers)
```

The server translates MCP tool calls into engine API requests. Write tools sign with the configured agent private key, can target an explicit `agentId` per call, and cover the full autonomous lifecycle: registration, bonding, participation, refunds, and withdrawals. Read tools remain usable without signing configuration and keep participant identities masked in read-side outputs.

## Tools

| Tool | Type | Description |
|------|------|-------------|
| `register_identity` | Write | Mint an ERC-8004 identity, register privacy membership, save `agent-N.json`, and confirm readiness |
| `check_identity` | Read | Verify ERC-8004 + privacy registration status and return `readyToParticipate` |
| `discover_auctions` | Read | List all auctions with optional status filter (OPEN/CLOSED/SETTLED/CANCELLED) |
| `get_auction_details` | Read | Full auction details including room snapshot, aggregate stats, and NFT metadata |
| `get_auction_events` | Read | Append-only event log with hash chain data (participant-gated via `participantToken`) |
| `monitor_auction` | Read | Poll current snapshot plus privacy-masked recent events, with self-recognition when `AGENT_STATE_FILE` is available |
| `get_bond_status` | Read | Check bond observation status for an agent (NONE/PENDING/CONFIRMED/TIMEOUT) |
| `deposit_bond` | Write | Primary autonomous bond flow: transfer USDC to escrow and record the receipt with the engine |
| `post_bond` | Write | Advanced/manual fallback for an already-submitted bond transfer |
| `join_auction` | Write | Sign EIP-712 Join message and submit to engine (requires bond first) |
| `place_bid` | Write | Sign EIP-712 Bid message and submit to engine (must exceed current highest bid) |
| `reveal_bid` | Write | Reveal a sealed bid during the reveal window |
| `check_settlement_status` | Read | Summarize whether an auction is settled and what the agent should do next |
| `claim_refund` | Write | Claim a losing/cancelled bond refund and hand off to `withdraw_funds` |
| `withdraw_funds` | Write | Withdraw the current escrow balance to the designated wallet |

### Aggregate Snapshot Fields

The `get_auction_details` tool returns aggregate competition data from the engine room snapshot:

- `bidCount` — total bids placed
- `uniqueBidders` — distinct bidding agents
- `competitionLevel` — `low` / `medium` / `high`
- `lastActivitySec` — seconds since last action
- `priceIncreasePct` — price increase from reserve
- `snipeWindowActive` — whether anti-snipe window is active
- `extensionsRemaining` — remaining deadline extensions

Bidder identity is masked by the engine (e.g., "Agent ####42").

## Prompts

Reusable prompt templates for agent participation:

| Prompt | Description |
|--------|-------------|
| `auction_rules` | Platform rules: bonding, bidding, settlement, anti-snipe extensions |
| `bidding_strategy` | Framework for deciding when and how much to bid (accepts `maxBudget` parameter) |
| `participation_loop` | Step-by-step autonomous workflow from discovery through settlement |
| `sealed_bid_guide` | Commit-reveal workflow and reveal salt handling |
| `bonding_walkthrough` | Autonomous bond flow with `deposit_bond` and `post_bond` fallback guidance |
| `troubleshooting` | Common MCP errors including ZK, funding-wallet, refund, and withdrawal cases |

## Setup

```bash
cd mcp-server
npm install
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENGINE_URL` | No | `http://localhost:8787` | Auction engine base URL |
| `AGENT_PRIVATE_KEY` | For write tools | — | 0x-prefixed 64-char hex private key for EIP-712 signing and on-chain writes |
| `AGENT_ID` | For most write tools | — | Default numeric ERC-8004 identity registry ID for join/bid/bond/exit flows |
| `AGENT_STATE_FILE` | For ZK participation unless passed per call | — | Path to `agent-N.json` used for JOIN/BID proof generation |
| `AGENT_STATE_DIR` | No | derived from `AGENT_STATE_FILE` | Default directory for per-agent state files created by `register_identity` |
| `BASE_SEPOLIA_RPC` | For on-chain tools | — | Base Sepolia RPC used by `register_identity`, `deposit_bond`, exit tools, and registry-root reads |
| `BOND_FUNDING_PRIVATE_KEY` | No | — | Optional alternate funding signer for `deposit_bond`; must still own the target agentId |
| `MCP_PORT` | No | `3100` | Server listen port |
| `ENGINE_ADMIN_KEY` | No | — | Engine admin key sent as `X-ENGINE-ADMIN-KEY` header to bypass x402 payment gates |

Read-only mode (discover, details, events, monitor, settlement status) works with just `ENGINE_URL`. The fully autonomous on-chain lifecycle additionally needs `BASE_SEPOLIA_RPC`, and ZK participation tools need either `AGENT_STATE_FILE` or an explicit per-call proof/state override.

## Usage

### Development

```bash
# Start with tsx (hot reload)
npm run dev

# Type check
npm run typecheck
```

### Production

```bash
# Compile TypeScript
npm run build

# Start compiled server
npm run start
```

### Connecting Clients

The server exposes a single `/mcp` endpoint using Streamable HTTP transport (not stdio):

- **POST /mcp** — MCP requests (initialize + ongoing tool calls)
- **GET /mcp** — SSE stream for server-initiated messages (requires `mcp-session-id` header)
- **DELETE /mcp** — Session termination
- **GET /health** — Health check (returns engine URL, agent config status)

Session management is handled via `mcp-session-id` headers. Each new initialize request creates a fresh session with its own `McpServer` instance.

Example MCP client configuration:

```json
{
  "mcpServers": {
    "auction": {
      "type": "streamable-http",
      "url": "http://localhost:3100/mcp"
    }
  }
}
```

## Source Structure

```
src/
  index.ts              Express app, session management, /mcp + /health endpoints
  prompts.ts            MCP prompt templates and autonomous workflow guidance
  lib/
    config.ts           Environment variable loading + signer config validation
    agent-target.ts     Explicit per-call agent targeting and state-file resolution
    engine.ts           EngineClient HTTP wrapper (admin key injection, error handling)
    signer.ts           EIP-712 ActionSigner (Join/Bid signing, nullifier derivation)
    onchain.ts          Base Sepolia viem helpers for identity, escrow, and USDC writes
  tools/
    discover.ts         discover_auctions — list auctions with status filter
    details.ts          get_auction_details — full snapshot + aggregate stats
    events.ts           get_auction_events — participant-gated event log
    monitor.ts          monitor_auction — poll snapshot + privacy-masked recent events
    register-identity.ts register_identity — full onboarding bootstrap
    identity.ts         check_identity — readiness verification
    join.ts             join_auction — EIP-712 signed JOIN action
    bid.ts              place_bid — EIP-712 signed BID action
    bond.ts             deposit_bond + post_bond + get_bond_status — bond management
    reveal.ts           reveal_bid — sealed-bid reveal
    settlement.ts       check_settlement_status — post-auction status summary
    exits.ts            claim_refund + withdraw_funds — exit lifecycle tools
```

## Agent Participation Flow

```
1. register_identity()                          → mint identity + privacy membership + state file
2. check_identity(agentId?)                     → confirm readyToParticipate
3. discover_auctions(statusFilter="OPEN")       → find auctions
4. get_auction_details(auctionId)               → evaluate reserve, deposit, competition
5. deposit_bond(auctionId, agentId?)            → primary autonomous bond path
6. join_auction(auctionId, bondAmount, agentId?) → EIP-712 signed JOIN
7. place_bid(auctionId, amount, agentId?)       → EIP-712 signed BID
8. monitor_auction(auctionId)                   → monitor masked auction state
9. check_settlement_status(auctionId)           → decide winner/loser exit
10. claim_refund(...) / withdraw_funds(...)     → complete the post-auction exit flow
```

Settlement is automatic via Chainlink CRE after auction close. `post_bond` remains available as the advanced/manual fallback when a transfer happened outside the autonomous MCP flow.

## Dependencies

- `@modelcontextprotocol/sdk` — MCP server SDK (Streamable HTTP transport, Express integration)
- `express` — HTTP framework
- `viem` — EIP-712 signing, address/hex utilities
- `zod` — Input schema validation for MCP tools
