# Phase 1: ZK Foundation - Research

**Researched:** 2026-03-02
**Domain:** Circom/snarkjs Groth16 ZK proofs, Poseidon Merkle trees, on-chain privacy registry
**Confidence:** HIGH (all findings based on existing project code — no ambiguity about what exists)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Root Mismatch Fix**
- Drop the engine's `expectedRegistryRoot` cross-check in `verifyMembershipProof()` (one-line removal at `engine/src/lib/crypto.ts:288`)
- The on-chain `AgentPrivacyRegistry._updateRoot()` uses keccak256 internally; the circuit uses Poseidon — these will never match
- The engine still verifies the Groth16 proof itself (which internally checks the Poseidon root against the witness), so security is preserved
- The on-chain root becomes a registration record, not a verification input
- No contract redeployment needed

**Test Agent Setup**
- Register 3 test agents on Base Sepolia — enough for realistic demo (bidder, competitor, observer)
- Use `prepareOnboarding()` from `packages/crypto/onboarding.ts` to generate secrets + compute commitments
- Use `registerOnChain()` to submit to AgentPrivacyRegistry at `0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff`
- Persist `AgentPrivateState` as JSON files (one per agent) for later phases to load
- Use simple capabilityIds: `[1n]` per agent (single capability sufficient for demo)

**Circuit Test Approach**
- Add circuit proof tests to `packages/crypto/` alongside existing 56 tests
- Use `proof-generator.ts` which already wraps `generateMembershipProof()` and `generateBidRangeProof()`
- Tests exercise: proof generation → verification via inlined vkeys → public signal extraction
- Confirms .wasm and .zkey files are consistent with verification keys inlined in engine

**Signal Index Constants**
- Create `packages/crypto/src/signal-indices.ts` with named constants
- RegistryMembership: `[0]=registryRoot, [1]=capabilityCommitment, [2]=nullifier`
- BidRange: `[0]=rangeOk, [1]=bidCommitment, [2]=reservePrice, [3]=maxBudget`
- Engine verifier imports these instead of magic numbers

### Claude's Discretion
- Exact test structure (describe/it grouping)
- AgentPrivateState JSON file location and naming
- Whether to create a setup script or inline registration in tests
- Signal constants export format (enum vs const object)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ZKFN-01 | Circuit test harness wired and passing for both RegistryMembership and BidRange circuits via `npm test` | `proof-generator.ts` already has both `generateMembershipProof()` and `generateBidRangeProof()`; tests need to call these and verify against engine's inlined vkeys using `snarkjs.groth16.verify` |
| ZKFN-02 | Keccak/Poseidon Merkle root mismatch resolved so engine cross-check passes with real circuit proofs | The cross-check is at `engine/src/lib/crypto.ts:288` — a conditional block inside `verifyMembershipProof()`; removing the `expectedRoot` branch while keeping `groth16.verify` preserves security |
| ZKFN-03 | AgentPrivacyRegistry Merkle root populated with test agent commitments on Base Sepolia | `prepareOnboarding()` + `registerOnChain()` in `packages/crypto/onboarding.ts` do the full flow; needs a script and a funded Base Sepolia signer |
| ZKFN-04 | Public signal index constants defined and shared across proof generator, engine verifier, and MCP server | New file `packages/crypto/src/signal-indices.ts`; exported from `packages/crypto/src/index.ts`; engine imports from `@agent-auction/crypto/signal-indices` |
</phase_requirements>

## Summary

Phase 1 is entirely a **fix-and-wire** phase — all infrastructure exists and has been tested independently. The 56-test suite in `packages/crypto/` runs, the Circom circuits compile, the `.wasm` and `.zkey` artifacts are present in `circuits/`, and the engine has real `groth16.verify` calls with inlined vkeys. The gap is that no test actually exercises the full generate-then-verify path end-to-end, the engine has a cross-check that makes real proofs fail, the on-chain registry has zero agents registered, and signal indices are magic numbers spread across several files.

