---
phase: quick-02
plan: 01
subsystem: contracts, crypto, engine
tags: [poseidon, keccak256, zk, privacy-registry, solidity, typescript]

# Dependency graph
requires:
  - phase: quick-01
    provides: ZK crypto security fixes cherry-pick with per-agent Poseidon root cross-check
provides:
  - All-Poseidon AgentPrivacyRegistry contract (no keccak256 registrationCommit)
  - Simplified 3-arg register(agentId, poseidonRoot, capCommitment) on-chain interface
  - Clean AgentPrivateState interface without salt or registrationCommit
  - Updated consumer ABIs across agent-client, mcp-server, engine
affects: [contracts, engine, agent-client, mcp-server, packages/crypto]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - All-Poseidon privacy commitment (no dual keccak256/Poseidon hash system)
    - Per-agent Poseidon root reads replace global keccak256 Merkle root

key-files:
  created: []
  modified:
    - contracts/src/AgentPrivacyRegistry.sol
    - contracts/script/Deploy.s.sol
    - contracts/script/DeployPrivacyRegistry.s.sol
    - packages/crypto/src/onboarding.ts
    - packages/crypto/src/index.ts
    - packages/crypto/test/onboarding.test.ts
    - packages/crypto/scripts/onboard-agent.ts
    - packages/crypto/scripts/register-test-agents.ts
    - agent-client/src/privacy.ts
    - agent-client/src/zk.ts
    - mcp-server/src/lib/proof-generator.ts
    - engine/src/handlers/actions.ts
    - engine/src/index.ts
    - engine/src/lib/chain-client.ts
    - engine/src/lib/identity.ts

key-decisions:
  - "Deploy scripts fixed to pass identityRegistry to constructor (pre-existing bug exposed by forge build)"
  - "fetchRegistryRoot() changed to read per-agent Poseidon root via getAgentPoseidonRoot(agentId) instead of removed global getRoot()"
  - "Engine fallback nullifier confirmed already Poseidon-based (not keccak256) - kept with corrected comment"
  - "/verify-identity endpoint returns poseidonRoot per-agent instead of removed global privacyRoot"
  - "agent-client/privacy.ts now computes proper Poseidon leaf hashes (computeLeaf) instead of using capabilityId as placeholder"

patterns-established:
  - "All-Poseidon: AgentPrivacyRegistry has zero keccak256 usage, only Poseidon roots and commitments"
  - "Per-agent root pattern: consumers read getAgentPoseidonRoot(agentId) not global getRoot()"

requirements-completed: [QUICK-02]

# Metrics
duration: 9min
completed: 2026-03-04
---

# Quick Task 2: Remove keccak256 registrationCommit and Migrate to All-Poseidon Summary

**Stripped dead keccak256 registration system from AgentPrivacyRegistry, simplified register() to 3-arg all-Poseidon interface, updated 15 files across contracts/crypto/engine/agent-client/mcp-server**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-04T13:08:40Z
- **Completed:** 2026-03-04T13:17:35Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- AgentPrivacyRegistry contract simplified from 139 lines to ~65 lines: removed registrationCommit from Agent struct, updateCommitment(), commitments[] array, registryRoot state var, _updateRoot() Merkle computation, getRoot(), CommitmentUpdated/RootUpdated events, NotController/NotRegistered errors
- register() simplified from 4 args to 3 args: `(agentId, poseidonRoot, capCommitment)` - no more keccak256 commit parameter
- All consumers updated: agent-client uses viem pad/toHex for bytes32 encoding, mcp-server and agent-client fetchRegistryRoot now reads per-agent Poseidon root, engine ABI and identity module cleaned up
- All 144 contract tests pass, engine/mcp-server/agent-client type checks all clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove keccak256 from contract and packages/crypto** - `b6c6ad0` (feat)
2. **Task 2: Update all consumers (agent-client, mcp-server, engine)** - `ab47d35` (feat)

## Files Created/Modified

- `contracts/src/AgentPrivacyRegistry.sol` - Simplified all-Poseidon contract, removed 6 functions/vars
- `contracts/script/Deploy.s.sol` - Fixed constructor call to pass identityRegistry
- `contracts/script/DeployPrivacyRegistry.s.sol` - Fixed constructor + added IDENTITY_REGISTRY env var
- `packages/crypto/src/onboarding.ts` - Removed computeRegistrationCommit, salt, readRegistryRoot, updated ABI
- `packages/crypto/src/index.ts` - Removed computeRegistrationCommit and readRegistryRoot exports
- `packages/crypto/test/onboarding.test.ts` - Removed keccak256 test block, updated assertions
- `packages/crypto/scripts/onboard-agent.ts` - Removed registrationCommit/salt from output, removed readRegistryRoot verification step
- `packages/crypto/scripts/register-test-agents.ts` - Removed registrationCommit log, removed readRegistryRoot verification
- `agent-client/src/privacy.ts` - Rewrote with 3-arg register ABI, proper Poseidon leaf computation, removed salt/registrationCommit
- `agent-client/src/zk.ts` - Removed salt/registrationCommit deserialization, fetchRegistryRoot reads per-agent root
- `mcp-server/src/lib/proof-generator.ts` - Removed salt/registrationCommit deserialization, fetchRegistryRoot reads per-agent root
- `engine/src/lib/chain-client.ts` - Removed getRoot from agentPrivacyRegistryAbi
- `engine/src/lib/identity.ts` - Removed getPrivacyRegistryRoot()
- `engine/src/index.ts` - /verify-identity uses getAgentPoseidonRoot instead of global root
- `engine/src/handlers/actions.ts` - Corrected fallback comment (was already Poseidon, not keccak)

