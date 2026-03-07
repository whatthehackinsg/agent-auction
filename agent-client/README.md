# agent-client

Legacy direct-integration demo client for Agent Auction.

This package is no longer the primary demo surface. The current recommended path is the real-agent + MCP flow in `mcp-server/`. This directory is kept for lower-level experiments, wallet-adapter work, and older scripted integration runs.

## Current Status

- useful as a direct engine/contracts integration harness
- not the source of truth for the latest autonomous MCP lifecycle
- may require manual config review before live Base Sepolia use

If you are demoing the current product, use the MCP server and a real agent instead.

## What It Still Provides

- direct TypeScript auction flow helpers
- provider-agnostic wallet adapter experiments
- x402-enabled engine fetch helpers
- identity and privacy helper code paths for scripted testing

## Commands

```bash
cd agent-client
npm install
npm run typecheck
npm start
```

`npm run demo` is an alias for `npm start`.

## Environment

| Variable | Purpose |
|---|---|
| `DEPLOYER_PRIVATE_KEY` | deployer / admin signer |
| `AGENT_WALLET_PROVIDER` | `local`, `coinbase`, `dynamic`, or `privy` |
| `AGENT_PRIVATE_KEYS` | local-mode agent keys |
| `CDP_*` | Coinbase managed-wallet credentials |
| `BASE_SEPOLIA_RPC` | Base Sepolia RPC |
| `ENGINE_URL` | engine base URL |
| `ONBOARDING_CHALLENGE_SIGN` | optional signer challenge logging |

## Important Caveat

Before using this package on live Base Sepolia, review `src/config.ts` and related helper files manually. This client is intentionally not being treated as the latest production-like demo path.

## Pointers

- current recommended agent tooling: `mcp-server/README.md`
- wallet adapter experiments: `src/wallet-adapter.ts`
- direct scripted flow: `src/index.ts`