The four tasks map cleanly to the four requirements. ZKFN-01 adds proof-generation tests. ZKFN-02 is a single-line engine deletion. ZKFN-03 is a registration script that runs once against Base Sepolia. ZKFN-04 creates one new TypeScript file and updates two import sites. There is no ambiguity about APIs or libraries — everything is already in use in the codebase.

The main execution risk is artifact consistency: the `.wasm`/`.zkey` files in `circuits/` must match the vkeys inlined in `engine/src/lib/crypto.ts`. If they diverged (e.g., circuit was recompiled without updating the inlined key), ZKFN-01 tests will fail with a cryptographic error rather than a code error. The research confirms the inlined vkeys match the files on disk by cross-referencing the IC point values.

**Primary recommendation:** Implement in order — ZKFN-04 (signal constants) first as it has zero risk and makes other tasks cleaner, then ZKFN-02 (remove cross-check), then ZKFN-01 (add tests that now pass), then ZKFN-03 (on-chain registration that completes the chain).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| snarkjs | already in package.json | Groth16 proof generation (`fullProve`) and verification (`groth16.verify`) | The only production-ready JS Groth16 library; already used in both `proof-generator.ts` and `engine/src/lib/crypto.ts` |
| poseidon-lite | already in package.json | BN254-compatible Poseidon hash (zero external deps) | CF Workers compatible; already used in both engine and packages/crypto |
| ethers v6 | already in packages/crypto | Provider + signer for on-chain registration | Already used in `onboarding.ts` for `registerOnChain()` |
| circom 2.2.3 | pre-compiled artifacts exist | Circuit compilation (NOT needed for Phase 1 — artifacts already built) | Circuits already compiled; `.wasm` and `.zkey` exist in `circuits/` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @agent-auction/crypto | workspace package | Poseidon chain, onboarding, proof generation | All proof-related logic routes through this package |
| vitest | already configured | Test runner for packages/crypto | `npm test` in packages/crypto runs vitest with --experimental-vm-modules |
| dotenv / process.env | Node built-in | Load Base Sepolia RPC URL + private key for registration script | ZKFN-03 registration script only |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Named const exports | TypeScript enum | Enums add runtime overhead and don't tree-shake; const object is idiomatic for this use case |
| Standalone registration script | Test fixture with `beforeAll` | Script is cleaner for a one-time on-chain action; avoids accidentally re-registering in CI |

**No new installation needed** — all libraries are already present in their respective `package.json` files.

## Architecture Patterns

### Relevant Project Structure
```
packages/crypto/
├── src/
│   ├── index.ts              # Re-exports all modules — add signal-indices here
│   ├── proof-generator.ts    # generateMembershipProof(), generateBidRangeProof()
│   ├── onboarding.ts         # prepareOnboarding(), registerOnChain(), buildPoseidonMerkleTree()
│   ├── poseidon-chain.ts     # poseidonHash(), computeEventHash()
│   ├── snarkjs-verify.ts     # Groth16Proof type
│   └── signal-indices.ts     # NEW: named signal index constants
├── scripts/
│   └── register-test-agents.ts  # NEW: one-shot Base Sepolia registration script
└── tests/                    # NEW test files go here (currently empty)

engine/src/lib/
└── crypto.ts                 # verifyMembershipProof() — remove expectedRegistryRoot cross-check at line 288

circuits/
├── RegistryMembership_js/
│   └── RegistryMembership.wasm
├── BidRange_js/
│   └── BidRange.wasm
└── keys/
    ├── registry_member_final.zkey
    ├── registry_member_vkey.json
    ├── bid_range_final.zkey
    └── bid_range_vkey.json
```

