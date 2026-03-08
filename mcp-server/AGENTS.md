# mcp-server/AGENTS.md

Apply root `AGENTS.md` first, then this file.

## Scope

This module is the MCP (Model Context Protocol) server exposing auction tools for AI agents. Streamable HTTP transport on `/mcp`, Express app, Node.js ESM.

## Commands

Run from `mcp-server/`:

```bash
npm run typecheck          # tsc --noEmit
npm run test               # vitest
npm run dev                # tsx src/index.ts (development)
npm run build              # tsc (compile to dist/)
npm run start              # node dist/index.js (production)
```

## Local Rules

- Transport is Streamable HTTP on `/mcp`, not stdio. Do not add stdio transport.
- Each MCP session gets its own `McpServer` instance via `createServer()`. Shared state (config, engine client, nonce tracker) lives at module scope.
- `EngineClient` defaults to `x402-buyer` mode for discovery/detail reads and only uses `X-ENGINE-ADMIN-KEY` in explicit developer/debug `admin-bypass` mode. Do not remove x402 buyer support or broaden admin bypass into the default path.
- Read tools that are not x402-gated (`get_auction_events`, `monitor_auction`, `check_settlement_status`, `get_bond_status`) must remain usable without signing configuration. When discovery/detail x402 is enabled, `discover_auctions` and `get_auction_details` require a wallet-capable setup or explicit debug bypass.
- On-chain and action-submission tools (`register_identity`, `deposit_bond`, `post_bond`, `join_auction`, `place_bid`, `reveal_bid`, `claim_refund`, `withdraw_funds`) must keep using the configured signer path. Most default to `AGENT_ID`, but explicit per-call `agentId` overrides remain supported where the tool schema allows them.
- `deposit_bond` is the primary bond path. `post_bond` is only the advanced/manual fallback after a transfer already happened outside the MCP flow.
- JOIN and BID are mandatory ZK proof paths. Normal operation loads `AGENT_STATE_FILE`; advanced callers may pass `proofPayload`. Do not reintroduce legacy proof toggles or no-proof fallbacks.
- `get_auction_events` passes `participantToken` query parameter for engine-side participant gating. Do not remove this gating mechanism.
- Read-side monitoring must stay privacy-preserving. Public/participant outputs expose masked identities or zkNullifier values, not raw wallets as a normal path.
- `ActionSigner` in `lib/signer.ts` implements EIP-712 signing with the same domain/types as the engine and agent-client. Keep nullifier derivation and typed data structures aligned across all three.
- Nonce tracking is per action type per agent, with JOIN scoped per room (`"JOIN:<agentId>:<auctionId>"`, `"BID:<agentId>"`). Nonces increment on successful submissions only.
- Tool input schemas use Zod. All tool responses return JSON-stringified content blocks.
- Do not hardcode engine URLs or contract addresses in tool files. Engine URL comes from config; the EIP-712 domain contract stays centralized in `lib/signer.ts`, and on-chain helper addresses stay in `lib/onchain.ts`.

## Key Files

- Entry point / Express app: `src/index.ts`
- Config + validation: `src/lib/config.ts`
- Engine HTTP client: `src/lib/engine.ts`
- EIP-712 signer: `src/lib/signer.ts`
- Identity / readiness helpers: `src/tools/register-identity.ts`, `src/tools/identity.ts`, `src/lib/identity-check.ts`
- On-chain helpers: `src/lib/onchain.ts`, `src/lib/agent-state.ts`, `src/lib/proof-generator.ts`
- Tools: `src/tools/{discover,details,events,monitor,settlement,join,bid,bond,exits,reveal}.ts`
- Prompts: `src/prompts.ts`

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ENGINE_URL` | No (default: `http://localhost:8787`) | Auction engine base URL |
| `MCP_WALLET_BACKEND` | No | Backend selector: `auto`, `agentkit`, or `raw-key` |
| `MCP_ENGINE_READ_MODE` | No | `x402-buyer` by default; set `admin-bypass` only for developer/debug use |
| `CDP_API_KEY_ID` | Supported AgentKit/CDP path | CDP API key ID |
| `CDP_API_KEY_SECRET` | Supported AgentKit/CDP path | CDP API key secret |
| `CDP_WALLET_SECRET` | Supported AgentKit/CDP path | CDP Server Wallet secret |
| `CDP_WALLET_ADDRESS` | Supported AgentKit/CDP path | Persistent Base Sepolia owner wallet address |
| `CDP_NETWORK_ID` | Supported AgentKit/CDP path | Must stay `base-sepolia` |
| `AGENT_PRIVATE_KEY` | Signing + on-chain tools | 0x-prefixed 64-char hex private key |
| `AGENT_ID` | Most write tools | Numeric ERC-8004 agent ID |
| `AGENT_STATE_FILE` | JOIN / BID normal path | Local `agent-N.json` file for automatic proof generation |
| `AGENT_STATE_DIR` | No | Default output directory for `register_identity` state files |
| `BASE_SEPOLIA_RPC` | On-chain tools and x402 buyer mode | Base Sepolia RPC for identity, escrow, registry reads/writes, and public x402 payments |
| `BOND_FUNDING_PRIVATE_KEY` | No | Optional alternate funding signer for `deposit_bond` |
| `MCP_PORT` | No (default: `3100`) | Server listen port |
| `ENGINE_ADMIN_KEY` | Debug only | Bypasses x402 on engine requests when `MCP_ENGINE_READ_MODE=admin-bypass` |

## Pointers

- Canonical internal lifecycle overview: `README.md`
- Engine API contract: `engine/README.md` (endpoint table)
- EIP-712 domain/types alignment: `engine/src/lib/crypto.ts`, `agent-client/src/auction.ts`
- Current MCP lifecycle and troubleshooting prompts: `src/prompts.ts`
- Default local env file behavior: `.env.agentkit.local` auto-loads on `npm run dev`
- Root architecture: `docs/full_contract_arch(amended).md`
