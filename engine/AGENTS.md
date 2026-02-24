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
