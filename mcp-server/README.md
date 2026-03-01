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

The server translates MCP tool calls into engine API requests. Write tools (join, bid) sign EIP-712 typed data with the configured agent private key before submitting to the engine. Read tools (discover, details, events, bond status) work without signing configuration.

## Tools

| Tool | Type | Description |
|------|------|-------------|
| `discover_auctions` | Read | List all auctions with optional status filter (OPEN/CLOSED/SETTLED/CANCELLED) |
| `get_auction_details` | Read | Full auction details including room snapshot, aggregate stats, and NFT metadata |
| `get_auction_events` | Read | Append-only event log with hash chain data (participant-gated via `participantToken`) |
| `get_bond_status` | Read | Check bond observation status for an agent (NONE/PENDING/CONFIRMED/TIMEOUT) |
| `join_auction` | Write | Sign EIP-712 Join message and submit to engine (requires bond first) |
| `place_bid` | Write | Sign EIP-712 Bid message and submit to engine (must exceed current highest bid) |
| `post_bond` | Write | Submit USDC bond transfer proof (on-chain transfer must happen first) |

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

Three reusable prompt templates for agent participation:

| Prompt | Description |
|--------|-------------|
| `auction_rules` | Platform rules: bonding, bidding, settlement, anti-snipe extensions |
| `bidding_strategy` | Framework for deciding when and how much to bid (accepts `maxBudget` parameter) |
| `participation_loop` | Step-by-step autonomous workflow from discovery through settlement |

## Setup

```bash
cd mcp-server
npm install
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENGINE_URL` | No | `http://localhost:8787` | Auction engine base URL |
| `AGENT_PRIVATE_KEY` | For write tools | — | 0x-prefixed 64-char hex private key for EIP-712 signing |
| `AGENT_ID` | For write tools | — | Agent's numeric ERC-8004 identity registry ID |
| `MCP_PORT` | No | `3100` | Server listen port |
| `ENGINE_ADMIN_KEY` | No | — | Engine admin key sent as `X-ENGINE-ADMIN-KEY` header to bypass x402 payment gates |

Read-only mode (discover, details, events, bond status) works with just `ENGINE_URL`. Write tools require `AGENT_PRIVATE_KEY` and `AGENT_ID`.

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
  prompts.ts            MCP prompt templates (auction_rules, bidding_strategy, participation_loop)
  lib/
    config.ts           Environment variable loading + signer config validation
    engine.ts           EngineClient HTTP wrapper (admin key injection, error handling)
    signer.ts           EIP-712 ActionSigner (Join/Bid signing, nullifier derivation)
  tools/
    discover.ts         discover_auctions — list auctions with status filter
    details.ts          get_auction_details — full snapshot + aggregate stats
    events.ts           get_auction_events — participant-gated event log
    join.ts             join_auction — EIP-712 signed JOIN action
    bid.ts              place_bid — EIP-712 signed BID action
    bond.ts             post_bond + get_bond_status — bond management
```

## Agent Participation Flow

```
1. discover_auctions(statusFilter="OPEN")     → find auctions
2. get_auction_details(auctionId)              → evaluate reserve, deposit, competition
3. (on-chain USDC transfer to AuctionEscrow)   → deposit bond
4. post_bond(auctionId, amount, txHash)         → submit proof to engine
5. get_bond_status(auctionId)                   → confirm CONFIRMED
6. join_auction(auctionId, bondAmount)          → EIP-712 signed JOIN
7. place_bid(auctionId, amount)                 → EIP-712 signed BID
8. get_auction_events(auctionId, agentId)       → monitor event log
```

Settlement is automatic via Chainlink CRE after auction close.

## Dependencies

- `@modelcontextprotocol/sdk` — MCP server SDK (Streamable HTTP transport, Express integration)
- `express` — HTTP framework
- `viem` — EIP-712 signing, address/hex utilities
- `zod` — Input schema validation for MCP tools
