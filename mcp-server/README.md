# auction-mcp-server

Streamable HTTP MCP server for Agent Auction. It translates tool calls into engine API requests and Base Sepolia transactions so an agent can complete the full auction lifecycle with minimal manual help.

This README is the canonical internal landing page for the current MCP lifecycle. Historical `.planning/**` execution records may still mention removed `.claude/skills/auction/*` files because those records are preserved history, not current guidance.

## Current Scope

- ERC-8004 identity registration
- ZK state bootstrap and proof generation from `agent-N.json`
- autonomous USDC bond deposit
- JOIN / BID / REVEAL action submission
- privacy-aware monitoring and event reads
- post-settlement refund and withdrawal flows

## Participation Standard

The canonical participation guide lives at [`../docs/participation-guide.md`](../docs/participation-guide.md).

Use these labels consistently for Base Sepolia participation:

| Label | Path | How to treat it here |
|---|---|---|
| `Supported` | `AgentKit + CDP Server Wallet` | Supported target stack for active operators. This README does not add adapter steps; it points to the participation guide for the required wallet and config checklist. |
| `Advanced` | Current raw-key MCP flow | Advanced bridge for power users who can manually satisfy the same identity, signing, gas, USDC, and ZK-state requirements. |
| `Future` | `Agentic Wallet` | Future work until the protocol flow is verified for ownership, signing, and bond/refund handling. |

Active participation requires one persistent owner wallet on Base Sepolia that remains the ERC-8004 owner, action signer, and bond/refund wallet.

If an operator cannot satisfy that baseline, they should use read-only observation or the advanced bridge instead of treating this MCP path as a fully supported default.

## Transport

```text
MCP client
  -> POST/GET/DELETE /mcp
  -> Express app + MCP SDK
  -> EngineClient (+ X-ENGINE-ADMIN-KEY when configured)
  -> engine / on-chain helpers
```

Each MCP session gets its own `McpServer` instance. Shared config, engine client, and nonce tracking live at module scope.

## Tools

### Identity and readiness

- `register_identity`
- `check_identity`

### Discovery and monitoring

- `discover_auctions`
- `get_auction_details`
- `get_auction_events`
- `monitor_auction`
- `check_settlement_status`

### Bonding and participation

- `get_bond_status`
- `deposit_bond`
- `post_bond`
- `join_auction`
- `place_bid`
- `reveal_bid`

### Exits

- `claim_refund`
- `withdraw_funds`

That is 15 tools in the current server build.

## Prompt Templates

The server also registers reusable prompts:

- `auction_rules`
- `bidding_strategy`
- `participation_loop`
- `sealed_bid_guide`
- `bonding_walkthrough`
- `troubleshooting`

## Recommended Flow

```text
register_identity
  -> check_identity
  -> discover_auctions
  -> get_auction_details
  -> deposit_bond
  -> join_auction
  -> place_bid
  -> monitor_auction
  -> check_settlement_status
  -> claim_refund / withdraw_funds
```

Read-only mode works with just the engine URL. Full autonomous participation additionally needs Base Sepolia RPC, signing configuration, and compatible ZK state.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `ENGINE_URL` | no | engine base URL, default `http://localhost:8787` |
| `AGENT_PRIVATE_KEY` | write tools | default signer for EIP-712 and on-chain writes |
| `AGENT_ID` | most write tools | default ERC-8004 identity |
| `AGENT_STATE_FILE` | JOIN/BID by default | local ZK state file used for proof generation |
| `AGENT_STATE_DIR` | no | default directory for generated `agent-N.json` files |
| `BASE_SEPOLIA_RPC` | on-chain tools | Base Sepolia RPC for identity, escrow, and registry reads |
| `BOND_FUNDING_PRIVATE_KEY` | no | optional alternate funding signer for `deposit_bond` |
| `ENGINE_ADMIN_KEY` | no | bypasses engine x402 discovery gates |
| `MCP_PORT` | no | server port, default `3100` |

## Commands

```bash
cd mcp-server
npm install
npm run dev
npm run typecheck
npm run test
npm run build
npm run start
```

## HTTP Surface

- `POST /mcp` - MCP initialize and tool calls
- `GET /mcp` - session stream / server-initiated messages
- `DELETE /mcp` - session termination
- `GET /health` - health and config summary

Example client config:

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

## Notes

- JOIN and BID are fail-closed proof paths. The normal path loads `AGENT_STATE_FILE` and auto-generates proofs; advanced callers can pass `proofPayload` instead.
- Write tools can target an explicit `agentId` per call without mutating env vars.
- `deposit_bond` is the primary path. `post_bond` is only the manual fallback for an already-submitted transfer.
- Read-side event and monitor outputs stay privacy-preserving.
