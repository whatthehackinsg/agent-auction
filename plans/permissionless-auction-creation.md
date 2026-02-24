# Permissionless Auction Creation

**Status**: Proposed  
**Priority**: P2 (post-MVP)  
**Estimated effort**: 1-2 hours  
**Contract changes**: None

## Motivation

Currently only the platform sequencer can create auctions (`AuctionRegistry.createAuction()` has an `onlySequencer` modifier). This means agents cannot post their own tasks and humans cannot create auctions directly. Opening auction creation to all participant types (agents, humans, platform) makes the marketplace two-sided and more compelling for the hackathon narrative.

## Design Constraints

Relaxing the on-chain `onlySequencer` permission alone creates two synchronization gaps:

1. **Chain/off-chain desync**: If an agent calls `createAuction()` directly on-chain, the Cloudflare Durable Object (DO) room is never created. The auction exists on-chain but has no execution environment — no one can join, bid, or observe. Dead auction.

2. **Engine blind spot**: The engine manages the full auction lifecycle (join, bid, bond, close, settle). If it doesn't know an auction exists, `recordBond()` is never called, bids are never routed, and the settlement CRE workflow is never triggered.

Both problems stem from the same root: **on-chain state and off-chain state must be created atomically, and only the engine can guarantee that.**

## Proposed Solution

**Keep `onlySequencer` on-chain. Open a public API endpoint on the engine.**

All auction creation — regardless of who initiates it — flows through the engine, which orchestrates both the DO room and the on-chain registration atomically.

### Flow

```
Initiator (agent / human / platform)
  │
  ▼
POST /api/auctions/create
  ├── Headers: Authorization (EIP-712 signed request or API key)
  ├── Body: { manifest, bondAmount, deadline, creatorType }
  │
  ▼
Engine validates identity
  │
  ▼
Engine creates DO room (off-chain state)
  │
  ▼
Engine calls createAuction() on-chain (sequencer wallet signs tx)
  │
  ▼
Returns { auctionId, roomUrl, txHash }
```

### Why This Works

| Problem | Resolution |
|---------|------------|
| Chain/off-chain desync | Engine creates both atomically. If DO creation fails, no on-chain tx is sent. If on-chain tx fails, DO room is torn down. |
| Engine blind spot | Engine is always in the loop — it created the auction, so it knows about it. |
| Settlement chain integrity | `recordResult()` stays `onlySequencer`. CRE `onReport()` stays `onlyForwarder`. No trust model change. |
| Bond management | `recordBond()` stays `onlyAdmin` (engine). Bond flow unchanged. |
| EIP-712 signature validity | Sequencer still signs all on-chain txs. Domain separator unchanged. |

### What Changes

| Layer | File | Change |
|-------|------|--------|
| Engine | `src/index.ts` | Add `POST /api/auctions/create` endpoint with auth middleware |
| Engine | `src/auction-room.ts` | Accept `creatorType: "agent" \| "human" \| "platform"` in room init metadata |
| Agent Client | `src/` | Add `createAuction()` SDK method that calls the engine endpoint |
| Contracts | — | **No changes.** `onlySequencer` stays. |
| CRE | — | **No changes.** Settlement workflow unchanged. |
| Frontend | — | **No changes.** Spectator-only principle preserved. |

### Authentication

Three creator types, three auth paths:

| Creator | Auth method | Verification |
|---------|------------|--------------|
| Agent | EIP-712 signed request (runtime key) | Engine verifies signature against IdentityRegistry |
| Human | API key or wallet signature | Engine verifies against allowlist or on-chain identity |
| Platform | Internal (sequencer calls itself) | Existing path, no change |

### On-Chain Metadata

`createAuction()` already accepts a `manifest` parameter (bytes32 hash). The engine can encode the creator type and creator address in the manifest or emit it in the `AuctionCreated` event for indexing. No struct changes needed.

### Rollback Safety

If either step fails:
- DO creation fails → return error, no on-chain tx sent
- On-chain tx reverts → engine deletes the DO room, return error
- Engine crash between steps → DO room exists without on-chain state → add a startup reconciliation job that checks for orphaned rooms and cleans them up

## What This Does NOT Change

- **Auction lifecycle**: join → bid → bond → close → settle remains sequencer-controlled
- **Settlement**: CRE EVM Log trigger → onReport() → escrow release — untouched
- **Trust model**: Sequencer is still the trusted operator for ordering and finality
- **Bond flow**: Engine admin calls recordBond() after verifying USDC transfer — untouched
- **Contract permissions**: All on-chain modifiers (onlySequencer, onlyAdmin, onlyForwarder) stay

## Future Extensions (Not in Scope)

- Agent-to-agent direct auctions (skip platform escrow)
- On-chain permissionless creation (remove onlySequencer, add event-driven DO creation)
- CRE-triggered room creation (AuctionCreated event → CRE workflow → engine webhook)
- Multi-chain auction creation (CCIP message → create auction on target chain)
