# agent-client/AGENTS.md

Apply root `AGENTS.md` first, then this file.

## Scope

This directory is the TypeScript demo / direct-integration client for end-to-end flows. It is not the primary supported participation path.

## Commands

Run from `agent-client/`:

```bash
npm run typecheck
npm run start
npm run demo
```

## Local Rules

- Keep this package as a demo/integration client, not a production SDK or the canonical AgentKit/CDP path.
- Keep addresses/ABIs synchronized with `deployments/base-sepolia.json`.
- If crypto package APIs change, update this package and run typecheck before merge.
- Prefer explicit error output for on-chain step failures to aid debugging.

## Cross-Package Dependency

- This package depends on the local root package via `"auction-design": "file:.."`.
- If shared types or build artifacts change upstream, re-run installs and typecheck here.

## Pointers

- Config and clients: `agent-client/src/config.ts`
- Auction flow helpers: `agent-client/src/auction.ts`
- Wallet adapter: `agent-client/src/wallet-adapter.ts`
- Identity helpers: `agent-client/src/identity.ts`
- Privacy/ZK helpers: `agent-client/src/privacy.ts`
- Legacy x402/payment helpers and utilities: `agent-client/src/utils.ts`
