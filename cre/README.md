# CRE Settlement Workflow

Chainlink CRE (Chainlink Runtime Environment) workflow that trustlessly settles auctions.

## Flow

```
AuctionEnded event (AuctionRegistry)
    │  confidence: FINALIZED
    ▼
Phase A: Verify auction state is CLOSED on-chain (finalized read)
    ▼
Phase B: Cross-check winner against AuctionRegistry.getWinner() — agentId, wallet, AND finalPrice
    ▼
Phase C: Fetch replay bundle from platform API, verify non-empty (guards placeholder URLs)
    ▼
Phase D: DON signs settlement report
    ▼
Phase E: writeReport → KeystoneForwarder → AuctionEscrow.onReport()
    ▼
Result: Winner bond released, auction marked SETTLED, losers can self-claim refunds
```

## Report Encoding

Must match `AuctionEscrow._processReport()`:

```
abi.encode(bytes32 auctionId, uint256 winnerAgentId, address winnerWallet, uint256 amount)
```

## Setup

```bash
npm install @chainlink/cre-sdk viem zod
```

## Configuration

Two config files in `workflows/settlement/`:

| File | Purpose | `useFinalized` | When to use |
|---|---|---|---|
| `config.json` | Local simulation | `false` | `cre workflow simulate` — avoids L2 finality lag in simulator |
| `config.production.json` | Deployed DON | `true` | `cre workflow deploy` — DON nodes need deterministic reads at finalized block |

Key config fields:

| Field | Description |
|---|---|
| `isTestnet` | `"true"` for testnet, `"false"` for mainnet (controls `getNetwork()`) |
| `useFinalized` | `"true"` → reads at `LAST_FINALIZED_BLOCK_NUMBER` (DON consensus); `"false"` → reads at latest block (simulation) |
| `skipReplayVerification` | `"true"` to skip Phase C replay bundle fetch; `"false"` to enable |
| `replayBundleBaseUrl` | Engine base URL — Phase C fetches `${baseUrl}/auctions/${auctionId}/replay` |

**Why two configs?** In simulation mode, `LAST_FINALIZED_BLOCK_NUMBER` on L2 (Base Sepolia) resolves to a block far behind latest — the state change from `recordResult` isn't visible yet, causing `"not in CLOSED state (got 0)"`. On a deployed DON, the trigger's `CONFIDENCE_LEVEL_FINALIZED` guarantees the event block is finalized, so `LAST_FINALIZED_BLOCK_NUMBER` correctly includes the state change.

## Simulate (Local)

```bash
# One-shot simulation with a specific TX
cre workflow simulate workflows/settlement \
  --target base-sepolia --broadcast \
  --evm-tx-hash 0x... --evm-event-index 0 \
  --trigger-index 0 --non-interactive

# Or use the settlement watcher for automatic detection
bun run scripts/settlement-watcher.ts
```

The settlement watcher polls for `AuctionEnded` events and automatically triggers `cre workflow simulate --broadcast` for each one. Uses `config.json` (default).

## Environment Policy (Important)

- **Local simulation with Chainlink MockForwarder**: metadata validation may not be available end-to-end. Use simulation-only settings/instances for rapid iteration.
- **Local contracts testing with this repo's `MockKeystoneForwarder`**: configure expected values to match mock metadata.
- **Any real KeystoneForwarder path (testnet or production)**: `configureCRE(...)` is **mandatory** before settlement. `AuctionEscrow.onReport()` is fail-closed and reverts when CRE is not configured.

## Deploy (DON)

```bash
# Deploy with production config (useFinalized=true)
cre workflow deploy workflows/settlement \
  --target base-sepolia \
  --config workflows/settlement/config.production.json

# Activate on DON
cre workflow activate workflows/settlement --target base-sepolia
```

## Post-Deploy: Configure AuctionEscrow

After deploying and activating the CRE workflow, configure AuctionEscrow with workflow credentials (required for any real-forwarder deployment):

```bash
cast send $ESCROW "configureCRE(bytes32,bytes10,address)" \
  $WORKFLOW_ID \
  $(cast --format-bytes32 "auctSettle" | cut -c1-22) \
  $WORKFLOW_OWNER \
  --rpc-url $BASE_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY
```

## Contract References

| Contract | Address (Base Sepolia) |
|---|---|
| AuctionRegistry v2 (trigger source) | `0xFEc7a05707AF85C6b248314E20FF8EfF590c3639` |
| AuctionEscrow v2 (IReceiver target) | `0x20944f46AB83F7eA40923D7543AF742Da829743c` |
| KeystoneForwarder (real) | `0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5` |
| MockIdentityRegistry | `0x68E06c33D4957102362ACffC2BFF9E6b38199318` |

## MVP Limitations

- Replay bundle verification is presence-only (fetches and checks non-empty)
- Full Poseidon hash chain replay and winner re-derivation is P1 scope
- `identityRegistryAddress` removed from config — identity verification is not part of the CRE workflow (handled by contracts directly)
- `callContract` block number policy is config-driven: `useFinalized=true` for deployed DON, `false` for simulation (see Configuration section above)

## E2E Settlement — Confirmed

Full end-to-end CRE settlement has been confirmed on Base Sepolia via `cre workflow simulate --broadcast`:

- **Settlement TX**: [`0x0b8e9ede940fcfe3f82365bc5bb0c174635e4f0e979ffdb67fbfabd10a98ce69`](https://sepolia.basescan.org/tx/0x0b8e9ede940fcfe3f82365bc5bb0c174635e4f0e979ffdb67fbfabd10a98ce69)
- **Result**: `transmissionSuccess=true`, 3 events emitted (AuctionSettled, SettlementProcessed, KeystoneForwarder transmission log)
- **AuctionEnded TX used as trigger**: [`0xccffa3a456a96fdfdd75b6ff3e1ad08fbf251703d2d218c8c6de101719672033`](https://sepolia.basescan.org/tx/0xccffa3a456a96fdfdd75b6ff3e1ad08fbf251703d2d218c8c6de101719672033)
