---
name: sealed-bid-strategy
description: Strategy guide for sealed-bid auctions — commit phase, reveal window, salt management. Use when participating in a sealed-bid auction or when the auctionType is "sealed".
---

# Sealed-Bid Strategy

Specialized skill for sealed-bid auctions that use a Poseidon-based commit-reveal scheme to hide bid amounts until the reveal window.

## When to Use

- Auction type is "sealed" (check auctionType in get_auction_details response)
- You need to place a hidden bid during the commit phase
- You need to reveal a previously committed bid
- Managing multiple sealed bid salts across auctions

## How Sealed Bids Work

Sealed-bid auctions have two distinct phases:

1. **Commit phase** (auction status: OPEN): You submit a hidden bid. The engine computes `Poseidon(bid, salt)` as your commitment hash and records it on the event log. Other participants see that you bid but not the amount.

2. **Reveal phase** (auction status: REVEAL_WINDOW): After the commit phase ends, a reveal window opens. You must prove your commitment by providing the original bid amount and salt. The engine recomputes the Poseidon hash and verifies it matches.

The winner is determined by the highest revealed bid, not by commit order.

## Critical: Salt Management

When you call `place_bid(auctionId, amount, sealed=true)`, the response includes a `revealSalt` field.

**You MUST save this value immediately.** The salt is generated randomly and cannot be recovered from the engine or the commitment hash. If you lose the salt:

- You cannot reveal your bid
- Your bid is treated as forfeit
- You lose your bonded deposit

Storage recommendations:
- Keep the salt in agent memory for the duration of the auction
- If your agent has persistent state, write the salt keyed by `(auctionId, commitmentHash)`
- For multiple sealed bids, track each salt independently — each `place_bid` generates a unique salt

## Workflow

1. **Place sealed bid**: Call `place_bid(auctionId, amount, sealed=true)`
2. **Save salt**: Immediately store the `revealSalt` from the response
3. **Wait for reveal window**: Monitor `get_auction_details` — when status changes to REVEAL_WINDOW, proceed
4. **Reveal bid**: Call `reveal_bid(auctionId, amount, salt)` with the exact original bid amount and saved salt
5. **Verify reveal**: Check the response confirms successful reveal

## Timing Strategy

- **Commit early**: Place your sealed bid early in the commit phase. Since amounts are hidden, early commitment does not reveal strategy but establishes your participation.
- **Reveal promptly**: Reveal as soon as the window opens. The reveal window has a fixed duration — missing it forfeits your bid.
- **Monitor status transitions**: Poll `get_auction_details` to detect when the auction moves from OPEN to REVEAL_WINDOW. Do not rely on timing alone.

## Error Handling

- **REVEAL_MISMATCH**: The bid amount or salt does not match your commitment. Verify you are using the exact values from the original `place_bid` call.
- **REVEAL_WINDOW_CLOSED**: The reveal window has passed. Your bid is forfeit.
- **BID_TOO_LOW**: Even in sealed mode, some auctions enforce a minimum bid. Ensure your amount meets the reserve price.

## Checklist

- [ ] Confirmed auction supports sealed bidding (auctionType)
- [ ] Called place_bid with sealed=true
- [ ] Saved revealSalt immediately after place_bid response
- [ ] Verified commitment hash was recorded (check response)
- [ ] Monitoring auction status for REVEAL_WINDOW transition
- [ ] Revealed bid within the reveal window using exact original amount and salt
- [ ] Confirmed reveal was accepted by the engine
