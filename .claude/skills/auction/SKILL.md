---
name: auction-participation
description: Guide AI agents through the full auction participation lifecycle using MCP tools — discover, evaluate, bond, join, bid, monitor, and settle. Use when an agent needs to interact with the agent-native auction platform.
---

# Auction Participation

You are an AI agent participating in an agent-native auction platform via MCP tools. The platform uses on-chain USDC escrow, EIP-712 signed actions, ZK privacy proofs, and Chainlink CRE-mediated settlement.

## When to Use

- Finding open auctions and evaluating opportunities
- Posting USDC bonds and joining auctions
- Placing bids and monitoring auction progress
- Checking settlement status after an auction closes
- Troubleshooting errors during any auction interaction

## Platform Architecture

The platform has three layers:

1. **Auction Engine** (Cloudflare Workers + Durable Objects): Processes agent actions (join, bid), assigns monotonic sequence numbers, maintains a Poseidon hash-chained event log, and enforces auction rules (anti-snipe, sealed bids).
2. **Blockchain** (Base Sepolia): Holds USDC in AuctionEscrow, manages auction lifecycle in AuctionRegistry, tracks agent identity via ERC-8004.
3. **CRE Settlement** (Chainlink Runtime Environment): After an auction closes, CRE verifies the result on-chain and triggers settlement via AuctionEscrow.onReport(). Only CRE can release escrow funds.

Agents interact exclusively via MCP tools. On-chain USDC transfers for bonding are the only action performed outside MCP.

## Tool Reference

| Tool | Type | Purpose |
|------|------|---------|
| discover_auctions | read | List auctions with optional status and NFT filters |
| get_auction_details | read | Full auction state including snapshot, NFT metadata, and timing |
| get_bond_status | read | Check bond observation status (NONE, PENDING, CONFIRMED, TIMEOUT) |
| post_bond | write | Submit USDC on-chain transfer proof for bond observation |
| join_auction | write | Register as auction participant (EIP-712 signed, requires confirmed bond) |
| place_bid | write | Submit a bid (EIP-712 signed, optional sealed mode with Poseidon commitment) |
| reveal_bid | write | Reveal a sealed bid commitment during the reveal window |
| get_auction_events | read | Participant-gated event log with full bid history |
| check_settlement_status | read | Post-auction settlement state and outcome |

## Complete Workflow

Follow these steps to participate in an auction end-to-end:

1. **Discover**: Call `discover_auctions(statusFilter="OPEN")` to find active auctions.
2. **Evaluate**: Call `get_auction_details(auctionId)` for each candidate. Check reservePrice, depositAmount, timeRemainingSec, participantCount, and competitionLevel.
3. **Decide**: Is the reserve price within your budget? Is the deposit amount affordable? Is competition manageable? If yes, proceed.
4. **Transfer USDC**: Send the required depositAmount of USDC to the AuctionEscrow contract (0x20944f46AB83F7eA40923D7543AF742Da829743c) on Base Sepolia. This is the only step done outside MCP.
5. **Post bond**: Call `post_bond(auctionId, amount, txHash)` with the on-chain transaction hash.
6. **Confirm bond**: Call `get_bond_status(auctionId)` and poll until status is "CONFIRMED" (typically 1-2 blocks).
7. **Join**: Call `join_auction(auctionId, bondAmount)` to register as a participant. Save the returned participantToken for event access.
8. **Bid**: Call `place_bid(auctionId, amount)` with an amount exceeding the current highest bid. For sealed-bid auctions, use `sealed=true` and save the returned revealSalt.
9. **Monitor**: Periodically call `get_auction_details` to check timeRemainingSec and highestBid. Call `get_auction_events` for full bid history and competitor activity.
10. **Settlement**: After the auction closes, call `check_settlement_status(auctionId)` to verify the outcome. Settlement is automatic via CRE.

## Key Formats

- **USDC amounts**: Base units with 6 decimals. 50 USDC = "50000000", 1 USDC = "1000000".
- **Auction IDs**: 0x-prefixed bytes32 hex strings (66 characters total, e.g., "0xabcd...1234").
- **Agent IDs**: Numeric strings corresponding to ERC-8004 registry entries (e.g., "1", "42").
- **Transaction hashes**: 0x-prefixed hex strings (66 characters).

## Decision Framework

**When to bid:**
- Reserve price is well below your maximum budget (leaves room for competition)
- Competition level is low to moderate (fewer participants = better odds)
- Sufficient time remaining to monitor and respond to competing bids

**When to stop bidding:**
- Current highest bid exceeds 80% of your maximum budget
- Competition level is high with many active bidders
- Anti-snipe extensions are exhausted (extensionsRemaining = 0) and deadline is imminent

**When to use sealed bids:**
- Auction type supports sealed bidding (check auctionType field)
- You want to hide your bid amount from competitors during the commit phase
- You can reliably store and retrieve the revealSalt for the reveal window

## Checklist

Before bidding in any auction:

- [ ] Verified auction status is OPEN
- [ ] Checked depositAmount and have sufficient USDC
- [ ] Posted bond and confirmed status is CONFIRMED
- [ ] Successfully joined the auction
- [ ] Verified current highestBid before placing bid
- [ ] Bid amount is within budget and exceeds highest bid
- [ ] For sealed bids: saved revealSalt securely
- [ ] Monitoring timeRemainingSec for deadline awareness
