# packages/crypto/AGENTS.md

Apply root `AGENTS.md` first, then this file.

## Scope

This package contains shared cryptographic primitives used by other modules.

- Poseidon/event-hash helpers
- EIP-712 typed-data helpers
- snarkjs verification/proof helpers

## Commands

Run from `packages/crypto/`:

```bash
npm run build
npm test
npm run test:watch
```

## Local Rules

- Keep public exports stable through `src/index.ts`.
- Keep type declarations in sync with generated `dist/*.d.ts` output.
- Preserve deterministic hashing/encoding behavior across Node versions.
- Document any changes that affect engine or circuits integration points.

## Cross-Package Notes

- Engine and client flows may rely on this package's hash/type semantics.
- If enums or typed-data shapes change, update dependent packages in the same workstream.

## Pointers

- Core hashing: `packages/crypto/src/poseidon-chain.ts`
- Typed data: `packages/crypto/src/eip712-typed-data.ts`
- Replay bundle helpers: `packages/crypto/src/replay-bundle.ts`
- ZK verification/proof helpers: `packages/crypto/src/snarkjs-verify.ts`, `packages/crypto/src/proof-generator.ts`