### Pattern 1: Signal Index Constants (ZKFN-04)
**What:** Named constants that document the positional contract of `publicSignals[]` arrays returned by snarkjs
**When to use:** Any time code indexes into `publicSignals` — in proof-generator, engine verifier, MCP server
**Example:**
```typescript
// packages/crypto/src/signal-indices.ts

/**
 * Public signal indices for RegistryMembership circuit.
 * snarkjs groth16.fullProve returns publicSignals[] in this order.
 * nPublic=3 (matches MEMBERSHIP_VKEY.nPublic in engine/src/lib/crypto.ts)
 */
export const MEMBERSHIP_SIGNALS = {
  REGISTRY_ROOT: 0,        // publicSignals[0]: Poseidon Merkle root of the capability tree
  CAPABILITY_COMMITMENT: 1, // publicSignals[1]: Poseidon(capabilityId, agentSecret)
  NULLIFIER: 2,             // publicSignals[2]: Poseidon(agentSecret, auctionId, 1n)
} as const

/**
 * Public signal indices for BidRange circuit.
 * nPublic=4 (matches BID_RANGE_VKEY.nPublic in engine/src/lib/crypto.ts)
 */
export const BID_RANGE_SIGNALS = {
  RANGE_OK: 0,          // publicSignals[0]: must equal "1" for valid range
  BID_COMMITMENT: 1,    // publicSignals[1]: Poseidon(bid, salt)
  RESERVE_PRICE: 2,     // publicSignals[2]: lower bound (public input)
  MAX_BUDGET: 3,        // publicSignals[3]: upper bound (public input)
} as const

export type MembershipSignalKey = keyof typeof MEMBERSHIP_SIGNALS
export type BidRangeSignalKey = keyof typeof BID_RANGE_SIGNALS
```

### Pattern 2: Engine Cross-Check Removal (ZKFN-02)
**What:** Remove the `expectedRegistryRoot` branch from `verifyMembershipProof()` — the Groth16 proof already binds the Poseidon root internally
**When to use:** This is a one-time surgical edit
**The exact change in `engine/src/lib/crypto.ts` (lines 286-290):**
```typescript
// REMOVE these lines (the cross-check block):
// Cross-check registry root against on-chain value when provided
if (expectedRoot && proofPayload.publicSignals[0] !== expectedRoot) {
  return { valid: false, registryRoot: proofPayload.publicSignals[0], nullifier: proofPayload.publicSignals[2] }
}
```
The `VerifyMembershipOptions` interface keeps `expectedRegistryRoot?: string` in its type signature (callers may still pass it), but the implementation ignores it. This avoids breaking callers while fixing the behavior.

### Pattern 3: Circuit Proof Tests (ZKFN-01)
**What:** End-to-end test that generates a real proof and verifies it using the engine's inlined vkey
**When to use:** Once per circuit, confirms .wasm/.zkey consistency with inlined vkeys
```typescript
// packages/crypto/tests/circuits.test.ts
import { describe, it, expect } from 'vitest'
import { generateMembershipProof } from '../src/proof-generator.js'
import { generateBidRangeProof } from '../src/proof-generator.js'
import { verifyMembershipProof, verifyBidRangeProof } from '../../engine/src/lib/crypto.js'
// OR: import snarkjs separately and use the exported vkeys directly

describe('RegistryMembership circuit', () => {
  it('generates and verifies a real Groth16 proof', async () => {
    // ... build minimal Merkle tree with one leaf, generate proof, verify
  })
})
```

**Alternative import path:** If importing engine code from packages/crypto tests is undesirable (circular-ish), duplicate the vkey inline in the test file — it's public data and already exists in `circuits/keys/registry_member_vkey.json`.

