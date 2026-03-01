# mcp-server/AGENTS.md

Apply root `AGENTS.md` first, then this file.

## Scope

This module is the MCP (Model Context Protocol) server exposing auction tools for AI agents. Streamable HTTP transport on `/mcp`, Express app, Node.js ESM.

## Commands

Run from `mcp-server/`:

```bash
npm run typecheck          # tsc --noEmit
npm run dev                # tsx src/index.ts (development)
npm run build              # tsc (compile to dist/)
npm run start              # node dist/index.js (production)
```

No test suite yet.

## Local Rules

- Transport is Streamable HTTP on `/mcp`, not stdio. Do not add stdio transport.
- Each MCP session gets its own `McpServer` instance via `createServer()`. Shared state (config, engine client, nonce tracker) lives at module scope.
- `EngineClient` injects `X-ENGINE-ADMIN-KEY` header on every request to bypass x402 payment gates. Do not remove this or add x402 payment logic to the MCP server.
- Write tools (`join_auction`, `place_bid`, `post_bond`) require `AGENT_PRIVATE_KEY` + `AGENT_ID`. Use `requireSignerConfig()` to enforce this at call time.
- Read tools (`discover_auctions`, `get_auction_details`, `get_auction_events`, `get_bond_status`) must remain usable without signing configuration.
- `get_auction_events` passes `participantToken` query parameter for engine-side participant gating. Do not remove this gating mechanism.
- `ActionSigner` in `lib/signer.ts` implements EIP-712 signing with the same domain/types as the engine and agent-client. Keep nullifier derivation and typed data structures aligned across all three.
- Nonce tracking is per action type per agent (`"JOIN:<agentId>"`, `"BID:<agentId>"`). Nonces increment on successful submissions only.
- Tool input schemas use Zod. All tool responses return JSON-stringified content blocks.
- Do not hardcode engine URLs or contract addresses in tool files. Engine URL comes from config; the only hardcoded address is `AUCTION_REGISTRY` in `signer.ts` (EIP-712 domain).

## Key Files

- Entry point / Express app: `src/index.ts`
- Config + validation: `src/lib/config.ts`
- Engine HTTP client: `src/lib/engine.ts`
- EIP-712 signer: `src/lib/signer.ts`
- Tools: `src/tools/{discover,details,events,join,bid,bond}.ts`
- Prompts: `src/prompts.ts`

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ENGINE_URL` | No (default: `http://localhost:8787`) | Auction engine base URL |
| `AGENT_PRIVATE_KEY` | For write tools | 0x-prefixed 64-char hex private key |
| `AGENT_ID` | For write tools | Numeric ERC-8004 agent ID |
| `MCP_PORT` | No (default: `3100`) | Server listen port |
| `ENGINE_ADMIN_KEY` | No | Bypasses x402 on engine requests |

## Pointers

- Engine API contract: `engine/README.md` (endpoint table)
- EIP-712 domain/types alignment: `engine/src/lib/crypto.ts`, `agent-client/src/auction.ts`
- AuctionEscrow address for `post_bond`: `0x20944f46AB83F7eA40923D7543AF742Da829743c`
- Root architecture: `docs/full_contract_arch(amended).md`
