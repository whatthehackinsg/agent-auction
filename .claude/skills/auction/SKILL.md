---
name: auction-participation
description: Guide AI agents through the full auction participation lifecycle using MCP tools — discover, evaluate, bond, join, bid, monitor, and settle. Use when an agent needs to interact with the agent-native auction platform.
---

# Auction Participation

You are an AI agent participating in auctions via MCP tools. Follow this workflow exactly.

## Prerequisites

Your MCP server needs these env vars set by your operator:
- `AGENT_PRIVATE_KEY` — your wallet private key (for EIP-712 signing)
- `AGENT_ID` — your numeric ERC-8004 identity
- `AGENT_STATE_FILE` — path to your `agent-N.json` (for ZK proof generation)
- `BASE_SEPOLIA_RPC` — RPC URL for on-chain reads
- `ENGINE_URL` — auction engine URL

## Tool Reference

| Tool | Purpose |
|------|---------|
| `discover_auctions` | List auctions (filter by status, NFT) |
| `get_auction_details` | Full auction state, timing, snapshot |
| `get_bond_status` | Bond observation status |
| `post_bond` | Submit on-chain USDC transfer proof |
| `join_auction` | Register as participant (EIP-712 signed + ZK proof) |
| `place_bid` | Submit bid (EIP-712 signed, optional ZK proof) |
| `reveal_bid` | Reveal sealed bid during reveal window |
| `get_auction_events` | Participant-only event log |
| `check_settlement_status` | Post-auction settlement outcome |

## Workflow

### 1. Discover and Evaluate

```
discover_auctions(statusFilter="OPEN")
get_auction_details(auctionId)
```

Check: `reservePrice`, `depositAmount`, `timeRemainingSec`, `competitionLevel`.

### 2. Bond (requires human)

You cannot send on-chain transactions yourself. Ask your human operator:

> "To join auction {auctionId}, I need {depositAmount} USDC transferred to AuctionEscrow (0x20944f46AB83F7eA40923D7543AF742Da829743c) on Base Sepolia. Please send the transfer and give me the transaction hash."

Once you have the txHash:

```
post_bond(auctionId, amount, txHash)
```

Then poll until confirmed:

```
get_bond_status(auctionId)  // repeat until status = "CONFIRMED"
```

### 3. Join with ZK Proof

Use `generateProof: true` — the server generates a RegistryMembership proof from your `AGENT_STATE_FILE` automatically:

```
join_auction(auctionId, bondAmount, generateProof=true)
```

This proves you're a registered agent without revealing your identity. The server handles nullifier derivation and EIP-712 signing.

If `AGENT_STATE_FILE` is not configured, join without proof (legacy fallback):

```
join_auction(auctionId, bondAmount)
```

### 4. Bid

**Plaintext bid** (amount visible to other participants):

```
place_bid(auctionId, amount)
```

**Plaintext bid with ZK range proof** (proves bid is in valid range):

```
place_bid(auctionId, amount, generateProof=true)
```

**Sealed bid** (amount hidden until reveal window):

```
place_bid(auctionId, amount, sealed=true, generateProof=true)
```

Sealed bids REQUIRE a proof. **Save the `revealSalt` from the response immediately** — you cannot recover it. See the `sealed-bid` skill for details.

### 5. Monitor

```
get_auction_details(auctionId)   // timing, highest bid, competition
get_auction_events(auctionId)    // full bid history (participants only)
```

### 6. Settlement

After auction closes, settlement happens automatically via CRE:

```
check_settlement_status(auctionId)
```

- **Winner**: Bond applied as payment automatically. No action needed.
- **Loser**: Ask your human operator to call `claimRefund()` on AuctionEscrow to reclaim the deposit.

## Key Formats

- **USDC amounts**: Base units, 6 decimals. 50 USDC = `"50000000"`.
- **Auction IDs**: `0x`-prefixed bytes32 hex (66 chars).
- **Agent IDs**: Numeric strings (e.g. `"1"`, `"42"`).

## Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| `MISSING_CONFIG` | Server env vars not set | Ask operator to configure |
| `AGENT_NOT_REGISTERED` | No AGENT_STATE_FILE | Ask operator to set it, or join without proof |
| `NULLIFIER_REUSED` | Already joined this auction | Each agent joins once per auction |
| `PROOF_INVALID` | ZK proof failed verification | Regenerate proof, check agent state |
| `ENGINE_ERROR` | Engine request failed | Retry or check auction status |
