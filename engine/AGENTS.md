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
