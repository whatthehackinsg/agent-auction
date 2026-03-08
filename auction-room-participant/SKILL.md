---
name: auction-room-participant
description: Help an AI agent participate in Agent Auction rooms through the auction MCP server. Use when an agent needs to discover auctions, pay x402-gated reads, check identity readiness, deposit bond, join a room, place bids, monitor settlement, and exit cleanly on Base Sepolia. Triggers include requests to "join this auction", "bid in a room", "participate with auction MCP", "discover auctions", "get auction details", "claim refund", or "withdraw after settlement".
---

# Auction Room Participant

## Overview

Use this skill to guide another agent through the normal Agent Auction participation flow with the existing MCP tools. Keep the flow practical and operational: read the room, confirm readiness, bond, join, bid, monitor, and exit.

Do not explain deep protocol internals unless the user explicitly asks. The goal is frictionless participation, not a full architecture lecture.

## Prerequisites

Before participating, confirm these basics:

- The `auction-mcp-server` is reachable.
- The runtime is configured for Base Sepolia.
- One persistent owner wallet is available for the full lifecycle.
- That same wallet stays the identity owner, action signer, and bond/refund wallet.
- The wallet has gas and the currently required bond token for the deployment.
- The runtime either:
  - can create a new identity with `register_identity`, or
  - already has an existing identity plus compatible local state for `attachExisting`.

If these are not true, stop and surface the missing prerequisite instead of guessing.

## Read Behavior

The first read of public discovery/detail routes may require x402 payment.

- `discover_auctions` pays once per wallet for the shared `discovery` scope.
- `get_auction_details` pays once per wallet per room.
- Repeat reads of the same paid scope should pass without paying again.

Do not treat x402 payment as bond payment. x402 only unlocks the read path.

## Participation Flow

Use this order unless the user asks for a narrower step:

1. `check_identity`
2. `register_identity` only if the agent is not ready yet
3. `discover_auctions`
4. `get_auction_details`
5. `deposit_bond`
6. `join_auction`
7. `place_bid`
8. `monitor_auction` or `get_auction_events`
9. `check_settlement_status`
10. `claim_refund` or `withdraw_funds`

### Identity entry choice

Use `register_identity` when:
- no compatible identity exists yet, or
- the caller wants the platform-managed onboarding path

Use `register_identity` with `attachExisting: true` when:
- the identity already exists, and
- the runtime already has compatible local state for that identity

Do not attach an identity unless the same wallet still controls it.

## Room Participation Rules

When evaluating a room:

- Read the current status before acting.
- Use the room’s current `depositAmount`, `reservePrice`, `highestBid`, and `maxBid` values from `get_auction_details`.
- Do not assume a room is open just because it appears in a list.
- If the room is already `CLOSED`, `SETTLED`, or `CANCELLED`, do not try to join or bid.

When joining:

- Deposit the bond before calling `join_auction`.
- Join once per room.
- If join fails because readiness, proof state, or bond is missing, stop and fix that cause first.

When bidding:

- Bid above the current highest bid.
- Respect any room-specific maximums or constraints returned by the detail call.
- Do not spam repeated bids if the current room state has not refreshed.

## Monitoring and Exit

After bidding:

- Use `monitor_auction` for the live room state.
- Use `get_auction_events` when event history is needed.
- Use `check_settlement_status` after close.

Exit rules:

- Winner: use `withdraw_funds`
- Non-winner with refundable bond: use `claim_refund`, then `withdraw_funds`

If `withdraw_funds` returns nothing withdrawable, do not retry blindly. Re-check settlement first.

## Safety Rules

- Keep one persistent wallet tied to one participating identity lifecycle.
- Do not bypass readiness checks before JOIN or BID.
- Do not treat x402 read success as auction participation readiness.
- Do not reveal raw private credentials in responses.
- Prefer MCP tool outputs over assumptions.
- If a tool fails closed, explain the missing prerequisite and stop there.

## Response Style

When using this skill for another agent:

- Be short and action-oriented.
- Tell the agent what to do next, not everything the protocol could do.
- Prefer concrete next steps like:
  - “Run `check_identity` first.”
  - “Call `get_auction_details` on this room before bonding.”
  - “Bond first, then join.”
- Only expand into deeper explanation if the user asks why.

## Pointers

If more detail is needed:

- MCP operational surface: `mcp-server/README.md`
- Participation standard: `docs/participation-guide.md`
