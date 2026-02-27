---
title: AuctionSettlementPacket struct mismatch — replayContentHash in engine but not in deployed contract
date: 2026-02-27
category: integration
tags: [eip-712, settlement, abi, struct-mismatch, base-sepolia, recordResult]
severity: high
time_to_solve: 120
---

# AuctionSettlementPacket Struct Mismatch

## Symptom

`recordResult` on-chain TX reverts with empty data (`data: "0x"`). No revert reason decoded.
The engine's `closeAuction()` alarm fires successfully, constructs and signs the settlement packet,
but the contract call reverts every time (up to 6 retries).

```
settlement failed — recordResult reverted (attempt 3/6)
```

## Root Cause

The deployed AuctionRegistry v2 contract uses `AuctionSettlementPacket` **without** `replayContentHash`:

```solidity
struct AuctionSettlementPacket {
    bytes32 auctionId;
    bytes32 manifestHash;
    bytes32 finalLogHash;
    // NO replayContentHash
    uint256 winnerAgentId;
    address winnerWallet;
    uint256 winningBidAmount;
    uint64  closeTimestamp;
}
```

But the engine's TypeScript code included `replayContentHash` as a `bytes32` field.
This caused **two** failures simultaneously:

1. **EIP-712 TYPEHASH mismatch**: On-chain SETTLEMENT_TYPEHASH (`0x2ed6...`) didn't match
   the hash computed from the engine's struct (which included `replayContentHash` → `0xbd32...`).
   `ecrecover` returns wrong address → signature verification fails.

2. **ABI encoding offset**: Extra 32 bytes in the tuple shifts all subsequent fields.
   `winnerAgentId` reads from `finalLogHash`'s slot, `winnerWallet` reads from `winnerAgentId`'s slot, etc.
   Even if the signature somehow passed, the data would be garbled.

## Solution

Remove `replayContentHash` from all engine-side definitions:

**engine/src/lib/settlement.ts** — EIP-712 types:
```typescript
const SETTLEMENT_TYPES = {
  AuctionSettlementPacket: [
    { name: 'auctionId', type: 'bytes32' },
    { name: 'manifestHash', type: 'bytes32' },
    { name: 'finalLogHash', type: 'bytes32' },
    // replayContentHash REMOVED — not in deployed contract
    { name: 'winnerAgentId', type: 'uint256' },
    { name: 'winnerWallet', type: 'address' },
    { name: 'winningBidAmount', type: 'uint256' },
    { name: 'closeTimestamp', type: 'uint64' },
  ],
}
```

Also removed from: `engine/src/lib/chain-client.ts` (ABI), `engine/src/types/contracts.ts` (interface),
`engine/src/auction-room.ts` (packet construction in `closeAuction()` and `/close` handler).

## What Didn't Work

1. **Checked DOMAIN_SEPARATOR** — matched between engine and contract. Red herring.
2. **Checked ecrecover manually with cast** — returned correct sequencer address.
   This ruled out private key issues but didn't explain the revert.
3. **Assumed gas/nonce issues** — tried different gas limits and nonce management. No effect.

**Breakthrough**: Compared on-chain `SETTLEMENT_TYPEHASH` (`cast call ... "SETTLEMENT_TYPEHASH()"`)
with `keccak256` of the engine's struct string. They didn't match. Testing the struct
string **without** `replayContentHash` produced the matching hash.

```bash
# On-chain value
cast call 0xFEc7... "SETTLEMENT_TYPEHASH()(bytes32)" --rpc-url $RPC
# → 0x2ed639eb...

# Engine's struct (WITH replayContentHash) — WRONG
cast keccak "AuctionSettlementPacket(bytes32 auctionId,bytes32 manifestHash,bytes32 finalLogHash,bytes32 replayContentHash,uint256 winnerAgentId,address winnerWallet,uint256 winningBidAmount,uint64 closeTimestamp)"
# → 0xbd32...  ← doesn't match

# Without replayContentHash — CORRECT
cast keccak "AuctionSettlementPacket(bytes32 auctionId,bytes32 manifestHash,bytes32 finalLogHash,uint256 winnerAgentId,address winnerWallet,uint256 winningBidAmount,uint64 closeTimestamp)"
# → 0x2ed639eb...  ← matches!
```

## Prevention

1. **Single source of truth**: Generate TypeScript types from contract ABI (`forge inspect`), not manually.
2. **TYPEHASH assertion test**: Add a test that computes TYPEHASH from TypeScript types and asserts
   equality with the on-chain value.
3. **After contract redeploy**: Always re-verify SETTLEMENT_TYPEHASH matches engine code.
   Run: `cast call <registry> "SETTLEMENT_TYPEHASH()(bytes32)"` and compare.

## References

- EIP-712 spec: https://eips.ethereum.org/EIPS/eip-712
- viem signTypedData: https://viem.sh/docs/actions/wallet/signTypedData
- Deployed AuctionRegistry v2: `0xFEc7a05707AF85C6b248314E20FF8EfF590c3639`