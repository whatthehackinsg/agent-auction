# ZK & Cryptography Fix — Change Summary

This document explains every change made, the security flaw or design defect that motivated it, and what the code was changed to. Issues are grouped by phase.

---

## Phase 1 — Circuit Fixes

### 1a. Remove dead `salt` input from RegistryMembership circuit

**File:** `circuits/src/RegistryMembership.circom`

**Problem:** `signal input salt;` was declared but never used in any constraint. A signal with no constraints is a dead input — it contributes nothing to the proof and can be set to any value without changing validity. It adds unnecessary complexity to the circuit and the witness generation code, and misleads readers into thinking it has a security role.

**Changed from:** circuit declared `signal input salt;` (line 21)
**Changed to:** `salt` input removed entirely

**Also removed** from all TypeScript proof-generation call sites:
- `packages/crypto/src/proof-generator.ts` → `generateMembershipProof()`
- `agent-client/src/zk.ts` → `generateMembershipProofForAgent()`
- `mcp-server/src/lib/proof-generator.ts`

---

### 1b. Boolean-constrain `pathIndices` in RegistryMembership circuit

**File:** `circuits/src/RegistryMembership.circom`

**Problem:** `pathIndices[i]` is used to select left/right children in the Merkle path (`MerklePathSelector` mux). If a prover supplies a non-binary value (e.g. `2`), the mux arithmetic produces a garbage output that still satisfies the mux constraints — but the computed root will not match a real Merkle tree. This opens a potential soundness attack where a prover constructs fake path indices.

**Changed from:** no constraint on `pathIndices` values
**Changed to:** inside the `for` loop, added per-element constraint:
```circom
pathIndices[i] * (1 - pathIndices[i]) === 0;
```
This forces each `pathIndices[i]` to be 0 or 1. Adds ~20 constraints (~0.2% overhead). No change to the circuit's public/private input or output signature.

---

## Phase 2 — Contract: AgentPrivacyRegistry

**File:** `contracts/src/AgentPrivacyRegistry.sol`

### 2a. Add ERC-8004 ownership check to `register()`

**Problem:** Any EOA could call `register(agentId, ...)` for an `agentId` they do not own. This lets an attacker overwrite another agent's registration commitment with a malicious Poseidon tree — effectively stealing the agent's membership slot.

**Changed from:** `register()` had no caller validation
**Changed to:**
1. Added `IIdentityRegistry` interface (reads `ownerOf(agentId)` from ERC-8004 registry at `0x8004A818BFB912233c491871b3d84c89A494BD9e`)
2. Added `immutable identityRegistry` field set in constructor
3. First line of `register()` now reverts with `NotOwner(agentId)` if `msg.sender != identityRegistry.ownerOf(agentId)`

---

### 2b. Store Poseidon root and capability commitment on-chain

**Problem (ZKFN-01 / ZKFN-02):** The engine's membership proof verification was comparing the proof's `publicSignals[REGISTRY_ROOT]` against a **global keccak256 root** fetched from the contract. This comparison was wrong in two ways:
1. The proof's root is a **Poseidon Merkle root** (a field element, passed as a decimal string). The contract's `getRoot()` returned a **keccak256 hash** (bytes32 hex). These two values are never equal.
2. The engine's root fetch was shared across all agents. A proof built from agent A's tree would be tested against a root that mixes A's and B's data — meaningless.

The result: the root cross-check always failed for valid proofs and the engine silently ignored the failure (`// ZKFN-02: root check disabled`). Zero access control.

**Changed from:** `Agent` struct held only `registrationCommit` (keccak256 opaque blob)
**Changed to:** `Agent` struct extended with:
```solidity
bytes32 capabilityPoseidonRoot;   // Poseidon Merkle root of the agent's capability tree
bytes32 capabilityCommitment;     // Poseidon(capabilityId, agentSecret) — future cross-check
```

`register()` signature changed from 2 args to 4:
```solidity
function register(uint256 agentId, bytes32 commit, bytes32 poseidonRoot, bytes32 capCommitment) external
```

New public getters added:
```solidity
function getAgentPoseidonRoot(uint256 agentId) external view returns (bytes32)
function getAgentCapabilityCommitment(uint256 agentId) external view returns (bytes32)
```

---

## Phase 3 — Engine: Per-Agent Root Cross-Check

### 3a. Add per-agent Poseidon root ABI to chain-client

**File:** `engine/src/lib/chain-client.ts`

**Changed from:** `AgentPrivacyRegistryABI` only had `getRoot()` (global keccak root)
**Changed to:** Added `getAgentPoseidonRoot(uint256)(bytes32)` and `getAgentCapabilityCommitment(uint256)(bytes32)` to the ABI

---

### 3b. Add per-agent root lookup functions to identity module

**File:** `engine/src/lib/identity.ts`