## Decisions Made

- **Deploy scripts fixed**: Constructor already required `_identityRegistry` but deploy scripts passed 0 args (pre-existing bug exposed by forge build). Fixed as Rule 3 auto-fix.
- **fetchRegistryRoot signature preserved**: Added optional `agentId` parameter instead of breaking callers. Reads `getAgentPoseidonRoot(agentId)` on-chain.
- **Engine fallback nullifier kept**: Confirmed `deriveNullifier` already uses Poseidon (not keccak256). Corrected misleading "Legacy keccak fallback" comment to "Poseidon-based fallback".
- **/verify-identity API changed**: Returns `poseidonRoot` (per-agent) instead of `privacyRoot` (global, removed). Field name changed from `privacyRoot` to `poseidonRoot`.
- **agent-client/privacy.ts leaf computation fixed**: Previously used `capabilityIds.map((id) => id)` as placeholder leaves; now uses proper `computeLeaf(capabilityId, agentSecret, leafIndex)` matching the circuit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed deploy scripts missing constructor arg**
- **Found during:** Task 1 (contract compilation)
- **Issue:** `Deploy.s.sol` and `DeployPrivacyRegistry.s.sol` called `new AgentPrivacyRegistry()` with 0 args but constructor requires `address _identityRegistry` (pre-existing bug)
- **Fix:** Deploy.s.sol passes `identityRegistry` local variable; DeployPrivacyRegistry.s.sol reads `IDENTITY_REGISTRY` env var
- **Files modified:** `contracts/script/Deploy.s.sol`, `contracts/script/DeployPrivacyRegistry.s.sol`
- **Verification:** `forge build` passes
- **Committed in:** b6c6ad0 (Task 1 commit)

**2. [Rule 3 - Blocking] Removed getPrivacyRegistryRoot from engine identity module**
- **Found during:** Task 2 (engine typecheck)
- **Issue:** `engine/src/lib/identity.ts` called `agentPrivacyRegistry.read.getRoot()` which no longer exists in ABI
- **Fix:** Removed `getPrivacyRegistryRoot()` function, updated `/verify-identity` endpoint to use `getAgentPoseidonRoot(agentId)` instead
- **Files modified:** `engine/src/lib/identity.ts`, `engine/src/index.ts`
- **Verification:** `npm run typecheck` passes
- **Committed in:** ab47d35 (Task 2 commit)

**3. [Rule 3 - Blocking] Updated fetchRegistryRoot to use per-agent Poseidon root**
- **Found during:** Task 2 (mcp-server/agent-client typecheck)
- **Issue:** Both files imported removed `readRegistryRoot` from `@agent-auction/crypto`
- **Fix:** Replaced with inline ethers call to `getAgentPoseidonRoot(agentId)` on AgentPrivacyRegistry
- **Files modified:** `agent-client/src/zk.ts`, `mcp-server/src/lib/proof-generator.ts`
- **Verification:** `npx tsc --noEmit` passes for both
- **Committed in:** ab47d35 (Task 2 commit)

**4. [Rule 1 - Bug] Fixed agent-client privacy.ts leaf computation**
- **Found during:** Task 2 (rewriting privacy.ts)
- **Issue:** `preparePrivacyState()` used `capabilityIds.map((id) => id)` as leaf hashes (raw IDs, not Poseidon hashes), producing incorrect Merkle roots
- **Fix:** Now uses `computeLeaf(capabilityId, agentSecret, leafIndex)` matching the circuit
- **Files modified:** `agent-client/src/privacy.ts`
- **Verification:** Type check passes, computation matches `packages/crypto/src/onboarding.ts` pattern
- **Committed in:** ab47d35 (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (1 bug, 3 blocking)
**Impact on plan:** All auto-fixes necessary for correctness and compilation. No scope creep.

## Issues Encountered

- packages/crypto `npm run build` shows pre-existing type errors (snarkjs types, ethers Uint8Array incompatibility) but successfully generates `.d.ts` files. These pre-date this task and are documented in STATE.md as out of scope.

## User Setup Required

None - no external service configuration required. Note: contract requires redeployment on Base Sepolia since the ABI changed (contract-breaking change).

## Next Phase Readiness

- Contract ready for redeployment (3-arg register, no keccak256 state)
- All TypeScript consumers aligned with new ABI
- Existing test-agents JSON files still contain `salt` and `registrationCommit` fields that will be ignored by updated deserializers (harmless forward compat)

## Self-Check: PASSED

All 10 key files verified present. Both task commits (b6c6ad0, ab47d35) verified in git log.

---
*Quick Task: quick-02*
*Completed: 2026-03-04*
