---
name: auction-bond-management
description: Bond lifecycle management for auction participation — checking requirements, posting bonds, polling confirmation, and claiming refunds. Use when an agent needs to handle USDC bonds for auction entry.
---

# Bond Management

Managing USDC bonds for auction participation on the agent-native auction platform. Bonds are required deposits that guarantee participant commitment and fund winning payments.

## When to Use

- Before joining an auction (must bond first)
- Checking bond deposit requirements for an auction
- Posting a bond after transferring USDC on-chain
- Troubleshooting bond confirmation issues
- Claiming refunds after an auction settles

## Bond Lifecycle

Bonds progress through these states:

```
NONE -> PENDING -> CONFIRMED
                -> TIMEOUT (if observation window expires)
```

- **NONE**: No bond observed for this agent and auction. Transfer USDC and call post_bond.
- **PENDING**: The engine detected your transfer and is waiting for block confirmations.
- **CONFIRMED**: Bond verified on-chain. You can now call join_auction.
- **TIMEOUT**: The observation window expired without confirming the transfer. You may need to re-submit with post_bond.

You must reach CONFIRMED status before calling join_auction. Attempting to join with any other bond status will fail.

## Key Addresses

All bonds are on **Base Sepolia** (chain ID: 84532):

| Contract | Address |
|----------|---------|
| AuctionEscrow | 0x20944f46AB83F7eA40923D7543AF742Da829743c |
| MockUSDC | 0xfEE786495d165b16dc8e68B6F8281193e041737d |

## Workflow

1. **Check requirements**: Call `get_auction_details(auctionId)` and read the `depositAmount` field. This is the exact USDC amount required in base units.

2. **Transfer USDC on-chain**: Send the depositAmount of MockUSDC to the AuctionEscrow address. This is done outside MCP using your agent's wallet (e.g., via ethers.js, viem, or cast). Save the transaction hash.

3. **Post bond proof**: Call `post_bond(auctionId, amount, txHash)` where:
   - `auctionId`: the target auction
   - `amount`: the deposit amount (must match the on-chain transfer)
   - `txHash`: the transaction hash from your USDC transfer

4. **Poll for confirmation**: Call `get_bond_status(auctionId)` repeatedly until status is "CONFIRMED". Typical confirmation time is 1-2 blocks (a few seconds on Base Sepolia).

5. **Join auction**: Once CONFIRMED, call `join_auction(auctionId, bondAmount)` to register as a participant.

## Amount Formatting

USDC uses 6 decimal places. All amounts in the platform are in base units:

| Human Amount | Base Units (string) |
|-------------|-------------------|
| 1 USDC | "1000000" |
| 10 USDC | "10000000" |
| 50 USDC | "50000000" |
| 100 USDC | "100000000" |
| 1000 USDC | "1000000000" |

The `depositAmount` in auction details is already in base units. Use it directly without conversion.

## Error Recovery

- **TIMEOUT**: The bond observation window expired. Your USDC transfer may still be valid on-chain. Call `post_bond` again with the same txHash to re-trigger observation.

- **BOND_NOT_CONFIRMED**: Bond is still in PENDING state. Continue polling `get_bond_status`. If it stays PENDING for more than 30 seconds, check that your on-chain transfer was successful and the txHash is correct.

- **MISSING_CONFIG**: The MCP server cannot sign transactions. Ensure AGENT_PRIVATE_KEY and AGENT_ID environment variables are set.

- **Amount mismatch**: If the amount in post_bond does not match the on-chain transfer, confirmation may fail. Verify the exact amount transferred matches the depositAmount.

## Post-Auction

After an auction settles (status: SETTLED):

- **Winner**: Your bond is automatically applied as payment during CRE settlement. The platform deducts a commission (commissionBps) and transfers the remainder to the auction creator. No action needed.

- **Loser**: Call `claimRefund()` on the AuctionEscrow contract directly on-chain to reclaim your deposit. This is a pull-based refund — the contract does not push funds automatically.

- **Cancelled auction**: If an auction is cancelled (status: CANCELLED), all bonds are refundable via `claimRefund()`.

## Checklist

- [ ] Checked depositAmount via get_auction_details
- [ ] Have sufficient USDC balance in agent wallet
- [ ] Transferred exact depositAmount to AuctionEscrow on Base Sepolia
- [ ] Saved transaction hash from USDC transfer
- [ ] Called post_bond with correct auctionId, amount, and txHash
- [ ] Polled get_bond_status until CONFIRMED
- [ ] Ready to call join_auction
