---
phase: quick-02
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - contracts/src/AgentPrivacyRegistry.sol
  - packages/crypto/src/onboarding.ts
  - packages/crypto/src/index.ts
  - packages/crypto/test/onboarding.test.ts
  - packages/crypto/scripts/onboard-agent.ts
  - packages/crypto/scripts/register-test-agents.ts
  - agent-client/src/privacy.ts
  - agent-client/src/zk.ts
  - mcp-server/src/lib/proof-generator.ts
  - engine/src/handlers/actions.ts
autonomous: true
requirements: [QUICK-02]

must_haves:
  truths:
    - "AgentPrivacyRegistry.register() accepts 3 args (agentId, poseidonRoot, capCommitment) not 4"
    - "No keccak256 registrationCommit field exists in the Agent struct"
    - "No updateCommitment() function exists in the contract"
    - "No registryRoot or commitments[] keccak256 Merkle tree exists in the contract"
    - "AgentPrivateState interface has no salt or registrationCommit fields"
    - "computeRegistrationCommit() function is fully removed from packages/crypto"
    - "All consumer ABIs match the new 3-arg register() signature"
    - "Engine fallback nullifier path uses only Poseidon-based derivation"
    - "forge test passes for contracts"
    - "packages/crypto tests pass"
  artifacts:
    - path: "contracts/src/AgentPrivacyRegistry.sol"
      provides: "Simplified all-Poseidon privacy registry"
      contains: "function register(uint256 agentId, bytes32 poseidonRoot, bytes32 capCommitment)"
    - path: "packages/crypto/src/onboarding.ts"
      provides: "Agent onboarding without keccak256 commitment"
    - path: "agent-client/src/privacy.ts"
      provides: "Privacy registration with 3-arg register()"
  key_links:
    - from: "packages/crypto/src/onboarding.ts"
      to: "contracts/src/AgentPrivacyRegistry.sol"
      via: "ABI call register(agentId, poseidonRoot, capCommitment)"
      pattern: "register\\(.*agentId.*poseidonRoot.*capCommitment"
    - from: "agent-client/src/privacy.ts"
      to: "contracts/src/AgentPrivacyRegistry.sol"
      via: "viem writeContract register"
      pattern: "functionName.*register"
---

<objective>
Remove the dead keccak256 `registrationCommit` system from the entire codebase and migrate to all-Poseidon registration.

Purpose: After the ZK security fixes cherry-pick (commit 917ad30), the engine uses per-agent Poseidon root cross-check. The keccak256 `registrationCommit` field, `updateCommitment()` function, `commitments[]` array, `registryRoot` keccak256 Merkle tree, and `salt` in `AgentPrivateState` are all dead weight. Removing them simplifies the contract, reduces gas costs, and eliminates a confusing dual-hash system.

Output: Clean all-Poseidon AgentPrivacyRegistry contract, simplified `AgentPrivateState` interface, updated consumers across agent-client, mcp-server, and engine.
</objective>

<execution_context>
@/Users/zengy/.claude/get-shit-done/workflows/execute-plan.md
@/Users/zengy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@contracts/src/AgentPrivacyRegistry.sol
@packages/crypto/src/onboarding.ts
@packages/crypto/src/index.ts
@packages/crypto/test/onboarding.test.ts
@agent-client/src/privacy.ts
@agent-client/src/zk.ts
@mcp-server/src/lib/proof-generator.ts
@engine/src/handlers/actions.ts

<interfaces>
<!-- Key types and contracts the executor needs. -->

From packages/crypto/src/onboarding.ts (CURRENT - to be modified):
```typescript
export interface AgentPrivateState {
  agentId: bigint;
  agentSecret: bigint;
  salt: bigint;                    // REMOVE
  capabilities: AgentCapability[];
  leafHashes: bigint[];
  capabilityMerkleRoot: bigint;
  registrationCommit: string;      // REMOVE
}

// REMOVE entirely:
export function computeRegistrationCommit(agentSecret: bigint, capabilityMerkleRoot: bigint, salt: bigint): string

// Current 4-arg ABI — change to 3-arg:
"function register(uint256 agentId, bytes32 commit, bytes32 poseidonRoot, bytes32 capCommitment) external"
```

