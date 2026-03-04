# Quick Task 1 Summary: Cherry-pick ZK Crypto Security Fixes

## What was done

Cherry-picked commit `917ad30` from `origin/feat/zk-crypto-security-fixes` onto `main`, then applied two additional bug fixes discovered during code review.

## Changes

### From the branch (8 security fixes + sealed-bid feature):
1. **Circuit**: Removed dead `salt` input, added `pathIndices` boolean constraint
2. **Contract**: ERC-8004 ownership check on `register()`, new Poseidon root + capability commitment fields
3. **Engine**: Per-agent Poseidon root cross-check reinstated (critical ZKFN-02 fix)
4. **Engine**: BID_COMMIT + REVEAL handlers, sealed-bid state machine
5. **MCP**: Sealed mode in `place_bid`, new `reveal_bid` tool, BidCommit/Reveal signers
6. **Crypto**: Updated `onboarding.ts` for 4-arg `register()` call
7. **Nullifier**: Fixed to use `agentId` + action type `1` (was `wallet` + `0`)

### Bug fixes applied on top:
1. **Double-reveal prevention**: Delete `bidCommit:` key after successful REVEAL (`actions.ts:503`)
2. **Late BID_COMMIT block**: Added `revealWindowDeadline > 0` check (`auction-room.ts:483`)
3. **TS fix**: Non-null assertion on `getSnarkjs()` return (`crypto.ts:39`)

## Verification

| Check | Result |
|-------|--------|
| Engine typecheck | PASS |
| Engine tests | 187 pass / 1 pre-existing fail |
| MCP server typecheck | PASS |
| Agent-client typecheck | PASS |
| snarkjs esbuild fix preserved | YES |
| No main work destroyed | YES (cherry-pick, not merge) |

## Commit
`0b767ec` — `feat(zk): cherry-pick critical ZK security fixes + sealed-bid commit-reveal`

## Follow-up items
- New trusted setup required for updated circuit before deployment
- `updateCommitment()` doesn't update Poseidon fields (incomplete rotation path)
- DO storage cache says "24h TTL" but has no expiry logic
