# cre/AGENTS.md

Apply root `AGENTS.md` first, then this file.

## Scope

This directory contains the Chainlink CRE settlement workflow for auction finalization.

- Runtime: CRE SDK + Bun
- Unit tests: 9 (`bun test`)

## Commands

Run from `cre/`:

```bash
bun test
bun build ./workflows/settlement.ts --outdir ./dist
cre workflow simulate ./workflows/settlement --target local-simulation
cre workflow deploy settlement --target base-sepolia
cre workflow activate settlement --target base-sepolia
```

## Local Rules

- Keep settlement packet encoding aligned with `AuctionEscrow._processReport()`.
- Settlement-critical reads must use finalized block policy.
- Do not bypass CRE verification by adding direct escrow payout paths.
- Treat placeholder replay URLs as invalid for production configuration.

## Module Invariants

- Trigger source is `AuctionEnded` from registry.
- Workflow cross-checks winner identity and final price before report write.
- Final action is `writeReport` through KeystoneForwarder to escrow `onReport()`.

## Pointers

- Workflow docs: `cre/README.md`
- Workflow sources: `cre/workflows/settlement/`
- Architecture source of truth: `docs/full_contract_arch(amended).md`