From packages/crypto/src/index.ts (CURRENT exports to update):
```typescript
export { computeRegistrationCommit } from "./onboarding.js";  // REMOVE this export
```

From agent-client/src/privacy.ts (CURRENT ABI - to be updated):
```typescript
const privacyRegistryAbi = [
  { name: 'register', inputs: [
    { name: 'agentId', type: 'uint256' },
    { name: 'commit', type: 'bytes32' },   // REMOVE
  ] },
  // ... getRoot stays
]
```

From engine/src/handlers/actions.ts line 312-321 (legacy keccak fallback):
```typescript
// Legacy keccak fallback — REMOVE or simplify
const fallback = await deriveNullifier(
  toBytes(BigInt(action.agentId), { size: 32 }),
  toBytes(auctionId as `0x${string}`, { size: 32 }),
  1,
)
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove keccak256 from contract and packages/crypto (source of truth)</name>
  <files>
    contracts/src/AgentPrivacyRegistry.sol
    packages/crypto/src/onboarding.ts
    packages/crypto/src/index.ts
    packages/crypto/test/onboarding.test.ts
    packages/crypto/scripts/onboard-agent.ts
    packages/crypto/scripts/register-test-agents.ts
  </files>
  <action>
    **Contract (`contracts/src/AgentPrivacyRegistry.sol`):**
    1. Remove `registrationCommit` from `Agent` struct (keep `capabilityPoseidonRoot`, `capabilityCommitment`, `registeredAt`, `controller`)
    2. Remove `updateCommitment()` function entirely
    3. Change `register()` from 4 args `(agentId, commit, poseidonRoot, capCommitment)` to 3 args `(agentId, poseidonRoot, capCommitment)` — remove the `commit` parameter
    4. Inside `register()`: remove `registrationCommit: commit` from struct init, remove `commitments.push(commit)`, remove the `_updateRoot()` call
    5. Remove the `registryRoot` state variable (the keccak256 one — NOT the Poseidon roots)
    6. Remove the `commitments` array (both `bytes32[] private commitments` and any usage)
    7. Remove the `_updateRoot()` internal function entirely (keccak256 Merkle tree computation)
    8. Remove `getRoot()` function (returns the keccak256 registryRoot — dead)
    9. Remove `CommitmentUpdated` event, `RootUpdated` event
    10. Remove `NotController` error, `NotRegistered` error (only used by `updateCommitment`)
    11. Update `AgentRegistered` event: remove `commit` parameter → `event AgentRegistered(uint256 indexed agentId, bytes32 poseidonRoot, address controller)`
    12. Run `forge fmt` after changes

    **packages/crypto (`packages/crypto/src/onboarding.ts`):**
    1. Remove `computeRegistrationCommit()` function entirely
    2. Remove `registrationCommit` and `salt` fields from `AgentPrivateState` interface
    3. In `prepareOnboarding()`: remove `salt = generateSecret()`, remove `computeRegistrationCommit()` call, remove `salt` and `registrationCommit` from return object
    4. In `registerOnChain()`: change `registry.register()` call from 4 args `(agentId, registrationCommit, poseidonRootHex, capCommitmentHex)` to 3 args `(agentId, poseidonRootHex, capCommitmentHex)`
    5. Update `PRIVACY_REGISTRY_ABI` constant: change `register` function signature from 4 params to 3 params `(uint256 agentId, bytes32 poseidonRoot, bytes32 capCommitment)`. Also remove `agents()` view function or update its return tuple to remove `registrationCommit`. Remove `getRoot()` from ABI (it no longer exists on contract).
    6. Remove the `ethers.solidityPackedKeccak256` import/usage if it was only used for `computeRegistrationCommit` (check if ethers is still needed for other things like `randomBytes`, `zeroPadValue`, `toBeHex` — keep if so)

    **packages/crypto (`packages/crypto/src/index.ts`):**
    1. Remove `computeRegistrationCommit` from the exports list

    **packages/crypto (`packages/crypto/test/onboarding.test.ts`):**
    1. Remove `computeRegistrationCommit` from imports
    2. Remove entire `describe("computeRegistrationCommit", ...)` test block (lines 95-113)
    3. In `describe("prepareOnboarding", ...)`: remove `expect(state.salt).toBeGreaterThan(0n)` assertion, remove `expect(state.registrationCommit.startsWith("0x")).toBe(true)` assertion
    4. In the E2E test: remove `salt: state.salt` from `generateMembershipProof` call if it appears there (check — line 151 passes `salt: state.salt` but this is a circuit input, NOT the registration salt; verify whether the circuit's `salt` input is actually the same as the registration salt or a different value). Looking at the test: `generateMembershipProof` takes `salt` as an input — this may actually be a circuit-level salt, NOT the registration salt. Check the circuit inputs. If `generateMembershipProof` requires a `salt` parameter, keep it but source it from `generateSecret()` inline rather than from `state.salt` (since `state.salt` is removed). **IMPORTANT**: Read the `proof-generator.ts` in packages/crypto to understand if `salt` in membership proof is the same as the registration salt before removing.

    **Scripts:**
    - `packages/crypto/scripts/onboard-agent.ts`: Remove `registrationCommit` from console.log output (line 64) and from `stateJson` serialization (line 94). Remove `salt` from stateJson if present (line 90 stores `salt: privateState.salt.toString()` — remove).
    - `packages/crypto/scripts/register-test-agents.ts`: Remove `registrationCommit` from console.log (line 90-91). The `serializeState(state)` call auto-serializes the full state object — since `salt` and `registrationCommit` are removed from `AgentPrivateState`, they will naturally disappear from the JSON output.
  </action>
  <verify>
    <automated>cd /Volumes/MainSSD/HomeData/zengy/workspace/auction-design/contracts && forge build 2>&1 | tail -5</automated>
  </verify>
  <done>
    - AgentPrivacyRegistry.sol compiles with `forge build`
    - No `registrationCommit`, `updateCommitment`, `commitments`, `registryRoot`, `_updateRoot`, `getRoot` exist in contract
    - `register()` takes 3 args: `(agentId, poseidonRoot, capCommitment)`
    - `AgentPrivateState` has no `salt` or `registrationCommit` fields
    - `computeRegistrationCommit` function and export are fully removed
    - Test expectations updated to match new interface
    - Scripts updated to not reference removed fields
  </done>
</task>

<task type="auto">
  <name>Task 2: Update all consumers (agent-client, mcp-server, engine)</name>
  <files>
    agent-client/src/privacy.ts
    agent-client/src/zk.ts
    mcp-server/src/lib/proof-generator.ts
    engine/src/handlers/actions.ts
  </files>
  <action>
    **agent-client/src/privacy.ts:**
    1. Remove `computeRegistrationCommit as poseidonCommit` from imports (it no longer exists)
    2. Update `privacyRegistryAbi`: change `register` inputs from `[agentId, commit]` to `[agentId, poseidonRoot, capCommitment]` — add 2 new `bytes32` inputs for `poseidonRoot` and `capCommitment`, remove the `commit` input. The ABI was previously incomplete (only had agentId + commit, missing poseidonRoot + capCommitment). Fix it to match the new 3-arg contract.
    3. Remove `getRoot` from ABI (function removed from contract)
    4. In `preparePrivacyState()`: remove `salt = generatePoseidonSecret()`, remove `registrationCommit = poseidonCommit(...)` computation, remove `salt` and `registrationCommit` from return object. The function should still build the Poseidon Merkle tree and compute `capabilityMerkleRoot` (those stay).
    5. In `registerPrivacy()`: update `writeContract` call — change `args` from `[privateState.agentId, privateState.registrationCommit]` to `[privateState.agentId, poseidonRootHex, capCommitmentHex]` where `poseidonRootHex` is the `capabilityPoseidonRoot` padded to bytes32 and `capCommitmentHex` is Poseidon(capabilityId, agentSecret) padded to bytes32. Compute these the same way `registerOnChain()` in packages/crypto does (use `toHex` + `pad` from viem, or compute inline). Import `poseidonHash` from `@agent-auction/crypto` to compute the capability commitment.
    6. Remove `readRegistryRoot()` function (calls the removed `getRoot()`)
    7. Remove `type Hex` import from viem if no longer needed (check usage)

    **agent-client/src/zk.ts:**
    1. In `loadAgentState()`: remove `salt: deserializeBigInt(parsed.salt)` from the returned object (line 118)
    2. Remove `registrationCommit: parsed.registrationCommit as string` from the returned object (line 125)
    3. The `AgentPrivateState` type is re-exported from `@agent-auction/crypto` — once Task 1 removes `salt`/`registrationCommit` from that interface, this file will naturally align. But the deserialization lines must be removed to avoid assigning non-existent fields.
    4. Keep `usedNullifiers` handling as-is (not related to registration)

    **mcp-server/src/lib/proof-generator.ts:**
    1. In `loadAgentState()`: remove `salt: deserializeBigInt(parsed.salt)` from the returned object (line 64)
    2. Remove `registrationCommit: parsed.registrationCommit as string` from the returned object (line 71)
    3. Same rationale as agent-client/src/zk.ts — the interface no longer has these fields

    **engine/src/handlers/actions.ts:**
    1. In `handleJoin()` lines 302-321: remove the keccak256 fallback nullifier path entirely. The `else` branch (lines 312-321) that calls `deriveNullifier(toBytes(...), toBytes(...), 1)` should be removed.
    2. With `ENGINE_REQUIRE_PROOFS=true`, ZK proofs are mandatory, so a valid ZK nullifier is always available. If `hasZkNullifier` is false when proofs are required, throw an error instead of falling back to keccak.
    3. If proofs are NOT required (legacy mode), keep the existing Poseidon-based `deriveNullifier` fallback — this uses the Poseidon nullifier derivation from `../lib/crypto`, NOT keccak256. Looking at the code more carefully: `deriveNullifier` is imported from `../lib/crypto` which re-exports from `@agent-auction/crypto` — check if this is already Poseidon-based. If it IS already Poseidon-based (using poseidonHash internally), then the fallback is fine and does NOT use keccak256. In that case, keep the fallback as-is but remove the comment calling it "Legacy keccak fallback".
    4. Remove `toBytes` and `toHex` imports from viem if they are only used by the fallback path AND the fallback is removed. Check other usages first.
    5. Clean up variable declarations: if the fallback is kept, simplify the branching. If removed, the nullifier always comes from `membership.nullifier`.
  </action>
  <verify>
    <automated>cd /Volumes/MainSSD/HomeData/zengy/workspace/auction-design/engine && npm run typecheck 2>&1 | tail -10</automated>
  </verify>
  <done>
    - agent-client/src/privacy.ts calls 3-arg `register(agentId, poseidonRoot, capCommitment)` via updated ABI
    - agent-client/src/privacy.ts no longer computes or references `registrationCommit` or `salt`
    - agent-client/src/zk.ts and mcp-server/src/lib/proof-generator.ts do not deserialize `salt` or `registrationCommit`
    - engine/src/handlers/actions.ts has no keccak256 fallback nullifier (or the existing fallback is confirmed Poseidon-based and comment is corrected)
    - `npm run typecheck` passes in engine
    - No TypeScript errors from removed interface fields
  </done>
</task>

</tasks>

<verification>
1. `cd contracts && forge build` — contract compiles
2. `cd contracts && forge test` — all existing tests pass (no contract tests reference privacy registry directly)
3. `cd engine && npm run typecheck` — no type errors
4. `grep -r "registrationCommit" contracts/ packages/crypto/src/ agent-client/src/ mcp-server/src/ engine/src/` — returns zero matches
5. `grep -r "updateCommitment" contracts/ packages/crypto/ agent-client/ mcp-server/ engine/` — returns zero matches
6. `grep -r "computeRegistrationCommit" packages/crypto/src/ agent-client/src/ mcp-server/src/` — returns zero matches
7. `grep -r "getRoot" contracts/src/AgentPrivacyRegistry.sol` — returns zero matches (removed from contract; other contracts may still have getRoot)
</verification>

<success_criteria>
- Zero references to `registrationCommit`, `updateCommitment`, `computeRegistrationCommit`, or `getRoot` in AgentPrivacyRegistry
- AgentPrivacyRegistry.register() is a 3-arg function
- AgentPrivateState interface has no `salt` or `registrationCommit`
- All consumer ABIs updated to match new contract signature
- forge build, forge test, engine typecheck all pass
- Contract is ready for redeployment (contract-breaking change acknowledged)
</success_criteria>

<output>
After completion, create `.planning/quick/2-remove-keccak256-registrationcommit-and-/2-SUMMARY.md`
</output>