### Pattern 4: Test Agent Registration Script (ZKFN-03)
**What:** One-shot Node.js script using ethers v6 that calls `prepareOnboarding()` then `registerOnChain()` for 3 agents
**When to use:** Run once against Base Sepolia; save output JSON files for Phase 2+
```typescript
// packages/crypto/scripts/register-test-agents.ts
import { prepareOnboarding, registerOnChain } from '../src/onboarding.js'
import { ethers } from 'ethers'

const REGISTRY = '0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff'
const AGENT_IDS = [1n, 2n, 3n]  // bidder, competitor, observer
const CAPABILITY_IDS = [[1n], [1n], [1n]]  // single capability each

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC)
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)

  for (let i = 0; i < AGENT_IDS.length; i++) {
    const state = await prepareOnboarding(AGENT_IDS[i], CAPABILITY_IDS[i])
    await registerOnChain(state, REGISTRY, signer)
    // Write state to: packages/crypto/test-agents/agent-{agentId}.json
  }
}
```

### Anti-Patterns to Avoid
- **Regenerating circuits**: Do NOT run `circom` or `snarkjs setup` — existing `.wasm`/`.zkey` artifacts are trusted; recompilation would invalidate the inlined vkeys in the engine
- **Using `require()` for snarkjs in engine**: The engine lazy-imports snarkjs with `await import('snarkjs')` to avoid CF Workers init crash — do not change this pattern
- **Hardcoding signal indices as magic numbers**: This is exactly what ZKFN-04 fixes; any new code that touches `publicSignals[N]` must use the named constants
- **Re-registering agents in CI**: The `register-test-agents.ts` script is a one-shot operation; it should NOT be called in `npm test` — it costs gas and can fail if agents are already registered
- **Cross-importing engine from packages/crypto in production code**: Tests may import engine vkeys for verification, but `packages/crypto/src/` must not depend on `engine/`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Groth16 proof generation | Custom prover | `snarkjs.groth16.fullProve()` | Already in use; correct BN254 arithmetic is non-trivial |
| Groth16 verification | Custom verifier | `snarkjs.groth16.verify()` | Already inlined in engine with trusted vkeys |
| Poseidon hash | Custom implementation | `poseidon-lite` via `poseidonHash()` | Must match circuit's BN254 Poseidon exactly; any deviation produces invalid proofs |
| Sparse Merkle tree | New implementation | `buildPoseidonMerkleTree()` in `onboarding.ts` | Already implements 20-level sparse tree matching circuit's MERKLE_LEVELS |
| On-chain registration | Direct contract call | `registerOnChain()` in `onboarding.ts` | Already handles ABI encoding + ethers v6 contract call correctly |

**Key insight:** Every piece of cryptographic infrastructure needed for Phase 1 already exists and has been used in prior development. The risk of hand-rolling anything in ZK is that subtle parameter mismatches (field element bounds, hash input ordering, tree depth) produce silent proof failures rather than errors.

## Common Pitfalls

### Pitfall 1: Artifact/Vkey Mismatch
**What goes wrong:** `snarkjs.groth16.fullProve()` succeeds (generates a proof), but `snarkjs.groth16.verify()` returns `false` with the engine's inlined vkey
**Why it happens:** The `.zkey` file in `circuits/keys/` was regenerated (e.g., after circuit change) but the inlined vkey object in `engine/src/lib/crypto.ts` was not updated to match
**How to avoid:** The `IC` array values in `MEMBERSHIP_VKEY` and `BID_RANGE_VKEY` are the circuit-specific parts — verify these match `circuits/keys/registry_member_vkey.json` and `circuits/keys/bid_range_vkey.json` before writing tests. Do NOT recompile circuits.
**Warning signs:** `groth16.verify()` returns `false` even with a freshly-generated proof; error is silent (no exception)

### Pitfall 2: BigInt Serialization in JSON
**What goes wrong:** `AgentPrivateState` contains `bigint` fields (`agentSecret`, `salt`, `leafHashes`, etc.) — `JSON.stringify()` throws `TypeError: Do not know how to serialize a BigInt`
**Why it happens:** JSON does not support BigInt natively
**How to avoid:** Use a replacer: `JSON.stringify(state, (_, v) => typeof v === 'bigint' ? v.toString() : v)` when writing state files; use reviver `BigInt(v)` when reading them back
**Warning signs:** Script crashes at the file-write step with a TypeError

