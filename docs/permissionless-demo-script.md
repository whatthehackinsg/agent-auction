# Permissionless.js + viem UserOp Demo (Base Sepolia)

This section gives a runnable Node/TypeScript template that matches the `permissionless.js + viem` flow used in this repo.
It creates a Simple smart account on EntryPoint v0.7, submits a UserOperation through a Pimlico-compatible bundler, and falls back to alternate bundler/paymaster URLs if the primary endpoint is unreachable.

## Script in repo

- `engine/scripts/permissionless-userop-demo.ts`
- Uses `permissionless` + `viem` and assumes EntryPoint `0.7` explicitly.

## Install dependencies

```bash
cd engine
npm install permissionless viem
```

## Required env vars

- `BASE_SEPOLIA_RPC_URL` – Base Sepolia execution RPC (HTTP)
- `PRIVATE_KEY` – EOA runtime signing key for the smart account
- `PIMLICO_BUNDLER_URL` – primary bundler URL
- `BUNDLER_URL_FALLBACKS` – comma separated backup bundler URLs

## Optional env vars

- `PIMLICO_PAYMASTER_URL` – primary paymaster URL
- `PIMLICO_PAYMASTER_URL_FALLBACKS` – comma separated backup paymaster URLs
- `DESTINATION` – recipient for the demo ETH transfer
- `TX_VALUE_WEI` – raw wei string for tx value (for example `1000000`)
- `TX_VALUE_ETH` – human ETH string fallback when `TX_VALUE_WEI` is unset
- `REQUEST_TIMEOUT_MS` – transport timeout for HTTP endpoints

## Run

```bash
cd engine
npx tsx scripts/permissionless-userop-demo.ts
```

If you do not install `tsx`, run with your local TS runner of choice and pass the same file path.

## Notes on the fallback behavior

The script keeps an ordered list of bundler URLs and tries each in sequence:

1. Use primary bundler
2. On transport-style errors (`ECONNREFUSED`, `ENOTFOUND`, `fetch failed`, timeout-like messages), try next fallback
3. Stops immediately for non-transport/user-op validation errors

That gives you a practical demo pattern for uptime-safe submission during a hackathon while still surfacing on-chain execution failures quickly.
