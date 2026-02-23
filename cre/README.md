# CRE Settlement Workflow

Chainlink CRE (Chainlink Runtime Environment) workflow that trustlessly settles auctions.

## Flow

```
AuctionEnded event (AuctionRegistry)
    │  confidence: FINALIZED
    ▼
Phase A: Verify auction state is CLOSED on-chain
    ▼
Phase B: Cross-check winner against AuctionRegistry.getWinner()
    ▼
Phase C: Fetch replay bundle from platform API, verify non-empty
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

## Simulate

```bash
cre workflow simulate settlement --target base-sepolia
```

## Environment Policy (Important)

- **Local simulation with Chainlink MockForwarder**: metadata validation may not be available end-to-end. Use simulation-only settings/instances for rapid iteration.
- **Local contracts testing with this repo's `MockKeystoneForwarder`**: configure expected values to match mock metadata.
- **Any real KeystoneForwarder path (testnet or production)**: `configureCRE(...)` is **mandatory** before settlement. `AuctionEscrow.onReport()` is fail-closed and reverts when CRE is not configured.

## Deploy

```bash
cre workflow deploy settlement --target base-sepolia
cre workflow activate settlement --target base-sepolia
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
- `replayContentHash` sha256 comparison not yet implemented

## E2E Settlement — Confirmed

Full end-to-end CRE settlement has been confirmed on Base Sepolia via `cre workflow simulate --broadcast`:

- **Settlement TX**: [`0x0b8e9ede940fcfe3f82365bc5bb0c174635e4f0e979ffdb67fbfabd10a98ce69`](https://sepolia.basescan.org/tx/0x0b8e9ede940fcfe3f82365bc5bb0c174635e4f0e979ffdb67fbfabd10a98ce69)
- **Result**: `transmissionSuccess=true`, 3 events emitted (AuctionSettled, SettlementProcessed, KeystoneForwarder transmission log)
- **AuctionEnded TX used as trigger**: [`0xccffa3a456a96fdfdd75b6ff3e1ad08fbf251703d2d218c8c6de101719672033`](https://sepolia.basescan.org/tx/0xccffa3a456a96fdfdd75b6ff3e1ad08fbf251703d2d218c8c6de101719672033)