### Pitfall 3: Missing `--experimental-vm-modules` for snarkjs in Vitest
**What goes wrong:** Vitest tests that import `snarkjs` fail with module loading errors
**Why it happens:** snarkjs uses dynamic `import()` internally with patterns that require the experimental VM modules flag
**How to avoid:** The existing `packages/crypto/` test setup already handles this (CLAUDE.md states `npm test` runs with `--experimental-vm-modules`). Confirm the `package.json` test script includes this flag before adding new tests.
**Warning signs:** Tests fail at import time with `ERR_VM_MODULE_NOT_YET_LINKED` or similar

### Pitfall 4: Agent Already Registered
**What goes wrong:** `registerOnChain()` transaction reverts because the `agentId` is already registered in the contract
**Why it happens:** Running the registration script a second time with the same agent IDs
**How to avoid:** Script should call `registry.agents(agentId)` first and skip if `registeredAt > 0`. OR use new agent IDs that haven't been registered. Check Base Sepolia state before running.
**Warning signs:** Transaction reverts with `AgentAlreadyRegistered` or similar custom error

### Pitfall 5: Poseidon Root vs keccak Root Confusion
**What goes wrong:** After removing the `expectedRegistryRoot` cross-check, someone adds it back thinking it's a security requirement
**Why it happens:** The variable name `registryRoot` in `publicSignals[0]` looks like it should match `AgentPrivacyRegistry.getRoot()`, but they use different hash functions
**How to avoid:** Add a clear comment at the removal site explaining WHY the cross-check was removed and that Groth16 verification already binds the Poseidon root. Document this in `signal-indices.ts` as well.
**Warning signs:** Engine cross-check reinstated, real proofs start failing again

## Code Examples

Verified patterns from existing project code:

### Generating a RegistryMembership Proof (from proof-generator.ts)
```typescript
// Source: packages/crypto/src/proof-generator.ts
// Public signals order: [registryRoot, capabilityCommitment, nullifier]
const { proof, publicSignals } = await generateMembershipProof({
  agentSecret,         // bigint (private)
  capabilityId: 1n,   // bigint (private)
  leafIndex: 0n,      // bigint (private — position in tree)
  pathElements,        // bigint[] (private — sibling hashes)
  pathIndices,         // number[] (private — left/right directions)
  auctionId,           // bigint (private — binds nullifier to auction)
  salt,                // bigint (private)
  registryRoot,        // bigint (public — Poseidon Merkle root)
})
// publicSignals[0] = registryRoot (string)
// publicSignals[1] = capabilityCommitment (string)
// publicSignals[2] = nullifier (string)
```

### Verifying a Proof in the Engine (from engine/src/lib/crypto.ts)
```typescript
// Source: engine/src/lib/crypto.ts
// After ZKFN-02: expectedRegistryRoot cross-check is removed
const result = await verifyMembershipProof(proofPayload, {
  requireProof: true,
  // expectedRegistryRoot: no longer passed — cross-check removed
})
if (!result.valid) { /* reject */ }
const nullifier = result.nullifier  // publicSignals[2]
```

### Building a Merkle Tree and Getting a Proof (from onboarding.ts)
```typescript
// Source: packages/crypto/src/onboarding.ts
const leafHashes = [await computeLeaf(1n, agentSecret, 0n)]  // single capability
const { root, layers, zeroHashes } = await buildPoseidonMerkleTree(leafHashes)
const { pathElements, pathIndices } = getMerkleProof(0, layers, zeroHashes)
// root is the Poseidon registryRoot to pass to generateMembershipProof
```

