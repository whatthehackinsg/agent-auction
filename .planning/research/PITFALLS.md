# Pitfalls Research

**Domain:** ZK proof end-to-end integration — snarkjs/Circom Groth16 wired through MCP tools, Cloudflare Workers engine, and on-chain Merkle registry
**Researched:** 2026-03-02
**Confidence:** HIGH (most pitfalls verified directly against this codebase's source code; runtime behavior pitfalls are MEDIUM from external evidence)

---

## Critical Pitfalls

### Pitfall 1: On-Chain keccak256 Root vs Off-Chain Poseidon Root — Will Always Mismatch

**What goes wrong:**
The `AgentPrivacyRegistry._updateRoot()` computes its Merkle root using `keccak256(abi.encodePacked(left, right))` for internal nodes. The `RegistryMembership.circom` circuit and `buildPoseidonMerkleTree()` in `packages/crypto/src/onboarding.ts` compute their roots using `Poseidon(left, right)`. These are different hash functions producing different values. When `ENGINE_REQUIRE_PROOFS=true`, the engine calls `getPrivacyRegistryRoot()` → `agentPrivacyRegistry.getRoot()` and passes the result as `expectedRegistryRoot` for cross-checking `publicSignals[0]`. The proof's `registryRoot` is a Poseidon root; the chain returns a keccak256 root. They will never match. Every JOIN with a real proof will be rejected.

**Why it happens:**
The contract `_updateRoot()` was written with keccak256 because that is the standard Solidity pattern for off-chain Merkle whitelists. The circuit was written independently to use Poseidon because Poseidon is ZK-friendly. Neither was changed when the other was written. The mismatch is silent at compile time.

**How to avoid:**
One of two fixes is required — pick exactly one:

- **Option A (recommended for hackathon):** Remove the `expectedRegistryRoot` cross-check from the engine entirely. The circuit already constrains `registryRoot` as a public input that the agent must supply correctly — there is no need to re-verify it against the chain. The chain's `getRoot()` serves a different purpose (commitments ledger) and uses a different hash function by design. The engine should trust the proof itself.
- **Option B:** Rewrite `AgentPrivacyRegistry._updateRoot()` in Solidity to use a Poseidon hasher (e.g., deploy a Poseidon library), rebuild and redeploy the contract, and ensure the on-chain root and off-chain Poseidon tree stay in sync. This is significantly more work and not worth it for the hackathon.

**Warning signs:**
- Every JOIN with `ENGINE_REQUIRE_PROOFS=true` returns `Invalid membership proof for agent X` even though the proof itself verifies correctly in isolation.
- `engine/src/lib/crypto.ts` `verifyMembershipProof()` returns `valid: false` with non-zero `registryRoot` in the error path — confirming the root cross-check is the failure point, not the Groth16 pairing itself.
- Unit test passes (proof verifies against vkey) but integration test against live engine with `ENGINE_REQUIRE_PROOFS=true` fails.

**Phase to address:** Phase 1 — Circuits Test Harness and Engine Proof Wiring. This must be resolved before any E2E wiring works.

---

### Pitfall 2: Agent's Private Merkle Tree Root Doesn't Match What Was Registered On-Chain

**What goes wrong:**
The on-chain registration flow calls `AgentPrivacyRegistry.register(agentId, registrationCommit)` where `registrationCommit = keccak256(agentSecret, capabilityMerkleRoot, salt)`. The `capabilityMerkleRoot` here is the agent's own per-agent Poseidon capability tree — a *local* tree over that agent's own capabilities. This is a completely different tree from the global registry Merkle tree (the tree whose root is stored in `registryRoot` on-chain). The `RegistryMembership` circuit's `registryRoot` public input refers to the *global* tree of all agent leaf commitments, not the per-agent capability tree. If proof generation passes the wrong root — the per-agent `capabilityMerkleRoot` instead of the global registry root computed over all agents' leaf hashes — the proof will verify (Groth16 constraint satisfaction) but against the wrong tree, and the nullifier will be tied to the wrong root, allowing cross-tree replay if an attacker can insert their leaf into a different registry.

**Why it happens:**
Two distinct Merkle trees both called "root" in close proximity: `capabilityMerkleRoot` (per-agent, in `prepareOnboarding()`) and `registryRoot` (global, result of `buildPoseidonMerkleTree(allAgentLeaves)`). Variable naming is similar and the code paths are close together in `onboarding.ts`. An agent building proof inputs will grab the wrong root.

**How to avoid:**
Use distinct, unambiguous names throughout:
- `perAgentCapabilityRoot` — the agent's local Poseidon tree over their own capabilities
- `globalRegistryRoot` — the Poseidon tree over all registered agents' leaf hashes
The circuit input `registryRoot` must always be the `globalRegistryRoot`. Add a validation assertion in the proof-generation path: if `registryRoot === capabilityMerkleRoot`, throw — they should not be equal except in trivially small test scenarios.

**Warning signs:**
- `generateMembershipProof()` succeeds but the returned `publicSignals[0]` equals the value from `state.capabilityMerkleRoot` rather than the value returned by `buildPoseidonMerkleTree(allLeaves).root`.
- Proof passes `verifyMembershipProof` but the `registryRoot` in `publicSignals[0]` is not the root that was used to onboard agents on-chain.

**Phase to address:** Phase 1 — Circuits Test Harness. The E2E test fixture must construct the global registry tree from all test agent leaves and pass that root explicitly.

---

### Pitfall 3: MCP `join_auction` and `place_bid` Tools Send `proof: null` — No ZK Payload Path Exists Yet

**What goes wrong:**
`mcp-server/src/tools/join.ts` calls `signer.signJoin(...)` which always returns `proof: null` (hardcoded in `mcp-server/src/lib/signer.ts` line 134). `mcp-server/src/tools/bid.ts` does not include a `proof` field at all in its return type. Neither tool's `inputSchema` accepts proof parameters. When `ENGINE_REQUIRE_PROOFS=true`, these tools will always produce rejected actions. Worse, the MCP schema has no `proof` field defined, so an LLM agent calling the tool has no mechanism to supply proof data even if it wanted to.

**Why it happens:**
The MCP tools were built before the ZK integration milestone and were designed for the EIP-712-only flow. The proof path is a new requirement. The tools compile and run without error in stub mode, making the gap invisible until `ENGINE_REQUIRE_PROOFS=true` is activated.

**How to avoid:**
Add optional `proof` parameters to both `join_auction` and `place_bid` input schemas. The proof payload is large (multiple 256-bit field elements as decimal strings), so represent it as a single JSON string parameter rather than nested Zod objects — this keeps the MCP tool schema human-readable and avoids JSON-in-JSON encoding issues. The signer must accept and pass through proof data from the tool caller.

**Warning signs:**
- `mcp-server/src/lib/signer.ts` `signJoin()` return type shows `proof: null` as a literal type annotation.
- MCP tool tests pass but all pass in `ENGINE_ALLOW_INSECURE_STUBS=true` mode.
- The `place_bid` return object has no `proof` property at all in the type signature.

**Phase to address:** Phase 2 — MCP Tool ZK Payload Wiring.

---

### Pitfall 4: snarkjs `fullProve` Requires File System Access — Incompatible with Cloudflare Workers Environment

**What goes wrong:**
`packages/crypto/src/proof-generator.ts` calls `snarkjs.groth16.fullProve(input, wasmPath, zkeyPath)` where `wasmPath` and `zkeyPath` are filesystem paths resolved via `fileURLToPath(import.meta.url)`. Cloudflare Workers have no filesystem. Proof generation must happen on the agent side (Node.js client), never in the Worker. If proof generation is accidentally wired into the engine (e.g., the engine tries to re-generate a proof for testing), it will fail at runtime with an opaque error.

**Why it happens:**
The `proof-generator.ts` is in `packages/crypto` which the engine imports for other functions. A developer might reasonably assume all exports of `@agent-auction/crypto` work in CF Workers since other parts of the package work there (Poseidon hashing, EIP-712 types). The distinction is that `fullProve` needs the `.wasm` and `.zkey` artifacts from disk while `groth16.verify` with an inlined vkey does not.

**How to avoid:**
Keep proof generation strictly in `agent-client` and `mcp-server` (Node.js runtimes). Never import `proof-generator.ts` in the engine. The engine only ever calls `verifyMembershipProof()` and `verifyBidRangeProof()` from `engine/src/lib/crypto.ts` which uses inlined vkeys — this is already correct. Document this boundary explicitly in `packages/crypto/src/proof-generator.ts` with a `@clientOnly` JSDoc tag.

**Warning signs:**
- Import of `proof-generator` appears anywhere under `engine/src/`.
- Tests that generate proofs run in Miniflare/Workers environment rather than plain Node/Vitest.

**Phase to address:** Phase 1 — Circuits Test Harness. Tests must be structured to run proof generation in a Node.js Vitest context, not in the Workers test environment.

---

### Pitfall 5: snarkjs Lazy Import in CF Workers — ffjavascript `URL.createObjectURL()` Called at Module Init

**What goes wrong:**
The engine already handles this with a lazy `import('snarkjs')` pattern (see `engine/src/lib/crypto.ts` lines 26-32), which is correct. If this lazy pattern is removed, reverted, or a developer adds a top-level `import * as snarkjs from 'snarkjs'` anywhere in the Workers bundle, the Workers runtime will throw at startup because `ffjavascript` calls `URL.createObjectURL()` during module initialization, an API that does not exist in the CF Workers runtime.

**Why it happens:**
A developer adds snarkjs to the engine for a helper function, copies the import pattern from `packages/crypto/src/proof-generator.ts` which uses a static import (valid in Node.js), and deploys. Works locally in `wrangler dev` with `nodejs_compat` but may fail in production or different wrangler versions.

**How to avoid:**
Keep the lazy dynamic import pattern. Add an ESLint rule or code comment warning: `// IMPORTANT: Static import of snarkjs breaks CF Workers. Use dynamic import.` Test with `wrangler dev` plus `wrangler deploy --dry-run` to catch bundle-time issues early.

**Warning signs:**
- `Error: URL.createObjectURL is not a function` or similar at Worker startup.
- Engine startup fails immediately on first request, not on proof verification call.

**Phase to address:** Phase 1 — verify this pattern is preserved before any new engine code touches snarkjs.

---

### Pitfall 6: EIP-712 Signature Includes Keccak Nullifier But Proof Produces Poseidon Nullifier — Mismatch in Joined Flow

**What goes wrong:**
When a real ZK membership proof is provided, the engine extracts `nullifier = publicSignals[2]` (a Poseidon-derived value). This is then used for nullifier checking and is passed to `verifySignature()` as `extra.nullifier`. The EIP-712 `Join` message includes a `nullifier` field — the agent must sign over the same nullifier value the engine will extract from the proof. If the agent uses the legacy keccak nullifier derivation (`mcp-server/src/lib/signer.ts` `deriveJoinNullifier()`) when building the EIP-712 signature, but the engine extracts the Poseidon nullifier from the ZK proof, the signature verification will fail because the signed message contains the wrong nullifier.

**Why it happens:**
There are two nullifier derivation paths in the codebase: `deriveJoinNullifier()` in `mcp-server/src/lib/signer.ts` (keccak, for the legacy flow) and `Poseidon(agentSecret, auctionId, 1)` from the circuit (for the ZK flow). The signer was written for the pre-ZK flow. When ZK is activated, the agent must compute the Poseidon nullifier *before* generating the EIP-712 signature, then pass it into `signJoin()` as a parameter. The current `signJoin()` API derives the nullifier internally using keccak and does not accept an external nullifier.

**How to avoid:**
Extend `signJoin()` to accept an optional `nullifier: bigint` parameter. When a ZK proof is provided, the caller must compute `Poseidon(agentSecret, auctionId, 1)` and pass it in. The signer should not derive the nullifier internally when a ZK proof is present. Add a test that signs with a Poseidon nullifier and verifies the EIP-712 signature recovers correctly.

**Warning signs:**
- `Invalid EIP-712 signature for agent X` errors that appear only when `ENGINE_REQUIRE_PROOFS=true`, not when running with stubs.
- The error surfaces at `verifySignature()` in `actions.ts` after `verifyMembership()` succeeds — i.e., the proof itself is valid but the signature check fails.

**Phase to address:** Phase 2 — MCP Tool ZK Payload Wiring. The agent-client and MCP signer must coordinate nullifier derivation with proof generation.

---

### Pitfall 7: Circuit Public Signals Array Order Is a Silent Contract — Off-by-One Breaks Everything

**What goes wrong:**
The `RegistryMembership` circuit defines public signals in this exact order: `[registryRoot, capabilityCommitment, nullifier]` (0-indexed). `verifyMembershipProof()` in `engine/src/lib/crypto.ts` reads `publicSignals[0]` for `registryRoot` and `publicSignals[2]` for `nullifier`. This mapping is correct today. If the circuit is ever recompiled with a different signal order, or if a developer swaps `capabilityCommitment` and `nullifier` indices in the verifier code, proofs will silently "verify" (Groth16 accepts structurally valid proofs regardless of semantic signal ordering) while extracting the wrong value as the nullifier. A replayed nullifier from auction A becomes accepted in auction B if nullifier and auctionId are transposed.

**Why it happens:**
Circom does not label public signals by name in the proof output — `snarkjs.groth16.fullProve` returns `publicSignals` as an ordered array with no field names. The mapping from index to semantic meaning is implicit, maintained only through convention in the verifier code. This contract is not enforced by the type system.

**How to avoid:**
Add a constants file shared between circuit test harness and the engine verifier:
```typescript
// packages/crypto/src/signal-indices.ts
export const MEMBERSHIP_SIGNALS = {
  registryRoot: 0,
  capabilityCommitment: 1,
  nullifier: 2,
} as const

export const BID_RANGE_SIGNALS = {
  rangeOk: 0,
  bidCommitment: 1,
  reservePrice: 2,
  maxBudget: 3,
} as const
```
Use named access everywhere: `publicSignals[MEMBERSHIP_SIGNALS.nullifier]`. Add a circuit test that asserts the signal at each expected index has the correct semantic value.

**Warning signs:**
- Nullifiers from one auction are accepted as valid for a different auction.
- `rangeOk` check (`publicSignals[0] === '1'`) passes but the value read for `bidCommitment` is actually `rangeOk`.

**Phase to address:** Phase 1 — Circuits Test Harness. Define signal index constants before writing any verifier code.

---

### Pitfall 8: BidRange Circuit Uses Unsigned 64-bit Arithmetic — Negative Differences Cause Constraint Failure, Not Graceful Rejection

**What goes wrong:**
`BidRange.circom` computes `diffLow = bid - reservePrice` and passes it to `Num2Bits(64)`. If `bid < reservePrice`, `diffLow` is negative in integer arithmetic but wraps to a very large positive value in the BN254 field (approximately `p - (reservePrice - bid)` where `p` is the field prime ~2^254). `Num2Bits(64)` will reject this because the wrapped value exceeds 64 bits. The result is a constraint error during witness generation, not a clean proof that returns `rangeOk = 0`. The `snarkjs.groth16.fullProve` call throws an exception rather than returning an invalid proof. The agent-client must catch this exception and translate it to a user-readable error rather than a 500.

**Why it happens:**
ZK circuits enforce constraints at the arithmetic circuit level — they cannot conditionally return output values; they either satisfy constraints or fail entirely. Developers familiar with normal TypeScript error handling expect a function to return `{ valid: false }` on bad input, not throw.

**How to avoid:**
In `agent-client` / MCP server proof generation: validate that `bid >= reservePrice` and `bid <= maxBudget` *before* calling `generateBidRangeProof()`. Treat constraint violations from snarkjs as proof generation failures (user error), not engine errors. Wrap `fullProve` in a try-catch that returns `{ success: false, reason: 'bid_out_of_range' }`.

**Warning signs:**
- Unhandled promise rejections in the agent-client when a bid is below the reserve price.
- Error message from snarkjs: "Error: Error: Assert Failed" during `fullProve` rather than a structured error from the engine.

**Phase to address:** Phase 3 — Agent Client ZK Integration.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `ENGINE_ALLOW_INSECURE_STUBS=true` in all CI tests | Tests pass without ZK infrastructure | Real ZK flow never gets integration-tested; stub mode masks signature verification bugs | Never for E2E tests; only in unit tests that don't touch the action handler |
| Storing `agentSecret` as a plain environment variable | Simple agent-client setup | Secret exposure in process env, logs, error messages | Acceptable for hackathon demo only; flag for production |
| Skipping `expectedRegistryRoot` cross-check entirely (Option A above) | Unblocks E2E immediately | Engine accepts proofs against any root, including a fake registry with attacker's leaf | Acceptable for hackathon — off-chain snarkjs verification still catches fake proofs cryptographically |
| Inlining vkeys in `engine/src/lib/crypto.ts` as TypeScript constants | No file system access needed in CF Workers | Vkeys must be manually updated if circuits change; no runtime key loading | Acceptable for this milestone since circuits are frozen |
| Using keccak fallback nullifier when no ZK proof present | Backward compatibility with non-ZK agents | Two nullifier systems with incompatible encodings running in parallel | Only during transition; remove keccak fallback once all agents submit ZK proofs |

---

## Integration Gotchas

Common mistakes when connecting the ZK pipeline components.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `snarkjs.groth16.fullProve` → HTTP → Engine | Sending the raw `proof` object with `BigInt` fields directly through `JSON.stringify` | snarkjs returns decimal strings already — do NOT run `JSON.stringify` on bigint values. Verify `typeof publicSignals[0] === 'string'` before sending. |
| Engine `verifyMembershipProof` | Passing `proof` object and `publicSignals` as separate top-level fields in the action body | Engine expects `action.proof = { proof: {...}, publicSignals: [...] }` — a single nested object. See `isMembershipProofPayload()` in `engine/src/lib/crypto.ts`. |
| MCP tool schema → Zod → engine body | Defining `proof` as `z.object({...})` with nested bigint fields | Bigints don't serialize through Zod/JSON cleanly. Accept `proof` as `z.string()` (JSON-encoded proof payload) and `JSON.parse` it before forwarding to the engine. |
| Off-chain tree build → `getRoot()` on-chain comparison | Comparing Poseidon root from `buildPoseidonMerkleTree` against `agentPrivacyRegistry.getRoot()` | The on-chain `getRoot()` returns a keccak256 root. These are intentionally incompatible. Do not compare them. |
| Cloudflare Workers CPU time budget | Running `snarkjs.groth16.verify` on every action without considering latency | `groth16.verify` for BN128 takes ~50-200ms CPU time in V8 (JIT WASM pairing). CF Workers Paid plan allows up to 5 minutes CPU time per request, so this is within budget, but the DO must be configured on the Paid plan. Free tier (10ms) would fail. |
| `agentSecret` as circuit input | Passing `agentSecret` as a JavaScript `number` | `agentSecret` is a 256-bit value — JavaScript `number` loses precision. Always use `bigint`. The circuit input must be `.toString()` (decimal string, not hex). |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `snarkjs.groth16.verify` called synchronously in the DO request handler | High latency on JOIN/BID actions; DO request queue backs up | Already mitigated by lazy import; ensure the DO is on Paid plan for CPU headroom | Any load; 50-200ms blocking per verification |
| Re-fetching `getPrivacyRegistryRoot()` on every action | N RPC calls to Base Sepolia per N actions; rate limiting or latency spikes | Cache the root in DO storage with a TTL (e.g., 60 seconds); invalidate on-demand | >10 actions per minute with an external RPC provider |
| 20-level Poseidon Merkle proof path elements — 20 bigint values each 32 bytes | Proof payload grows to ~3KB just for path elements; fine for REST but may hit MCP message size limits | Confirm MCP server transport buffer size; `@modelcontextprotocol/sdk` default is adequate but verify | Not a scaling concern at hackathon scale |
| Nullifier stored in DO storage as a plain hex string | Works fine at <1000 nullifiers; `storage.list()` iteration becomes slow | Use a fixed-format key: `nullifier:<hex32>` for O(1) lookup. Already correctly implemented in `actions.ts`. | Beyond hackathon scale; not a concern now |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Accepting `rangeOk` check by trusting `publicSignals[0] === '1'` without also verifying the proof itself | An attacker could craft `publicSignals = ['1', '0', '0', '0']` with a fake proof that passes a naive check | Always call `snarkjs.groth16.verify()` first; only then read `publicSignals[0]`. Engine already does this correctly. |
| Nullifier computed from wallet address (keccak path) instead of `agentSecret` | Two agents with colluding wallets could derive each other's nullifiers; nullifier is not secret-bound | Use ZK Poseidon nullifier `Poseidon(agentSecret, auctionId, 1)` which requires knowledge of `agentSecret`. Remove keccak fallback after ZK integration is stable. |
| Input aliasing — passing field values >= BN254 prime `p` as circuit inputs | snarkjs may accept or silently wrap values; circuit constraints may be satisfied by the wrong witness | Always reduce bigint inputs modulo `p` before passing to `fullProve`. For practical values (auctionId, bid amounts in USDC), values are far below `p`, so this is not an immediate risk but worth documenting. |
| Storing `agentSecret` in MCP server environment | Secret exposure in process listing, crash dumps, error logs | For hackathon: acceptable. For production: use a secrets manager or derive from a hardware wallet signature. |
| Reusing a nullifier across auctions by setting `auctionId = 0n` in the circuit input | A prover who omits `auctionId` from the circuit input can reuse the same nullifier in every auction | The circuit enforces `nullifier = Poseidon(agentSecret, auctionId, 1)` — `auctionId` is a private input, so the prover cannot cheat. The verifier must not accept auctionId=0 as a valid join target. |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Circuit test harness "passing":** Verify tests use real `.wasm` and `.zkey` artifacts from `circuits/` — not mocked inputs. A test that mocks `fullProve` output is not testing the circuit.
- [ ] **Engine ZK verification "enabled":** Check that `ENGINE_REQUIRE_PROOFS=true` is set in the test environment, not just in production config. Default is `false`, meaning stubs always pass.
- [ ] **MCP `join_auction` with ZK "working":** Confirm the proof payload actually arrives at the engine. Log the raw action body at the engine and verify `action.proof !== null`.
- [ ] **On-chain demo "live":** After the agent joins with a ZK proof, fetch the engine event log and verify `zkNullifier` is present in the JOIN event — confirming the Poseidon nullifier was extracted from the proof.
- [ ] **Merkle root populated "on-chain":** Call `agentPrivacyRegistry.getAgentCount()` — if it returns 0, no agents are registered and the registry root is 0x00. A proof against a non-zero root will always fail the (optional) root cross-check.
- [ ] **Frontend ZK status "real":** The frontend must read proof verification status from the engine event or WebSocket payload — not infer it from the presence of a `proof` field on the action. Engine must emit `proofVerified: true` in the event record.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| keccak vs Poseidon root mismatch detected after integration | LOW | Remove `expectedRegistryRoot` cross-check from engine (Option A). One-line change in `handleAction` in `auction-room.ts`. No contract redeploy needed. |
| Wrong Merkle root passed to `generateMembershipProof` | LOW | Re-run proof generation with correct `globalRegistryRoot`. No state to roll back — proofs are stateless. |
| Nullifier mismatch between EIP-712 signature and proof | MEDIUM | Extend `signJoin()` to accept `nullifier` parameter. Regenerate the signature after computing the Poseidon nullifier from the proof. |
| MCP tool missing proof schema | LOW | Add `proof: z.string().optional()` to input schema. No breaking change — existing callers that don't send proof continue to work (stubs mode). |
| CF Workers CPU limit exceeded during verify | LOW | Confirm engine is on Paid plan (`wrangler.toml` `usage_model = "standard"`). `groth16.verify` is CPU-heavy but well within 5-minute limit. |
| `agentSecret` accidentally logged | HIGH | Rotate: generate new secret, re-register on-chain with new commitment, rebuild Merkle tree, update registry root. Old proofs with old nullifiers remain valid — nullifier set in DO storage must be cleared if old proofs are to be re-used. |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| keccak vs Poseidon root mismatch | Phase 1: Circuit Test Harness | E2E test: proof generated → engine rejects root cross-check → fix → engine accepts |
| Wrong Merkle tree root (per-agent vs global) | Phase 1: Circuit Test Harness | Test asserts `publicSignals[0]` equals the value from `buildPoseidonMerkleTree(allLeaves).root`, not `state.capabilityMerkleRoot` |
| MCP tools missing proof payload path | Phase 2: MCP Tool ZK Wiring | `join_auction` tool input schema includes optional `proof` field; test that non-null proof arrives at engine |
| `fullProve` file system access in CF Workers | Phase 1: Circuit Test Harness | Vitest test for proof generation runs in Node.js context, not Miniflare. Engine test environment never imports `proof-generator`. |
| snarkjs static import breaking CF Workers | Phase 1 | Wrangler bundle analysis: no static `import * as snarkjs` in engine bundle |
| Nullifier type mismatch (keccak in sig, Poseidon from proof) | Phase 2: MCP Tool ZK Wiring | Integration test: sign with Poseidon nullifier → engine extracts matching zkNullifier → both match |
| Public signals index mismatch | Phase 1: Circuit Test Harness | Signal index constants defined; tests assert semantic values at expected indices |
| BidRange constraint failure on invalid bid | Phase 3: Agent Client ZK Integration | Agent-client wraps `fullProve` in try-catch; returns structured error for out-of-range bids |

---

## Sources

- Direct source code analysis: `contracts/src/AgentPrivacyRegistry.sol` (`_updateRoot` uses keccak256) vs `circuits/src/RegistryMembership.circom` (expects Poseidon internal nodes) — HIGH confidence, verified in codebase
- Direct source code analysis: `mcp-server/src/lib/signer.ts` `signJoin()` returns `proof: null` hardcoded — HIGH confidence
- Direct source code analysis: `engine/src/lib/crypto.ts` lazy snarkjs import pattern with comment explaining `URL.createObjectURL()` constraint — HIGH confidence
- Direct source code analysis: `engine/src/auction-room.ts` `getPrivacyRegistryRoot()` called on every action when `ENGINE_REQUIRE_PROOFS=true` — HIGH confidence
- [snarkjs GitHub — known heap OOM issues with large circuits](https://github.com/iden3/snarkjs/issues/397) — MEDIUM confidence (general snarkjs behavior)
- [Cloudflare Workers Limits — 5 min CPU on Paid plan (March 2025)](https://developers.cloudflare.com/changelog/post/2025-03-25-higher-cpu-limits/) — HIGH confidence
- [0xPARC ZK Bug Tracker — public signals ordering and input aliasing vulnerabilities](https://github.com/0xPARC/zk-bug-tracker) — MEDIUM confidence (general ZK patterns)
- [RareSkills — AliasCheck and Num2Bits_strict in Circomlib](https://rareskills.io/post/circom-aliascheck) — MEDIUM confidence (BN254 field overflow patterns)
- [SECBIT Blog — Input Aliasing Bug in zkSNARKs](https://secbit.io/blog/en/2019/07/29/the-input-aliasing-bug-caused-by-a-contract-library-of-zksnarks/) — MEDIUM confidence (historical, fixed in snarkjs 0.6.10+)

---
*Pitfalls research for: ZK proof E2E integration — snarkjs/Circom Groth16 + MCP + CF Workers engine + AgentPrivacyRegistry*
*Researched: 2026-03-02*
