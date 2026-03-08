# auction-mcp-server

Streamable HTTP MCP server for Agent Auction. It translates tool calls into engine API requests and Base Sepolia transactions so an agent can complete the full auction lifecycle with minimal manual help.

This README is the canonical internal landing page for the current MCP lifecycle. Historical `.planning/**` execution records may still mention removed `.claude/skills/auction/*` files because those records are preserved history, not current guidance.

## Current Scope

- ERC-8004 identity registration
- x402-paid discovery and auction-detail reads with permanent engine-side entitlements
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

## Supported Write Backends

`MCP_WALLET_BACKEND=auto` is the default and prefers the supported AgentKit/CDP path whenever the full CDP config is present.

| Backend | Status | What it requires | Notes |
|---|---|---|---|
| `agentkit` | Supported | `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`, `CDP_WALLET_ADDRESS`, `BASE_SEPOLIA_RPC` | Primary write path for active participation |
| `raw-key` | Advanced bridge | `AGENT_PRIVATE_KEY`, `BASE_SEPOLIA_RPC` | Kept for power users and debugging |
| `auto` | Default selector | either complete AgentKit/CDP config or raw-key config | refuses partial CDP config instead of silently downgrading |
| none | Read-only only | `ENGINE_URL` | discovery/monitoring/check tools still work |

The MCP server never silently falls back from an incomplete AgentKit/CDP setup to the raw-key bridge. If CDP envs are partially set, write tools fail closed and tell the operator to either finish the supported setup or explicitly switch to `MCP_WALLET_BACKEND=raw-key`.

## x402 Read Modes

Public engine discovery/detail routes are now expected to be x402-gated. The MCP server supports two read modes:

| Mode | Default | Behavior |
|---|---|---|
| `x402-buyer` | yes | The MCP server signs a short-lived access proof with the same owner wallet, pays the x402 challenge on first access, and then relies on engine-side permanent entitlements for repeat reads. |
| `admin-bypass` | no | Developer/debug mode only. The MCP server sends `X-ENGINE-ADMIN-KEY` and skips x402 payment entirely. |

Permanent entitlement semantics:

- `discover_auctions` pays once per wallet for the shared `discovery` scope
- `get_auction_details` pays once per wallet per room for `auction:<auctionId>`
- the engine is the source of truth for those entitlements
- the MCP server does not maintain an authoritative local "paid rooms" cache

This read-side x402 flow is intentionally isolated from identity, proofs, nullifiers, and bond logic. It does not change the current ERC-8004 or ZK participation contract.

Current status:

- The supported `agentkit` path is live-proven on Base Sepolia for the core lifecycle:
  - `register_identity -> check_identity -> deposit_bond -> join_auction -> place_bid`
- Explicit `attachExisting`, `claim_refund`, and `withdraw_funds` remain regression-covered in the MCP test suite.
- The MCP JOIN nonce tracker is room-scoped, so the same `agentId` can join multiple auction rooms without reusing the previous room's JOIN nonce.

## Entry Paths

Two write-side identity entry paths are supported:

- `register_identity` without `attachExisting`: platform-managed onboarding. The MCP server mints ERC-8004, registers privacy membership, saves `agent-N.json`, and checks readiness.
- `register_identity` with `attachExisting: true`: deliberate adoption of an existing ERC-8004 identity plus a compatible local `agent-N.json`.

Attach mode is explicit on purpose. The MCP server does not guess whether an existing identity should be adopted.

## Fail-Closed ZK State Rules

- `check_identity` confirms ERC-8004 ownership and privacy visibility, and when a local state path is configured it also reports whether compatible ZK state is present locally.
- `join_auction` and `place_bid` still fail closed if the local `agent-N.json` is missing, mismatched, or incompatible with the on-chain privacy registration.
- The supported AgentKit/CDP path does not weaken the current proof/nullifier contract. It only swaps the wallet backend used for typed-data signing and on-chain writes.

## Transport

```text
MCP client
  -> POST/GET/DELETE /mcp
  -> Express app + MCP SDK
  -> EngineClient (x402 buyer by default, `X-ENGINE-ADMIN-KEY` only in debug mode)
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

Non-paywalled monitoring/check routes can still work with just the engine URL. Full autonomous participation additionally needs Base Sepolia RPC, signing configuration, and compatible ZK state.

When the deployed engine has x402 discovery/detail gating enabled, `discover_auctions` and `get_auction_details` need a wallet-capable MCP setup in `x402-buyer` mode so the server can pay the initial challenge and then reuse the engine-side entitlement.

Supported attach flow:

```text
register_identity({ attachExisting: true, agentId, stateFilePath })
  -> check_identity
  -> deposit_bond
  -> join_auction
  -> place_bid
```

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `ENGINE_URL` | no | engine base URL, default `http://localhost:8787` |
| `MCP_WALLET_BACKEND` | no | backend selector: `auto`, `agentkit`, or `raw-key` |
| `MCP_ENGINE_READ_MODE` | no | `x402-buyer` by default; set `admin-bypass` only for developer/debug use |
| `CDP_API_KEY_ID` | supported writes | CDP API key ID for the supported AgentKit/CDP path |
| `CDP_API_KEY_SECRET` | supported writes | CDP API key secret for the supported AgentKit/CDP path |
| `CDP_WALLET_SECRET` | supported writes | Server Wallet secret used by the supported path |
| `CDP_WALLET_ADDRESS` | supported writes | persistent Base Sepolia owner wallet address to reuse |
| `CDP_NETWORK_ID` | supported writes | must stay `base-sepolia` |
| `AGENT_PRIVATE_KEY` | advanced write bridge | raw-key fallback for EIP-712 and on-chain writes |
| `AGENT_ID` | most write tools | default ERC-8004 identity for attach/join/bid/bond flows |
| `AGENT_STATE_FILE` | JOIN/BID by default | local ZK state file used for proof generation or explicit attach |
| `AGENT_STATE_DIR` | no | default directory for generated `agent-N.json` files |
| `BASE_SEPOLIA_RPC` | on-chain tools and x402 buyer mode | Base Sepolia RPC for identity, escrow, registry reads, and public x402 payments |
| `BOND_FUNDING_PRIVATE_KEY` | raw-key only | optional alternate funding signer for `deposit_bond`; must still own the target agentId |
| `ENGINE_ADMIN_KEY` | debug only | bypasses engine x402 discovery/detail gates when `MCP_ENGINE_READ_MODE=admin-bypass` |
| `MCP_PORT` | no | server port, default `3100` |

The supported path expects the wallet to already exist. This MCP server attaches to the configured Server Wallet address; it does not create or manage CDP wallets for the operator.

When present, `npm run dev` auto-loads `.env.agentkit.local` by default. Override that filename with `MCP_ENV_FILE` if you need a different local env file.

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

- Public discovery/detail reads now default to wallet-paid x402 instead of admin bypass. Keep `admin-bypass` reserved for developer debugging.
- JOIN and BID are fail-closed proof paths. The normal path loads `AGENT_STATE_FILE` and auto-generates proofs; advanced callers can pass `proofPayload` instead.
- Write tools can target an explicit `agentId` per call without mutating env vars.
- `deposit_bond` is the primary path. `post_bond` is only the manual fallback for an already-submitted transfer.
- Read-side event and monitor outputs stay privacy-preserving.
- The same persistent owner wallet must remain the ERC-8004 owner, action signer, and bond/refund wallet on the supported path.
