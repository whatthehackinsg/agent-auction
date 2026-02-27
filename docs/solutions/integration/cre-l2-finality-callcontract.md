---
title: CRE callContract reads stale state on L2 with LAST_FINALIZED_BLOCK_NUMBER
date: 2026-02-27
category: integration
tags: [cre, base-sepolia, l2, finality, callContract, LAST_FINALIZED_BLOCK_NUMBER]
severity: high
time_to_solve: 30
---

# CRE callContract Reads Stale State on L2

## Symptom

CRE settlement workflow fails at Phase A (state verification):

```
✗ Workflow execution failed:
Auction 0xb73e35a4... not in CLOSED state (got 0)
```

State 0 = NONE, meaning the auction doesn't exist at the block being read.
But the auction was confirmed CLOSED (state 2) at the latest block — the demo verified it,
and the AuctionEnded event that triggered the workflow proves `recordResult` succeeded.

## Root Cause

The CRE workflow used `LAST_FINALIZED_BLOCK_NUMBER` for `callContract` reads:

```typescript
const stateResult = evmClient
  .callContract(runtime, {
    call: encodeCallMsg({ from: zeroAddr, to: registry, data: callData }),
    blockNumber: LAST_FINALIZED_BLOCK_NUMBER,  // ← problem
  })
  .result();
```

On **Base Sepolia (L2)**, finality depends on L1 batch posting, which can lag **10-15 minutes**
behind the latest block. The `recordResult` TX was included in a recent block, but `LAST_FINALIZED_BLOCK_NUMBER`
resolved to a much earlier block where the auction didn't exist yet (state 0).

The key insight: the log trigger's `CONFIDENCE_LEVEL_FINALIZED` already ensures the triggering event
is finalized before the handler fires. Adding `LAST_FINALIZED_BLOCK_NUMBER` to subsequent reads is
redundant and counterproductive on L2s where finality definitions differ between event triggers
and state reads.

## Solution

Remove `blockNumber: LAST_FINALIZED_BLOCK_NUMBER` from both `callContract` calls in the workflow.
Without `blockNumber`, it defaults to reading at the latest block.

```typescript
// Before — fails on L2
const stateResult = evmClient
  .callContract(runtime, {
    call: encodeCallMsg({ ... }),
    blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
  })
  .result();

// After — works on L1 and L2
const stateResult = evmClient
  .callContract(runtime, {
    call: encodeCallMsg({ ... }),
  })
  .result();
```

Applied to both Phase A (getAuctionState) and Phase B (getWinner) reads.
Also removed unused `LAST_FINALIZED_BLOCK_NUMBER` import.

## What Didn't Work

1. **Assumed CRE simulator bug** — but the same issue would occur in production on L2.
2. **Checked RPC endpoint** — correct, reads at latest block worked fine via `cast`.

## Prevention

1. **L2 awareness**: When deploying CRE workflows on L2s (Base, Optimism, Arbitrum),
   avoid `LAST_FINALIZED_BLOCK_NUMBER` for reads that depend on the triggering event's state.
   The trigger's confidence level already handles finality.
2. **Test on target chain**: Always test `cre workflow simulate --broadcast` on the actual
   target chain, not just L1 testnets. L2 finality semantics differ significantly.
3. **Log the block number**: Add `runtime.log()` showing which block number was used for reads
   to make debugging faster.

## References

- CRE EVM Client docs: https://docs.chain.link/cre/reference/sdk/evm-client-ts
- CRE Finality concepts: https://docs.chain.link/cre/concepts/finality-ts
- Base Sepolia finality: L2 blocks are "safe" quickly but "finalized" only after L1 batch posting