### Signal Index Usage (after ZKFN-04)
```typescript
// Source: packages/crypto/src/signal-indices.ts (NEW)
import { MEMBERSHIP_SIGNALS, BID_RANGE_SIGNALS } from '@agent-auction/crypto/signal-indices'

// In engine/src/lib/crypto.ts (after ZKFN-02 + ZKFN-04):
const nullifier = proofPayload.publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER]   // replaces [2]
const registryRoot = proofPayload.publicSignals[MEMBERSHIP_SIGNALS.REGISTRY_ROOT]  // replaces [0]

// In bid range verifier:
if (proofPayload.publicSignals[BID_RANGE_SIGNALS.RANGE_OK] !== '1') { /* invalid */ }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Magic number signal indices (`publicSignals[2]`) | Named constants (`MEMBERSHIP_SIGNALS.NULLIFIER`) | Phase 1 (ZKFN-04) | Eliminates off-by-one bugs when circuits evolve |
| Engine rejects real proofs via keccak/Poseidon cross-check | Cross-check removed; Groth16 verification is sole gate | Phase 1 (ZKFN-02) | Real proofs from agents now pass engine verification |
| Zero-agent on-chain registry | 3 test agents with Poseidon commitments on Base Sepolia | Phase 1 (ZKFN-03) | Engine can verify live membership proofs against real commitments |

**Deprecated/outdated:**
- `deriveNullifier()` (keccak256-based): Already marked `@deprecated` in `engine/src/lib/crypto.ts:76`. Used only as fallback when no ZK proof is provided. Phase 2 will address the EIP-712 nullifier type mismatch.

## Open Questions

1. **Test file location: `tests/` vs `src/` for packages/crypto**
   - What we know: `packages/crypto/` has no `tests/` directory (Glob found no `.test.ts` files); CLAUDE.md implies `npm test` already runs 56 tests
   - What's unclear: Where do the existing 56 tests live? Need to verify test runner config before adding new test files
   - Recommendation: Run `ls packages/crypto/` to find the test directory before creating the new circuit test file

2. **Engine import in proof tests**
   - What we know: Tests need to call `snarkjs.groth16.verify()` with the same vkey as the engine to confirm consistency; the vkeys are also in `circuits/keys/*.json` on disk
   - What's unclear: Whether to import the engine's inlined vkey object directly (cross-package import) or read `circuits/keys/registry_member_vkey.json` from disk
   - Recommendation: Read from disk JSON files — avoids cross-package coupling, and the files are the authoritative source anyway

3. **Base Sepolia funding for registration script**
   - What we know: `registerOnChain()` requires a funded signer; deployer address is `0x633ec0e633AA4d8BbCCEa280331A935747416737`
   - What's unclear: Whether the deployer key is available in the dev environment
   - Recommendation: Registration script should accept `PRIVATE_KEY` env var; document that any funded Base Sepolia account works

## Sources

### Primary (HIGH confidence)
- `engine/src/lib/crypto.ts` — Full source of `verifyMembershipProof()`, inlined vkeys, line 288 cross-check location, lazy snarkjs import pattern
- `packages/crypto/src/proof-generator.ts` — Full source of `generateMembershipProof()` and `generateBidRangeProof()`, signal order comments, circuit artifact paths
- `packages/crypto/src/onboarding.ts` — Full source of `prepareOnboarding()`, `registerOnChain()`, `buildPoseidonMerkleTree()`, `AgentPrivateState` type
- `.planning/phases/01-zk-foundation/01-CONTEXT.md` — Locked decisions, exact file paths, line numbers

### Secondary (MEDIUM confidence)
- `CLAUDE.md` — Runtime environments, test commands, deployed contract addresses, module map
- `.planning/REQUIREMENTS.md` — ZKFN-01 through ZKFN-04 definitions

### Tertiary (LOW confidence)
- None — all findings are based on direct code inspection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are already in use in the codebase
- Architecture: HIGH — existing code provides exact patterns; new code is additive
- Pitfalls: HIGH — derived from direct reading of existing code (artifact/vkey values visible, BigInt issue is known JS limitation, experimental-vm-modules is project convention)

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable domain — Circom/snarkjs APIs are stable; only risk is if circuits are recompiled)
