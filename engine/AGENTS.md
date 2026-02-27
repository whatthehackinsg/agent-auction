# engine/AGENTS.md

Apply root `AGENTS.md` first, then this file.

## Scope

This module is the Cloudflare Workers auction engine (Hono + Durable Objects + D1).

## Commands

Run from `engine/`:

```bash
npm run typecheck
npm run test
npm run dev
npm run deploy
```

## Local Rules

- Keep room event sequencing monotonic and gap-free (`seq` must never regress or skip).
- Preserve fail-closed behavior when security checks are enabled.
- Treat `ENGINE_ALLOW_INSECURE_STUBS` as local-development-only.
- Keep on-chain types in `src/types/contracts.ts` aligned with Solidity interfaces.
- Do not change D1 schema assumptions without updating tests and migrations together.

## Test Topology

- Tests use Vitest with Miniflare and Worker bindings.
- Shared setup utilities live in `engine/test/setup.ts`.
- Durable Object flow is exercised by `engine/test/auction-room.test.ts` and related integration tests.

## x402 Micropayments

The engine supports real x402 (HTTP 402) micropayments via `@x402/hono` for rate-limiting manifest and event endpoints.

**Environment variables:**
- `X402_MODE` — `'off'` (default, endpoints free) or `'on'` (payment required)
- `X402_RECEIVER_ADDRESS` — wallet address to receive payments (required when `X402_MODE=on`)
- `X402_FACILITATOR_URL` — facilitator service URL (default: `https://www.x402.org/facilitator`)

Set `X402_RECEIVER_ADDRESS` and `X402_FACILITATOR_URL` via `wrangler secret` or `.dev.vars`. `X402_MODE` defaults to `off` in `wrangler.toml`.

Gated endpoints when `X402_MODE=on`:
- `GET /auctions/:id/manifest` — $0.001 per request
- `GET /auctions/:id/events` — $0.0001 per request

Uses real testnet USDC on Base Sepolia (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`), NOT MockUSDC.

## Pointers

- Worker entry/router: `engine/src/index.ts`
- Room core: `engine/src/auction-room.ts`
- Action validation: `engine/src/handlers/actions.ts`
- Chain helpers: `engine/src/lib/`

## Crypto Delegation

As of Feb 2026, `src/lib/crypto.ts` and `src/lib/replay-bundle.ts` delegate to `@agent-auction/crypto` (local dependency at `packages/crypto`).

- **Real implementations**: `computeEventHash` (Poseidon), `computePayloadHash`, `deriveNullifier` — all async.
- **Stubs kept** (CF Workers incompatible): `verifyMembershipProof` (needs `node:fs` for snarkjs vkey loading), `verifyEIP712Signature` (API mismatch — engine passes `(hash, sig, signer)`, package expects structured EIP-712 typed data).
- Stubs are fail-closed by default; set `ENGINE_ALLOW_INSECURE_STUBS=true` for local dev only.
- Build `packages/crypto` (`npm run build`) before running engine typecheck or tests.

## EIP-4337 Bundler (Pimlico)

UserOp submission for bond deposits uses Pimlico bundler on Base Sepolia.

- **Provider**: Pimlico (`api.pimlico.io/v2/84532/rpc`)
- **EntryPoint**: v0.7 (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`)
- **Paymaster**: AgentPaymaster (`0xd71a...e32d`) sponsors gas for registered agents
- **Confirmed**: Full UserOp flow tested — AgentAccount lazy deployment + USDC bond deposit in one tx ([basescan](https://sepolia.basescan.org/tx/0x43c2d11fec8845a05f0bb6347bd056f4c41b43f52ad3514c7fa2d7cc1faeaa1c))

Demo scripts:
```bash
# Bundler connectivity test (SimpleAccount)
set -a && source .env && set +a && npm run permissionless-demo

# Full AgentAccount + AgentPaymaster UserOp (bond deposit)
set -a && source .env && set +a && npm run agent-userop-demo
```

Prerequisites for `agent-userop-demo` (admin ops via deployer EOA):
1. Agent registered in IdentityRegistry
2. `AgentPaymaster.setEscrow(escrowV2Address)`
3. `AgentPaymaster.registerAgent(agentAccountAddress, agentId)`
4. USDC minted to AgentAccount
