# cre/AGENTS.md

Apply root `AGENTS.md` first, then this file.

## Scope

This directory contains the Chainlink CRE settlement workflow for auction finalization.

- Runtime: CRE SDK + Bun
- Unit tests: 9 (`bun test`)

## Commands

Run from `cre/`:

```bash
bun test                                              # 9 unit tests

# Local simulation (uses config.json — useFinalized=false)
cre workflow simulate workflows/settlement \
  --target base-sepolia --broadcast \
  --evm-tx-hash 0x... --evm-event-index 0 \
  --trigger-index 0 --non-interactive

# Auto-detect AuctionEnded events and trigger settlement
bun run scripts/settlement-watcher.ts

# Deploy to DON (uses config.production.json — useFinalized=true)
cre workflow deploy workflows/settlement \
  --target base-sepolia \
  --config workflows/settlement/config.production.json
cre workflow activate workflows/settlement --target base-sepolia
```

## Configuration

Two configs in `workflows/settlement/`:

- **`config.json`** — simulation: `useFinalized=false` (reads at latest block, avoids L2 finality lag in simulator)
- **`config.production.json`** — deployed DON: `useFinalized=true` (reads at `LAST_FINALIZED_BLOCK_NUMBER` for DON consensus)

Other fields: `isTestnet`, `skipReplayVerification`, `replayBundleBaseUrl`, `gasLimit`. See `cre/README.md` for details.

## Local Rules

- Keep settlement packet encoding aligned with `AuctionEscrow._processReport()`.
- Block number policy is config-driven via `useFinalized`. Do not hardcode `LAST_FINALIZED_BLOCK_NUMBER`.
- Do not bypass CRE verification by adding direct escrow payout paths.
- `replayBundleBaseUrl` must point to the deployed engine. Phase C fetches `${baseUrl}/auctions/${auctionId}/replay`.

## Module Invariants

- Trigger source is `AuctionEnded` from registry with `CONFIDENCE_LEVEL_FINALIZED`.
- Workflow cross-checks winner identity and final price before report write (Phase A + B).
- Phase C fetches replay bundle from engine (configurable via `skipReplayVerification`).
- Final action is `writeReport` through KeystoneForwarder to escrow `onReport()`.

## Pointers

- Workflow docs: `cre/README.md`
- Workflow sources: `cre/workflows/settlement/`
- Settlement watcher: `cre/scripts/settlement-watcher.ts`
- Architecture source of truth: `docs/full_contract_arch(amended).md`
