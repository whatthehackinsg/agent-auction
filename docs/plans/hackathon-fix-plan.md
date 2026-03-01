# Hackathon Fix Plan — Agent Auction

## Context
7 fixes to ship before the Chainlink 2026 Hackathon. The platform works E2E (CRE settlement confirmed on Base Sepolia), but has dead code, a broken ZK privacy layer, and reliability gaps that would hurt the demo. These fixes make the codebase honest, secure, and demo-ready.

---

## Step 1: Remove Unused EIP-4337 Smart Wallets
**Effort: Small | Why: Dead code confuses judges**

`AgentAccount.sol`, `AgentAccountFactory.sol`, `AgentPaymaster.sol` are deployed but never used — auction flow runs entirely on EOA wallets.

**Changes:**
- `contracts/src/AgentAccount.sol` → move to `contracts/src/deprecated/`
- `contracts/src/AgentAccountFactory.sol` → move to `contracts/src/deprecated/`
- `contracts/src/AgentPaymaster.sol` → move to `contracts/src/deprecated/`
- `contracts/script/Deploy.s.sol` → remove 4337 contract deployment steps
- `contracts/script/HelperConfig.s.sol` → remove 4337 config (entryPoint, paymaster addresses)
- `engine/src/lib/onboard.ts` → remove (creates smart wallets, unused by demo)
- `engine/src/index.ts` → remove `/onboard` route and onboard import
- `agent-client/src/index.ts` → remove smart wallet creation, keep EOA-only flow
- `CLAUDE.md` → remove AgentAccountFactory/AgentPaymaster from deployed addresses table
- `deployments/base-sepolia.json` → move 4337 entries to a `deprecated` section
- Update any tests that import 4337 contracts (check `contracts/test/`)

**Verify:** `forge build` compiles, `forge test` passes (may need to remove/update 4337-specific tests)

---

## Step 2: Add Access Control to MockIdentityRegistry
**Effort: Small | Why: Prevents "anyone can steal funds" attack**

`MockIdentityRegistry.register()` is open — anyone can register as owner of any agentId and call `withdraw()` on AuctionEscrow to steal funds.

**Changes:**
- `contracts/src/mocks/MockIdentityRegistry.sol`:
  - Add `address public admin` state variable (set in constructor to `msg.sender`)
  - Add `modifier onlyAdmin()`
  - Apply `onlyAdmin` to `register()` and `registerWithId()`
- `contracts/test/` → update any tests that call `register()` to use the admin address (prank)

**Verify:** `forge test` — all 113+ tests still pass

---

## Step 3: Fix Hash Mismatch (Trust the Proof)
**Effort: Medium | Why: Unblocks ZK working end-to-end**

Engine computes keccak256 nullifiers, circuits compute Poseidon nullifiers — they never match. Fix: engine stops computing nullifiers and trusts the ZK-proven nullifier from the agent.

**Changes:**
- `engine/src/lib/crypto.ts`:
  - Remove `deriveNullifier()` function (keccak256-based, lines ~72-96)
  - Keep `verifyMembershipProof()` — it already returns the nullifier from proof public signals
  - Update `computePayloadHash()` to accept nullifier (bytes32) instead of agentId (uint256)
- `engine/src/handlers/actions.ts`:
  - JOIN handler: get nullifier from `verifyMembershipProof()` return value, not from `deriveNullifier()`
  - BID handler: get nullifier from action request (agent includes it)
  - Store nonces as `nonce:{nullifier}:{actionType}` instead of `nonce:{agentId}:{actionType}`
- `agent-client/src/auction.ts`:
  - `joinAuction()`: compute Poseidon nullifier locally using `packages/crypto` (has circomlibjs)
  - `deriveJoinNullifier()`: replace keccak256 version with Poseidon version (import from packages/crypto)
  - Include nullifier in action request payload

**Verify:** Engine crypto tests pass, agent-client can generate and send nullifier that engine accepts

---

## Step 4: Mandatory ZK + Hide Identity Behind Nullifiers
**Effort: Large | Why: Core privacy differentiator actually works**

This is the biggest change — replace plaintext agentId with nullifier throughout the off-chain pipeline. On-chain contracts keep agentId (needed for ERC-8004 ownership).

### 4a. Engine Types
- `engine/src/types/engine.ts`:
  - `ActionRequest`: remove `agentId`, add `nullifier: string`, make `proof` required (not optional)
  - `ValidatedAction`: replace `agentId` with `nullifier`
  - `AuctionEvent`: replace `agentId` with `nullifier`
  - `RoomSnapshot`: `highestBidder` stores nullifier

### 4b. Engine Handlers
- `engine/src/handlers/actions.ts`:
  - `handleJoin()`: require proof !== null, verify proof, extract nullifier from public signals
  - `handleBid()`: identify agent by nullifier from request
  - `handleDeliver()`: identify agent by nullifier
  - All nonce keys: `nonce:{nullifier}:{actionType}`
  - All validation mutations: use nullifier

### 4c. Engine Auction Room
- `engine/src/auction-room.ts`:
  - `highestBidder`: stores nullifier string
  - `ingestAction()`: event object uses nullifier field
  - D1 INSERT: `nullifier` column instead of `agent_id`
  - Winner determination: track winning nullifier
  - `closeAuction()`: sequencer maps winning nullifier → agentId for on-chain settlement (private mapping stored in DO storage during JOIN: `identity:{nullifier} = agentId`)
  - WebSocket broadcast: sends nullifier, never agentId

### 4d. Engine Crypto
- `engine/src/lib/crypto.ts`:
  - `verifyMembershipProof()`: remove `if (proofPayload == null) return valid:true` bypass
  - Return nullifier from proof's publicSignals[2]
  - `computePayloadHash()`: encode nullifier (bytes32) instead of agentId (uint256)

