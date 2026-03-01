# Stack Research

**Domain:** ZK proof end-to-end wiring — Circom/snarkjs Groth16 in TypeScript agent-client, MCP tool interface, and Cloudflare Workers verification
**Researched:** 2026-03-02
**Confidence:** HIGH (core libraries verified against npm registry and codebase; CF Workers behavior verified against official docs; MCP SDK patterns verified against official GitHub)

---

## Context: What Already Exists vs What Needs Wiring

This is a **brownfield integration milestone**, not a greenfield stack decision. The heavy lifting is already done — circuits compiled, verification keys generated, snarkjs integrated in the engine, proof-generation helpers written in `packages/crypto`. The stack question is specifically: **what are the correct library versions, import patterns, and API choices to wire the existing pieces into an end-to-end flow?**

Existing (do not change):
- `snarkjs` ^0.7.5 in `packages/crypto` and `engine` — already at `0.7.6` latest
- `circomlibjs` ^0.1.7 in `circuits/` — already at `0.1.7` latest
- `poseidon-lite` ^0.3.0 in `packages/crypto` — already at `0.3.0` latest
- `@modelcontextprotocol/sdk` ^1.27.0 in `mcp-server` — already at `1.27.1` latest
- `zod` ^3.25.0 in `mcp-server`
- `viem` ^2.46.2 across all packages
- Two compiled Groth16 circuits: `RegistryMembership` (~12K constraints) and `BidRange` (~5K constraints)
- Proving keys in `circuits/keys/` (`registry_member_final.zkey`, `bid_range_final.zkey`)
- Verification keys inlined in `engine/src/lib/crypto.ts` (MEMBERSHIP_VKEY, BID_RANGE_VKEY)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| snarkjs | 0.7.6 (current latest) | Groth16 proof generation (`fullProve`) in agent-client; Groth16 proof verification (`groth16.verify`) in engine | Only JavaScript/WASM Groth16 library. Already in use. `groth16.verify` confirmed working in CF Workers via lazy import pattern already in codebase. `groth16.fullProve` runs in Node.js (agent-client context) using filesystem for `.wasm` + `.zkey` files. |
| circomlibjs | 0.1.7 (current latest) | `buildPoseidon` for Merkle witness computation in circuit test harness | Required by circuit tests in `circuits/test/` — already used. Provides Poseidon hash with the same BN254 F field semantics as the Circom circuits. |
| poseidon-lite | 0.3.0 (current latest) | Poseidon hash in `packages/crypto` and engine (CF Workers compatible) | Zero-dependency, pure JS Poseidon on BN254 — works in CF Workers without WASM instantiation issues. Already the canonical hash in the event chain. |
| @modelcontextprotocol/sdk | 1.27.1 (current latest) | MCP server tool registration with nested Zod schemas for ZK proof payloads | Already in use. `server.registerTool()` with `inputSchema: z.object({...})` supports nested objects including `z.array(z.string())` for proof pi_a/pi_b/pi_c arrays and publicSignals. |
| zod | ^3.25.0 (existing) | Schema validation for ZK proof payloads in MCP tool inputSchema | Peer dep of MCP SDK. v3 is correct — SDK v1.27 requires Zod v3; Zod v4 causes `w._parse is not a function` errors (confirmed GitHub issue #1429). Do NOT upgrade to Zod v4 until MCP SDK explicitly supports it. |
| viem | 2.46.2 (existing) | EIP-712 signing in agent-client and MCP signer | Already wired for `signJoin` / `signBid`. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| poseidon-lite | 0.3.0 | Poseidon hash for Merkle tree construction in `packages/crypto/onboarding.ts` | Always — replaces circomlibjs `buildPoseidon` in the shared crypto lib. CF Workers compatible. |
| circomlibjs | 0.1.7 | `buildPoseidon` for circuit test scripts in `circuits/test/*.js` | Only in circuit test harness (Node.js CJS context). Not needed in agent-client or engine. |
| ethers | 6.13.x (in packages/crypto) | `ethers.randomBytes(32)` for secret generation in `onboarding.ts` | Already used in `packages/crypto/src/onboarding.ts`. Do not add ethers to agent-client or MCP server — use viem instead. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| tsx | TypeScript execution for agent-client and MCP server | Already used. Required for running `.ts` files directly in Node.js without separate compile step. |
| vitest | Unit testing for packages/crypto and engine | Already used. `--experimental-vm-modules` flag required for packages/crypto (ESM + snarkjs). |
| wrangler 4.67.x | CF Workers deploy + local dev | Already in engine devDeps. Use for testing engine ZK verification locally. |
| @cloudflare/vitest-pool-workers 0.12.x | Run vitest tests in real CF Workers miniflare environment | Already in engine devDeps. Use for engine ZK verification tests — validates snarkjs lazy import works. |

---

## Key Integration Patterns

### Pattern 1: snarkjs `fullProve` in Agent-Client (Node.js)

`groth16.fullProve` requires filesystem access to read `.wasm` and `.zkey` files. This is a Node.js-only operation. The agent-client runs in Node.js via `tsx`, so standard file paths work.

The existing `packages/crypto/src/proof-generator.ts` already implements this correctly:

```typescript
import * as snarkjs from "snarkjs";
// Resolves paths relative to package root → circuits/ directory
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  circuitInput,
  wasmPath("RegistryMembership"),   // absolute path to .wasm
  zkeyPath("registry_member")       // absolute path to _final.zkey
);
```

The agent-client needs to import `generateMembershipProof` and `generateBidRangeProof` from `@agent-auction/crypto` (which wraps this) and pass the result as a `proof` field in the action payload sent to the engine.

**Performance note:** `fullProve` for a ~12K constraint circuit takes 2–15 seconds in snarkjs (pure JS WASM, single-threaded). This is acceptable for agent-client usage but not for server-side operations. Proof generation stays client-side; verification stays server-side.

### Pattern 2: snarkjs `groth16.verify` in CF Workers (Engine)

`groth16.verify` is computationally cheap (~50–400ms) and does NOT require filesystem — it uses inlined vkeys. The engine already implements this correctly using lazy import to avoid `URL.createObjectURL` issues:

```typescript
// engine/src/lib/crypto.ts — existing correct pattern
let _snarkjs: typeof import('snarkjs') | null = null
async function getSnarkjs() {
  if (!_snarkjs) {
    _snarkjs = await import('snarkjs')  // lazy — avoids ffjavascript init at module load
  }
  return _snarkjs
}
```

The MEMBERSHIP_VKEY and BID_RANGE_VKEY are already inlined as const objects in `engine/src/lib/crypto.ts`. Do not change this pattern — it is the correct CF Workers approach.

### Pattern 3: ZK Proof Payload Schema in MCP Tools

MCP tool `inputSchema` (Zod) supports nested objects and arrays. A Groth16 proof payload schema:

```typescript
const ProofSchema = z.object({
  pi_a: z.array(z.string()),
  pi_b: z.array(z.array(z.string())),
  pi_c: z.array(z.string()),
  protocol: z.string(),
  curve: z.string(),
}).optional()

const PublicSignalsSchema = z.array(z.string()).optional()
```

This is fully supported by `@modelcontextprotocol/sdk` v1.27. AI models can populate these fields from proof generation output — the values are arrays of decimal strings (bigint encoded as string), not binary.

The MCP `join_auction` and `place_bid` tools need a `proof` optional parameter added to their existing `inputSchema`. The agent-client generates the proof externally and passes it as a tool argument.

### Pattern 4: Merkle Witness Computation for RegistryMembership Circuit

The `RegistryMembership` circuit requires a 20-level Merkle proof: `pathElements[20]` and `pathIndices[20]`. The `packages/crypto/src/onboarding.ts` already has `buildPoseidonMerkleTree` and `getMerkleProof` using `poseidon-lite` (CF Workers compatible, consistent with circuit).

The agent-client needs `AgentPrivateState` persisted (as JSON file or env vars) from the onboarding step, then loaded to extract `leafHashes`, `agentSecret`, `leafIndex`, and compute the Merkle proof at bid time.

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Zod v4 in MCP server | MCP SDK v1.27 requires Zod v3. Zod v4 causes `w._parse is not a function` runtime errors in tool execution (confirmed GitHub issue #1429). The SDK's internal typing uses Zod v3 internals. | Zod ^3.25.0 (existing) |
| `circomlibjs.buildPoseidon` in engine or agent-client | It's Node.js CJS, requires WASM instantiation that fails in CF Workers, and adds complexity. `poseidon-lite` is already the canonical engine/client Poseidon. | poseidon-lite ^0.3.0 |
| `groth16.fullProve` in the engine (CF Workers) | `fullProve` requires fs to read `.wasm` and `.zkey` files — CF Workers has no filesystem. Proof generation must happen client-side. | `groth16.verify` only in engine (uses inlined vkeys) |
| `rapidsnark` or native prover binaries | Native binaries don't run in Node.js without FFI or subprocess overhead; adds build complexity not warranted for hackathon. snarkjs `fullProve` is sufficient for ~12K constraints. | snarkjs 0.7.6 |
| On-chain Solidity Groth16 verifier | Out of scope per PROJECT.md. Adds gas cost and new contract without demo value — off-chain snarkjs verify in engine is sufficient. | snarkjs in engine (existing) |
| ethers v5 | Project uses ethers v6 (in packages/crypto). v5 has different APIs (`ethers.utils.*` vs top-level). | ethers ^6.13 (existing in packages/crypto) |

---

## Installation

No new packages needed. The entire stack for ZK E2E wiring uses existing dependencies. The work is integration, not new library adoption.

```bash
# Confirm all packages are at correct versions
cd /path/to/repo

# packages/crypto — proof generation + Merkle tree
cd packages/crypto
npm install  # snarkjs ^0.7.5, poseidon-lite ^0.3.0

# engine — proof verification (CF Workers)
cd engine
npm install  # snarkjs ^0.7.6, @cloudflare/vitest-pool-workers ^0.12.14

# mcp-server — ZK proof payload schema
cd mcp-server
npm install  # @modelcontextprotocol/sdk ^1.27.0, zod ^3.25.0

# agent-client — will import from packages/crypto for proof generation
cd agent-client
npm install  # no new deps needed; add @agent-auction/crypto as workspace dep

# circuits — test harness only
cd circuits
npm install  # snarkjs ^0.7.5, circomlibjs ^0.1.7
```

Only addition needed: `agent-client` should reference `@agent-auction/crypto` as a local workspace dependency (same as `engine` does with `"@agent-auction/crypto": "file:../packages/crypto"`).

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| snarkjs 0.7.6 `fullProve` (agent-client) | rapidsnark C++ prover | Only when proof generation time >30s becomes a UX problem. Not needed for ~12K constraint circuits. |
| snarkjs lazy import (engine) | snarkjs-ses fork (Galactica-corp) | If CF Workers ever blocks snarkjs `ffjavascript` dynamic behavior even with lazy import. Low risk — existing lazy import pattern confirmed working. |
| poseidon-lite (engine + client) | circomlibjs buildPoseidon | If circuit test harness needs to exactly replicate circomlibjs field arithmetic. Only use circomlibjs in `circuits/test/` scripts, not in shared packages. |
| Zod ^3.25 (MCP server) | Zod v4 | After MCP SDK explicitly releases v4 support (track issue #1429). ETA unknown as of 2026-03-02. |
| Off-chain snarkjs verify (engine) | Solidity Groth16 verifier (on-chain) | When gas efficiency matters and on-chain proof verification is a product requirement. P1 feature per PROJECT.md. |

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| snarkjs@0.7.6 | Node.js >= 16 | Requires `--experimental-vm-modules` for ESM test runners (packages/crypto) |
| snarkjs@0.7.6 | Cloudflare Workers (verify only) | lazy `await import('snarkjs')` required; `fullProve` NOT supported (requires fs) |
| @modelcontextprotocol/sdk@1.27.x | zod@^3.25.x | Requires Zod v3. Zod v4 breaks tool execution with `w._parse is not a function` |
| circomlibjs@0.1.7 | Node.js CJS only | Not compatible with CF Workers; not compatible with ESM without CommonJS interop |
| poseidon-lite@0.3.0 | CF Workers, Node.js, ESM, CJS | Zero dependencies, pure JS — works everywhere |
| circom 2.1.0 (circuit pragma) | snarkjs@0.7.x | Circuit was compiled with Circom 2.1.0; snarkjs 0.7.x is the matching verifier |

---

## Sources

- npm registry direct query (`npm show [package] version`) — snarkjs@0.7.6, circomlibjs@0.1.7, poseidon-lite@0.3.0, @modelcontextprotocol/sdk@1.27.1 (HIGH confidence, retrieved 2026-03-02)
- `engine/src/lib/crypto.ts` — existing lazy import pattern, inlined vkeys, `groth16.verify` usage (HIGH confidence — codebase ground truth)
- `packages/crypto/src/proof-generator.ts` — `groth16.fullProve` usage with filesystem paths (HIGH confidence — codebase ground truth)
- `packages/crypto/src/onboarding.ts` — `buildPoseidonMerkleTree` + `getMerkleProof` implementation (HIGH confidence — codebase ground truth)
- GitHub issue modelcontextprotocol/modelcontextprotocol#1429 — Zod v4 incompatibility with MCP SDK v1.17.5+ (MEDIUM confidence — issue exists, version it was fixed in unverified as of research date)
- https://developers.cloudflare.com/workers/platform/limits/ — CF Workers CPU time limits (paid plan: 5 min); Durable Objects (same) (HIGH confidence — official Cloudflare docs)
- GitHub issue iden3/snarkjs#107 — fullProve WASM filesystem dependency (MEDIUM confidence — issue confirmed fs/WASM dependency, but from older version; current behavior inferred from codebase evidence)
- WebSearch: snarkjs groth16 verify ~400ms benchmark on BN254 (LOW confidence — single source, no official benchmark; treat as order-of-magnitude estimate only)

---

## Stack Patterns by Variant

**For proof generation (agent-client, runs in Node.js):**
- Use `generateMembershipProof` / `generateBidRangeProof` from `@agent-auction/crypto`
- These call `snarkjs.groth16.fullProve` with filesystem paths to `.wasm` and `.zkey`
- Proof output (`{ proof, publicSignals }`) is serializable JSON — pass directly in HTTP/MCP payload

**For proof verification (engine, runs in CF Workers):**
- Use `verifyMembershipProof` / `verifyBidRangeProof` from `engine/src/lib/crypto.ts`
- These call `snarkjs.groth16.verify` with inlined vkeys — no filesystem required
- Already gated by `ENGINE_REQUIRE_PROOFS` env flag

**For Merkle witness data (agent-client, offline onboarding):**
- Use `buildPoseidonMerkleTree` + `getMerkleProof` from `packages/crypto/src/onboarding.ts`
- Outputs `{ pathElements: bigint[], pathIndices: number[], root: bigint }` matching circuit input format
- Agent must persist `AgentPrivateState` between sessions (JSON file or secure env)

**For MCP tool schema (mcp-server):**
- Add optional `proof` + `publicSignals` parameters to `join_auction` and `place_bid` tools
- Use `z.object({ pi_a: z.array(z.string()), pi_b: z.array(z.array(z.string())), pi_c: z.array(z.string()), protocol: z.string(), curve: z.string() }).optional()` for proof
- Use `z.array(z.string()).optional()` for publicSignals
- MCP SDK 1.27 fully supports nested array schemas

---

*Stack research for: ZK proof E2E wiring — Agent Auction Platform (Chainlink 2026 Hackathon)*
*Researched: 2026-03-02*
