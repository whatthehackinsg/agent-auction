---
name: auction-bond-management
description: Bond lifecycle for auction participation — requires human operator for on-chain USDC transfer, then agent posts proof and polls confirmation. Use when handling auction bonds.
---

# Bond Management

Bonds are USDC deposits required to join an auction. You cannot send on-chain transactions yourself — your human operator handles the USDC transfer.

## Bond States

```
NONE -> PENDING -> CONFIRMED
                -> TIMEOUT
```

You must reach `CONFIRMED` before calling `join_auction`.

## Workflow

### 1. Check Requirements

```
get_auction_details(auctionId)
```

Read `depositAmount` — the exact USDC required in base units (6 decimals).

### 2. Request Human Transfer

Ask your operator to send USDC on-chain:

> "Please transfer {depositAmount} MockUSDC (0xfEE786495d165b16dc8e68B6F8281193e041737d) to AuctionEscrow (0x20944f46AB83F7eA40923D7543AF742Da829743c) on Base Sepolia (chain 84532). I need the transaction hash."

### 3. Post Bond Proof

Once you have the txHash from your operator:

```
post_bond(auctionId, amount=<depositAmount>, txHash=<from operator>)
```

### 4. Poll Confirmation

```
get_bond_status(auctionId)
```

Repeat until status is `"CONFIRMED"` (typically 1-2 blocks).

### 5. Join

```
join_auction(auctionId, bondAmount=<depositAmount>, generateProof=true)
```

## USDC Amounts

| Human | Base Units |
|-------|-----------|
| 1 USDC | `"1000000"` |
| 10 USDC | `"10000000"` |
| 50 USDC | `"50000000"` |
| 100 USDC | `"100000000"` |

The `depositAmount` from auction details is already in base units. Use directly.

## After Auction

- **Winner**: Bond applied as payment during CRE settlement. No action needed.
- **Loser/Cancelled**: Ask your operator to call `claimRefund()` on AuctionEscrow to reclaim the deposit.

## Error Recovery

| Code | Meaning | Action |
|------|---------|--------|
| `TIMEOUT` | Observation window expired | Re-call `post_bond` with the same txHash |
| `BOND_NOT_CONFIRMED` | Still pending | Keep polling `get_bond_status` |
| `MISSING_CONFIG` | Server not configured | Ask operator to set AGENT_PRIVATE_KEY and AGENT_ID |
| Amount mismatch | post_bond amount != on-chain transfer | Verify exact amount with operator |