**Changed from:** only `getPrivacyRegistryRoot()` (single global keccak root)
**Changed to:** Added `getAgentPoseidonRoot(agentId)` and `getAgentCapabilityCommitment(agentId)`:
- Read from DO storage cache (`poseidonRoot:{agentId}`)
- On miss: call `readContract` → `getAgentPoseidonRoot(agentId)` on-chain
- Convert bytes32 hex → BigInt → decimal string (matching proof's publicSignals format)
- Cache result in DO storage for subsequent calls

---

### 3c. Reinstate root cross-check in crypto module

**File:** `engine/src/lib/crypto.ts`

**Problem:** `verifyMembershipProof()` accepted an `expectedRegistryRoot` option but the comparison was disabled with the comment `// ZKFN-02: root check disabled`. This meant any proof with any root was accepted — the root public signal was ignored entirely.

**Changed from:** cross-check skipped unconditionally
**Changed to:** after `snarkjs.groth16.verify()` returns `valid=true`, if `options.expectedRegistryRoot` is provided:
```ts
const proofRoot = proofPayload.publicSignals[MEMBERSHIP_SIGNALS.REGISTRY_ROOT]
if (proofRoot !== options.expectedRegistryRoot) {
  return { valid: false, ... }
}
```
The expected root is now the **per-agent decimal Poseidon root** from the contract — same format as the proof's public signal, so the comparison is correct.

---

### 3d. Wire per-agent root into JOIN handler

**File:** `engine/src/handlers/actions.ts`

**Changed from:** `handleJoin()` passed no `expectedRegistryRoot` to `verifyMembershipProof()` (or passed the wrong global keccak root)

**Changed to:**
1. Before calling `verifyMembership()`, fetch the agent's Poseidon root: `getAgentPoseidonRoot(action.agentId)` (uses DO storage cache, then on-chain)
2. Pass it as `options.expectedRegistryRoot`

This closes the critical ZKFN-01/02 gap: a proof built from a self-constructed tree will fail because its root won't match the on-chain registered root for that `agentId`.

---

### 3e. Remove stale global root fetch from auction-room

**File:** `engine/src/auction-room.ts`

**Changed from:** `handleAction()` called `getPrivacyRegistryRoot()` and populated `ValidationContext.expectedRegistryRoot` with the global keccak root (wrong format, wrong scope)
**Changed to:** that call removed; `ValidationContext` no longer sets `expectedRegistryRoot` at the room level — the per-agent root is fetched directly inside `handleJoin()`

---

### 3f. Fix legacy nullifier derivation

**Files:** `engine/src/handlers/actions.ts` (fallback path), `mcp-server/src/lib/signer.ts`

**Problem:** The legacy (non-ZK) nullifier was computed as `keccak256(walletAsUint256, auctionId, 0)`. Two bugs:
1. Used the **wallet address** instead of **agentId** — the wallet can change (ERC-8004 allows re-keying), so nullifiers would differ across re-registrations
2. Used action type `0` — but `ActionType.JOIN = 1` in the crypto package, so the engine and client computed different nullifiers, causing rejection

**Changed from:**
- `deriveJoinNullifier(wallet: Address, auctionId: Hex)` — encodes `[wallet, auctionId, 0n]`

**Changed to:**
- `deriveJoinNullifier(agentId: bigint, auctionId: Hex)` — encodes `[agentId, auctionId, 1n]`

Both the engine's fallback and the signer now use the same formula.

---

## Phase 4 — Sealed-Bid Commit-Reveal

### 4a. New action types: BID_COMMIT and REVEAL

**File:** `engine/src/types/engine.ts`

**Why:** Sealed-bid auctions require a two-phase protocol where bid amounts are never revealed during the open phase. This prevents late-bidder sniping and removes the incentive to monitor competitors' bids.

**Changed from:** `ActionType` had `JOIN`, `BID`, `DELIVER`, `WITHDRAW`
**Changed to:** added `BID_COMMIT = 'BID_COMMIT'` and `REVEAL = 'REVEAL'`

---

### 4b. BID_COMMIT handler

**File:** `engine/src/handlers/actions.ts`

**Why:** Agents must commit to `Poseidon(bid, salt)` during the open phase without revealing the bid amount.

**Added:** `handleBidCommit()`:
1. Verifies `BidCommit` EIP-712 signature
2. Verifies BidRange ZK proof (required in sealed mode — proves `reservePrice ≤ bid ≤ maxBid` without revealing `bid`)
3. Stores `bidCommit:{agentId}` in DO storage
4. Does not emit the plaintext amount in the event log

---

### 4c. REVEAL handler

**File:** `engine/src/handlers/actions.ts`

**Why:** Agents must prove their reveal matches the commitment during the reveal window.

**Added:** `handleReveal()`:
1. Verifies `Reveal` EIP-712 signature
2. Checks auction is in REVEAL_WINDOW phase
3. Loads stored `bidCommit:{agentId}` from DO storage
4. Computes `Poseidon(action.bid, action.salt)` and verifies it equals the stored commitment (via `computeRevealCommitment`)
5. Updates `highestBid` / `highestBidder` from revealed bids

---

### 4d. Sealed-bid state machine in auction-room

**File:** `engine/src/auction-room.ts`

**Why:** The alarm-based auction lifecycle needed a second alarm for the reveal window.

**Added:** 3 new DO storage keys (`sealedBid`, `revealWindowSec`, `revealWindowDeadline`) and state machine logic:
- Alarm fires at `deadline` → for sealed-bid: open reveal window, set second alarm at `revealWindowDeadline`
- Alarm fires at `revealWindowDeadline` → close auction, determine winner from REVEAL events
- BID actions rejected in sealed mode (only BID_COMMIT accepted during OPEN)
- REVEAL accepted only while `revealWindowDeadline > 0 && now <= revealWindowDeadline`
- `closeAuction()` now counts both BID and REVEAL events when determining winner

---

### 4e. EIP-712 BidCommit and Reveal signers in MCP server

**File:** `mcp-server/src/lib/signer.ts`

**Why:** Agents need to sign BID_COMMIT and REVEAL actions with correct EIP-712 typed data.

**Added:**
- `signBidCommit()` — signs `BidCommit` typed data with `encryptedBidHash` and `zkRangeProofHash` as zero bytes32 (future fields, not yet implemented; both signer and engine use zeroes to ensure consistency)
- `signReveal()` — signs `Reveal` typed data (no `deadline` field — by protocol design, reveals must be accepted in a time window without a per-message deadline)

---

### 4f. Sealed-bid mode in `place_bid` MCP tool

**File:** `mcp-server/src/tools/bid.ts`

**Why:** AI agents using the MCP tool needed a way to participate in sealed-bid auctions.

**Added:**
- `sealed: boolean` optional input — triggers BID_COMMIT path
- `salt: string` optional input — provide your own salt, or omit to auto-generate via `generateSecret()`
- Computes `bidCommitment = Poseidon(bid, salt)` before calling `signBidCommit()`
- Returns `revealSalt` in the response with a note to save it for the reveal window

---

### 4g. New `reveal_bid` MCP tool

**File:** `mcp-server/src/tools/reveal.ts` (new file)

**Why:** Agents need to reveal their sealed bids during the reveal window.

**Inputs:** `auctionId`, `bid` (plaintext, must match commitment), `salt` (returned from `place_bid`)
**Action:** Signs `Reveal` EIP-712 message and POSTs REVEAL action to engine

Registered in `mcp-server/src/index.ts`.

---

## Phase 5 — onboarding.ts Registration Update

**File:** `packages/crypto/src/onboarding.ts`

**Why:** `registerOnChain()` called the old 2-argument `register(agentId, commit)`. It now needs to pass `poseidonRoot` and `capabilityCommitment` to the new 4-argument signature.

**Changed from:** `registry.register(agentId, commit)`
**Changed to:** `registry.register(agentId, commit, poseidonRootHex, capCommitmentHex)`

Where:
- `poseidonRootHex` = `prepareOnboarding().capabilityMerkleRoot` converted to 32-byte hex
- `capCommitmentHex` = `Poseidon(capabilityId, agentSecret)` converted to 32-byte hex

The `PRIVACY_REGISTRY_ABI` constant was also updated to reflect the new 4-argument function signature.

---

## Test Results (Post-Fix)

```
Engine tests: 184 pass / 1 fail (pre-existing — bond-watcher deprecated stub)
packages/crypto tests: 56 pass (requires rebuilt dist/)
contracts tests: not run (Foundry not installed in this environment)
```

The single `bond-watcher.test.ts` failure is unrelated to ZK changes: `pollAndRecordBondTransfers` intentionally returns `0` (the function is deprecated in favour of `verifyBondFromReceipt`).

---

## Security Impact Summary

| # | Issue | Severity | Status |
|---|---|---|---|
| 1 | Engine accepted any proof root (ZKFN-02 disabled) | **Critical** | Fixed — per-agent root cross-check reinstated |
| 2 | Sealed-bid not implemented (plaintext bids leaked) | **Critical** | Fixed — BID_COMMIT + REVEAL handlers added |
| 3 | Dead `salt` input in circuit | High | Fixed — removed |
| 4 | Anyone could overwrite another agent's registration | High | Fixed — ERC-8004 ownership check added |
| 5 | Global keccak root vs per-agent Poseidon root mismatch | High | Fixed — per-agent Poseidon root stored and compared |
| 6 | capabilityCommitment not verified by engine | Medium | Partially fixed — stored on-chain, engine can verify |
| 7 | `pathIndices` not boolean-constrained | Medium | Fixed — `x*(1-x)===0` constraint added |
| 8 | Legacy nullifier used wallet instead of agentId, type 0 | Medium | Fixed — agentId + type=1 in both signer and engine |
