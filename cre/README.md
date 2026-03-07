# CRE Settlement Workflow

Chainlink CRE workflow for auction settlement. It watches `AuctionEnded`, cross-checks the winning state, optionally verifies replay-bundle availability, and settles `AuctionEscrow` through `onReport()`.

## Flow

```text
AuctionEnded (AuctionRegistry, finalized)
  -> verify auction is CLOSED
  -> read getWinner() and cross-check agentId, wallet, amount
  -> fetch replay bundle from the engine (presence check)
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
| `config.production.json` | deployed CRE workflow | `true` |

Important fields:

| Field | Meaning |
|---|---|
| `useFinalized` | finalized reads for deployed CRE, latest reads for local simulation |
| `skipReplayVerification` | skip or enforce the replay-bundle fetch step |
| `replayBundleBaseUrl` | engine base URL used for `${baseUrl}/auctions/${auctionId}/replay` |
| `isTestnet` | testnet/mainnet mode for network helpers |

## Escrow Configuration

Any real KeystoneForwarder path is fail-closed until `AuctionEscrow.configureCRE(...)` is set:

```bash
cast send $ESCROW "configureCRE(bytes32,bytes10,address)" \
  $WORKFLOW_ID \
  $(cast --format-bytes32 "auctSettle" | cut -c1-22) \
  $WORKFLOW_OWNER \
  --rpc-url $BASE_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY
```

## Base Sepolia References

| Contract | Address |
|---|---|
| AuctionRegistry | `0xFEc7a05707AF85C6b248314E20FF8EfF590c3639` |
| AuctionEscrow | `0x20944f46AB83F7eA40923D7543AF742Da829743c` |
| KeystoneForwarder | `0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5` |

## Confirmed Result

CRE settlement has already been confirmed on Base Sepolia through `cre workflow simulate --broadcast`:

- settlement tx: `0x0b8e9ede940fcfe3f82365bc5bb0c174635e4f0e979ffdb67fbfabd10a98ce69`
- trigger tx: `0xccffa3a456a96fdfdd75b6ff3e1ad08fbf251703d2d218c8c6de101719672033`

## Notes

- Replay verification is still a presence check in the current hackathon scope.
- Identity verification does not happen inside CRE; it is enforced by the contracts, engine, and MCP layers.
- For demos without a deployed workflow, keep the settlement watcher running.