### 4e. Replay Bundle
- `engine/src/lib/replay-bundle.ts`:
  - Replace `agent_id=${fmtU256(BigInt(e.agentId))}` with `nullifier=${fmtHex(e.nullifier, 64)}`

### 4f. Bond Watcher
- `engine/src/lib/bond-watcher.ts`:
  - Track bonds by nullifier instead of agentId
  - `enforceJoinBondObservation()`: accept nullifier param
  - D1 bond_observations table: use nullifier column

### 4g. Database Schema
- `engine/schema.sql`:
  - `events` table: rename `agent_id` to `nullifier`
  - `bond_observations` table: rename `agent_id` to `nullifier`
- New migration: `engine/migrations/0002_nullifier_identity.sql`

### 4h. Agent Client
- `agent-client/src/auction.ts`:
  - `joinAuction()`: generate real ZK membership proof using `packages/crypto`, include in payload
  - `placeBid()`: include nullifier in payload (same nullifier derived from agentSecret + auctionId)
  - Remove plaintext agentId from action payloads
  - Keep agentId only for bond deposit (on-chain needs it) and settlement reveal

### 4i. Settlement Reveal (Commit-Reveal)
- At JOIN time: sequencer stores private mapping `identity:{nullifier} → {agentId, wallet}` in DO storage
- At settlement: sequencer reads the winner's nullifier → looks up agentId → calls `recordResult()` with real agentId
- Only the winner's identity is revealed, and only at settlement time
- Other participants remain anonymous (identified only by nullifier)

### 4j. Frontend
- `frontend/src/app/auctions/[id]/page.tsx`: leaderboard shows truncated nullifier (`0xabc1...ef23`)
- `frontend/src/hooks/useAuctionRoom.ts`: AuctionRoomEvent uses nullifier field
- `frontend/src/lib/replay.ts`: ReplayEvent uses nullifier
- Agent profile page: only accessible to the agent themselves (match by wallet signature)

**Verify:**
- `forge test` passes (contracts unchanged for this step)
- Engine handles JOIN with real proof, stores nullifier
- Agent-client generates proof and joins successfully
- Replay bundle contains nullifiers, not agentIds
- Settlement reveals only winner's agentId on-chain

---

## Step 5: Settlement Retry Fallback
**Effort: Small | Why: Auctions don't get stuck during demo**

After 5 failed retries, settlement is silently abandoned. Funds locked forever.

**Changes:**
- `engine/src/auction-room.ts`:
  - After max retries: broadcast `SETTLEMENT_FAILED` event on WebSocket
  - Add `handleRetrySettlement()` method for manual retry
- `engine/src/index.ts`:
  - Add route `POST /admin/auctions/:id/retry-settlement` → forwards to DO
- `engine/src/auction-room.ts` fetch handler:
  - Add `/retry-settlement` path → resets retry counter, re-triggers `closeAuction()`

**Verify:** Manually trigger retry via curl, confirm settlement completes

---

## Step 6: Wire x402 or Remove
**Effort: Small | Why: No dead code in demo**

x402 policy code is fully implemented but middleware is never applied to HTTP routes.

**Decision needed: wire in or remove?**

**If wire in:**
- `engine/src/index.ts` → apply `applyX402Gate` middleware to `/auctions/:id/manifest` and `/auctions/:id/events` routes

**If remove:**
- Delete `engine/src/lib/x402-policy.ts`
- Delete `engine/src/middleware/x402.ts`
- Remove x402 imports from `engine/src/index.ts`
- Delete `engine/test/x402-policy.test.ts`
- Remove x402 dependencies from `engine/package.json`

**Verify:** `npm run build` in engine, confirm no import errors

---

## Step 7: AgentPrivacyRegistry Cleanup
**Effort: Small | Why: Bundle with ZK fix**

`AgentPrivacyRegistry.sol` is deployed but unused. With the ZK fix (Step 4), we should either wire it in or remove it.

**If wiring in (recommended — strengthens ZK story):**
- Engine populates Merkle root on-chain when agents register
- ZK circuits verify membership against on-chain root
- `agent-client` calls `AgentPrivacyRegistry.register()` during onboarding

**If removing:**
- Move to `contracts/src/deprecated/`
- Remove from `Deploy.s.sol`
- Remove from `deployments/base-sepolia.json`

**Verify:** `forge build` compiles, deployment scripts work

---

## Execution Order & Dependencies

```
Step 1 (Remove 4337)          ← independent, do first
Step 2 (MockIdentity ACL)     ← independent, do second
Step 3 (Hash mismatch)        ← unblocks Step 4
Step 4 (Mandatory ZK + hide)  ← depends on Step 3, largest change
Step 5 (Settlement retry)     ← independent
Step 6 (x402 decision)        ← independent
Step 7 (PrivacyRegistry)      ← bundle with Step 4
```

Steps 1, 2, 5, 6 can run in parallel (independent).
Step 3 must complete before Step 4.
Step 7 should be done alongside Step 4.

## Verification Checklist
- [ ] `forge build` — contracts compile
- [ ] `forge test` — all contract tests pass
- [ ] Engine builds (`npm run build` in engine/)
- [ ] Engine tests pass (`npm test` in engine/)
- [ ] Agent-client demo runs E2E: onboard → create auction → join with ZK proof → bid → close → settle
- [ ] Frontend shows nullifiers in leaderboard (not agentIds)
- [ ] Replay bundle contains nullifiers
- [ ] Settlement reveals only winner's agentId on-chain
