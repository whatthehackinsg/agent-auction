# CRE Settlement Workflow

Chainlink CRE workflow for auction settlement. It watches `AuctionEnded`, cross-checks the winning state, verifies the replay bundle and `replayContentHash`, and settles `AuctionEscrow` through `onReport()`.

## Flow

```text
AuctionEnded (AuctionRegistry)
  -> verify auction is CLOSED
  -> read getWinner() and cross-check agentId, wallet, amount
  -> fetch replay bundle from the engine and verify replayContentHash
  -> sign DON report
  -> writeReport -> KeystoneForwarder -> AuctionEscrow.onReport()
```

The encoded report payload must match:

```text
abi.encode(bytes32 auctionId, uint256 winnerAgentId, address winnerWallet, uint256 amount)
```

## Current Run Modes

### 1. Local one-shot simulation

```bash
cre workflow simulate workflows/settlement \
  --target base-sepolia --broadcast \
  --evm-tx-hash 0x... --evm-event-index 0 \
  --trigger-index 0 --non-interactive
```

### 2. Local automatic watcher

```bash
cd cre
bun run scripts/settlement-watcher.ts
```

Use this when the workflow is not deployed on CRE. The watcher scans recent blocks on startup in provider-safe chunks, then triggers `cre workflow simulate --broadcast` for each new `AuctionEnded` event.

### 3. Deployed CRE workflow

```bash
cre workflow deploy workflows/settlement \
  --target base-sepolia \
  --config workflows/settlement/config.production.json

cre workflow activate workflows/settlement --target base-sepolia
```

## Commands

Run from `cre/`:

```bash
bun test
bun run scripts/settlement-watcher.ts
```

## Configuration

Two workflow configs live in `workflows/settlement/`:

| File | Purpose | `useFinalized` |
|---|---|---|
| `config.json` | local simulation and watcher-driven demo flow | `false` |
| `config.production.json` | deployed CRE workflow | `false` |

Important fields:

| Field | Meaning |
|---|---|
| `useFinalized` | current Base Sepolia setting for on-chain reads; both shipped configs currently use `false` to avoid finalized-state lag on testnet |
| `skipReplayVerification` | skip or enforce the replay-bundle fetch step |
| `replayBundleBaseUrl` | engine base URL used for `${baseUrl}/auctions/${auctionId}/replay` |
| `isTestnet` | testnet/mainnet mode for network helpers |

## Escrow Configuration

Any real KeystoneForwarder path is fail-closed until `AuctionEscrow.configureCRE(...)` is set on the active escrow:

```bash
cast send $ESCROW "configureCRE(bytes32,bytes10,address)" \
  $WORKFLOW_ID \
  $WORKFLOW_NAME \
  $WORKFLOW_OWNER \
  --rpc-url $BASE_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY
```

## Base Sepolia References

| Contract | Address |
|---|---|
| AuctionRegistry | `0xAe416531962709cb26886851888aEc80ef29bB45` |
| AuctionEscrow | `0x5a1af9fDD97162c184496519E40afCf864061329` |
| KeystoneForwarder | `0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5` |

## Confirmed Result

CRE settlement has been confirmed on the current Base Sepolia v3 stack through `cre workflow simulate --broadcast`:

- settlement tx: `0x8deb5f79d9588a785fe89abb6b46ba89f9363d4647d743dc7520f5a135e50b9a`
- trigger tx: `0xc0e8f96010b009b3c726dbed677b4bf096e5605d834a8ed86774b3dd78632403`

## Notes

- Replay verification now checks `replayContentHash` against the fetched replay bundle bytes.
- Identity verification does not happen inside CRE; it is enforced by the contracts, engine, and MCP layers.
- For demos without a deployed workflow, keep the settlement watcher running.
