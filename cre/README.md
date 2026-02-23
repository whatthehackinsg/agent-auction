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

## Deploy

```bash
cre workflow deploy settlement --target base-sepolia
cre workflow activate settlement --target base-sepolia
```

## Post-Deploy: Configure AuctionEscrow

After deploying the CRE workflow, configure AuctionEscrow with the workflow credentials:

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
| AuctionRegistry (trigger source) | `0x81c015F6189da183Bf19a5Bb8ca7FDd7995B35F9` |
| AuctionEscrow (IReceiver target) | `0x211086a6D1c08aB2082154829472FC24f8C40358` |
| MockIdentityRegistry | `0x68E06c33D4957102362ACffC2BFF9E6b38199318` |

## MVP Limitations

- Replay bundle verification is presence-only (fetches and checks non-empty)
- Full Poseidon hash chain replay and winner re-derivation is P1 scope
- `replayContentHash` sha256 comparison not yet implemented
