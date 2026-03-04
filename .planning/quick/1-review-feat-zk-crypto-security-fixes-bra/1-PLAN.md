---
title: "Cherry-pick ZK crypto security fixes from feat/zk-crypto-security-fixes"
mode: quick
tasks: 1
---

# Quick Task 1: Cherry-pick and fix ZK security branch

## Context

Branch `origin/feat/zk-crypto-security-fixes` (commit `917ad30`) contains critical ZK security fixes:
- Remove dead `salt` input from RegistryMembership circuit
- Add `pathIndices` boolean constraint
- ERC-8004 ownership check on `register()`
- Per-agent Poseidon root cross-check (fixes ZKFN-02)
- Sealed-bid commit-reveal (BID_COMMIT + REVEAL)
- Nullifier derivation fix

Cherry-pick was chosen over merge to avoid destroying 20 commits of work on main.

## Task 1: Commit cherry-picked changes with bug fixes

**Status**: Code already applied and verified

### What was done (pre-plan):
1. Cherry-picked `917ad30` onto main (clean, no conflicts)
2. Fixed double-reveal bug: delete `bidCommit:` key after successful REVEAL in `actions.ts`
3. Fixed late BID_COMMIT bug: added `revealWindowDeadline > 0` check in `auction-room.ts`
4. Fixed TS null assertion on `getSnarkjs()` return in `crypto.ts`

### Verification completed:
- `engine typecheck`: PASS
- `engine tests`: 187 pass / 1 pre-existing fail (bond-watcher, unrelated)
- `mcp-server typecheck`: PASS
- `agent-client typecheck`: PASS
- snarkjs esbuild fix (`67cad2e`) preserved — `['snark', 'js'].join('')` still intact

### Files changed:
- `circuits/src/RegistryMembership.circom`
- `contracts/src/AgentPrivacyRegistry.sol`
- `engine/src/auction-room.ts` (+ late BID_COMMIT fix)
- `engine/src/handlers/actions.ts` (+ double-reveal fix)
- `engine/src/lib/crypto.ts` (+ TS null assertion fix)
- `engine/src/lib/identity.ts`
- `engine/src/lib/chain-client.ts`
- `engine/src/types/engine.ts`
- `mcp-server/src/index.ts`
- `mcp-server/src/lib/signer.ts`
- `mcp-server/src/lib/proof-generator.ts`
- `mcp-server/src/tools/bid.ts`
- `mcp-server/src/tools/reveal.ts` (new)
- `packages/crypto/src/onboarding.ts`
- `packages/crypto/src/proof-generator.ts`
- `agent-client/src/zk.ts`
- `docs/zk-fix-changes.md` (new)
- `docs/zk-fix-deployment-steps.md` (new)

### Action:
Commit all staged changes with descriptive message.

### Known follow-up items (not in scope):
- New trusted setup required for updated circuit (ops task)
- `updateCommitment()` doesn't update Poseidon fields
- Cache TTL comment says 24h but has no expiry logic
