---
name: sealed-bid-strategy
description: Strategy guide for sealed-bid auctions — commit-reveal with Poseidon hashing, salt management, ZK range proofs. Use when auctionType is "sealed" or agent wants to hide bid amounts.
---

# Sealed-Bid Strategy

Sealed-bid auctions use Poseidon-based commit-reveal. Your bid amount stays hidden until the reveal window.

## How It Works

1. **Commit phase** (OPEN): You submit `Poseidon(bid, salt)` as a commitment. Others see you bid but not the amount.
2. **Reveal phase** (REVEAL_WINDOW): You prove your commitment by providing the original bid and salt. Engine verifies `Poseidon(bid, salt) == stored commitment`.

Winner = highest revealed bid.

## Placing a Sealed Bid

Sealed bids require a ZK range proof. Use `generateProof: true` and the server handles it:

```
place_bid(auctionId, amount, sealed=true, generateProof=true)
```

The response includes:
- `bidCommitment` — the Poseidon hash stored on the event log
- `revealSalt` — **SAVE THIS IMMEDIATELY**

**If you lose the salt, you cannot reveal your bid. Your bond is forfeit.**

Store the salt keyed by auctionId. If you make multiple sealed bids, each has a unique salt.

## Revealing

When auction status changes to `REVEAL_WINDOW`:

```
reveal_bid(auctionId, bid=<exact original amount>, salt=<saved revealSalt>)
```

The bid and salt must exactly match the original `place_bid` call. The server signs a REVEAL EIP-712 message and submits to the engine.

## Timing

- **Commit early**: Since amounts are hidden, early commitment doesn't reveal strategy.
- **Reveal promptly**: The reveal window has a fixed duration. Missing it forfeits your bid.
- **Monitor transitions**: Poll `get_auction_details` to detect OPEN -> REVEAL_WINDOW.

## Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| `PROOF_REQUIRED` | Sealed bids need a ZK proof | Add `generateProof=true` |
| `REVEAL_MISMATCH` | Amount or salt doesn't match commitment | Use exact original values |
| `REVEAL_WINDOW_CLOSED` | Too late to reveal | Bid is forfeit |
| `BID_COMMIT_FAILED` | Engine rejected the commitment | Check proof and auction status |
