# Phase 3: Agent-Client ZK Integration - Research

**Researched:** 2026-03-03
**Domain:** snarkjs Groth16 proof generation, agent private state persistence, error taxonomy, EIP-712 Poseidon nullifier integration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Proof submission path**
- Agent-client generates proofs **locally** using `@agent-auction/crypto` (snarkjs fullProve) — secrets never leave the process
- Proofs submitted via **direct engine HTTP** (existing `engineFetch` pattern), not MCP tools — extend `joinAuction()` and `placeBid()` to include proof payloads
- **Replace keccak path entirely** in `privacy.ts` with Poseidon primitives from `@agent-auction/crypto` — the keccak commitment was a pre-ZK placeholder
- EIP-712 signature uses the **Poseidon nullifier** from the proof's public signals (matches what MCP signer already does when proofs are present)

**State persistence**
- Reuse existing **`agent-N.json`** files from `packages/crypto/test-agents/` — same format MCP server already understands, loaded via `AGENT_STATE_FILE` env var
- **Track used nullifiers** in the state file — append `usedNullifiers` array after successful joins to prevent wasted proof generation on re-runs
- **Rebuild Merkle witness** from `leafHashes` each time (tree is small, <100ms) — no stale witness risk
- **Cache registry root with 5-min TTL** — same pattern as MCP server's `proof-generator.ts`

**Error UX for agents**
- **Structured ZK error types**: `ZkProofError`, `NullifierReusedError`, `BidOutOfRangeError` — each carries code + detail + suggestion, matching MCP's structured error format
- **Pre-validate bid range locally** before generating proof — check `bid >= reservePrice && bid <= maxBudget` instantly, throw `BidOutOfRangeError` with exact constraint violated, no wasted ~2s proof generation
- **Console-only logging** via existing `logStep()` pattern — no log files
- **Fail immediately** on engine rejection — no automatic retry; log structured error and let caller decide

**Demo flow design**
- **Modify existing `index.ts`** demo script to use real ZK proofs — one script, one flow, no parallel scripts
- **Show failure cases** after happy path: (1) double-join with same nullifier → rejected, (2) bid outside declared range → pre-validation error. Proves privacy guarantees are real.
- **Keep 3 agents** — all register, generate proofs, join, bid. Thorough test of multi-agent Merkle tree
- **Print proof generation timing** (e.g., "Membership proof generated in 1.8s") — shows judges real Groth16 proofs, not stubs

### Claude's Discretion
- Internal module structure (whether to create a new `zk.ts` module or extend `privacy.ts`)
- Exact error class hierarchy and naming
- How to wire the `@agent-auction/crypto` dependency into agent-client's build
- Whether to extract shared proof-gen helpers between agent-client and MCP server

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AGZK-01 | Agent-client can generate real RegistryMembership Groth16 proof via snarkjs | `generateMembershipProof()` from `@agent-auction/crypto` wraps `snarkjs.groth16.fullProve` with circuit wasm+zkey from `circuits/keys/`. Mirror `mcp-server/src/lib/proof-generator.ts::generateMembershipProofForAgent()`. |
| AGZK-02 | Agent-client can generate real BidRange Groth16 proof via snarkjs | `generateBidRangeProof()` from `@agent-auction/crypto`. Mirror `generateBidRangeProofForAgent()`. Pre-validate range locally before calling fullProve. |
| AGZK-03 | Agent private state persisted across sessions (secrets, nullifiers, Merkle witness) | Load from `agent-N.json` via `loadAgentState()` pattern. Add `usedNullifiers` array to state file. Rebuild tree each run from `leafHashes`. |
| AGZK-04 | BidRange constraint failures caught and translated to meaningful error messages | Pre-validate `bid >= reservePrice && bid <= maxBudget` before proof generation. Throw `BidOutOfRangeError`. snarkjs throws (not returns) on constraint violation — catch and wrap. |
</phase_requirements>

---

## Summary

This phase wires real Groth16 ZK proof generation into the agent-client. All the infrastructure exists: circuits are compiled and proven keys are in `circuits/keys/`, the `@agent-auction/crypto` SDK exposes `generateMembershipProof()` and `generateBidRangeProof()` via snarkjs, the engine already verifies real proofs (MCPE-04 complete), and the MCP server's `proof-generator.ts` provides a complete reference implementation to mirror.

The work is straightforward plumbing: (1) add `@agent-auction/crypto` as a `file:` dependency to `agent-client/package.json`, (2) rewrite `privacy.ts` into a ZK module that loads agent state and generates proofs, (3) extend `joinAuction()` and `placeBid()` in `auction.ts` to include proof payloads and use the Poseidon nullifier in the EIP-712 signature, (4) persist used nullifiers back to the state file, (5) update `index.ts` to demonstrate happy path + two failure cases. The engine action handler already handles everything correctly — the agent-client just needs to provide the proof payload in the existing `proof` field of the action request.

The critical integration detail is the EIP-712 nullifier: for ZK-enabled joins, the nullifier in the `Join` typed data message MUST be the Poseidon nullifier from `publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER]` (index 2), not the keccak fallback. This is already the pattern in `mcp-server/src/lib/signer.ts::signJoin()` and must be replicated exactly.

**Primary recommendation:** Mirror `mcp-server/src/lib/proof-generator.ts` directly — create `agent-client/src/zk.ts` with `loadAgentState()`, `generateMembershipProofForAgent()`, `generateBidRangeProofForAgent()`, and `fetchRegistryRoot()` as a near-identical copy, then wire into `auction.ts` `joinAuction()` and `placeBid()`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@agent-auction/crypto` | `file:../packages/crypto` (0.1.0) | generateMembershipProof, generateBidRangeProof, buildPoseidonMerkleTree, getMerkleProof, loadAgentState pattern, MEMBERSHIP_SIGNALS | Already used by mcp-server, contains all ZK primitives, wraps snarkjs |
| `snarkjs` | `^0.7.5` (transitive via @agent-auction/crypto) | Groth16 fullProve — called through crypto SDK, not directly | Project standard; circuits compiled for snarkjs groth16 format |
| `node:fs` | built-in | Read/write agent-N.json state file | No alternative needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ethers` | `^6.13.0` (transitive) | `JsonRpcProvider` for `fetchRegistryRoot` RPC call | Needed by `readRegistryRoot()` from `@agent-auction/crypto` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `file:` dependency on @agent-auction/crypto | Copy-paste proof-gen code | Copy-paste creates drift; file: dep is already used by mcp-server and works |
| `generateMembershipProofForAgent` pattern | Direct snarkjs calls | Abstractions already debugged in mcp-server; direct snarkjs needs manual path resolution |

**Installation:**
```bash
cd agent-client
npm install --save "@agent-auction/crypto@file:../packages/crypto"
```

The `@agent-auction/crypto` package is already built (`packages/crypto/dist/` is populated). No build step needed before use.

---

## Architecture Patterns

### Recommended Project Structure

```
agent-client/src/
├── config.ts         # Add AGENT_STATE_FILE, BASE_SEPOLIA_RPC env vars (already partially there)
├── zk.ts             # NEW: ZK proof generation module (mirrors mcp-server/src/lib/proof-generator.ts)
├── privacy.ts        # REWRITE: replace keccak commitment with Poseidon; remove keccak import from viem
├── auction.ts        # EXTEND: joinAuction() and placeBid() accept optional proof payloads
├── index.ts          # EXTEND: load state, generate proofs, show failure cases
├── identity.ts       # unchanged
├── utils.ts          # unchanged
└── wallet-adapter.ts # unchanged
```

### Pattern 1: ZK Module (zk.ts) — Mirror of mcp-server proof-generator

The `mcp-server/src/lib/proof-generator.ts` file is the definitive reference. The agent-client should mirror it closely:

```typescript
// agent-client/src/zk.ts
import fs from 'node:fs'
import { ethers } from 'ethers'
import {
  generateMembershipProof,
  generateBidRangeProof,
  buildPoseidonMerkleTree,
  getMerkleProof,
  readRegistryRoot,
  generateSecret,
  type AgentPrivateState,
  type Groth16Proof,
} from '@agent-auction/crypto'

const AGENT_PRIVACY_REGISTRY = '0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff'
const ROOT_CACHE_TTL_MS = 5 * 60 * 1000

let registryRootCache: { root: bigint; fetchedAt: number } | null = null

// Deserialize bigint from trailing-"n" format used in agent-N.json
function deserializeBigInt(value: string): bigint {
  const str = value.endsWith('n') ? value.slice(0, -1) : value
  return BigInt(str)
}

export interface AgentStateWithNullifiers extends AgentPrivateState {
  usedNullifiers: string[]
}

export function loadAgentState(filePath: string): AgentStateWithNullifiers {
  const raw = fs.readFileSync(filePath, 'utf-8')
  const parsed = JSON.parse(raw)
  return {
    agentId: deserializeBigInt(parsed.agentId),
    agentSecret: deserializeBigInt(parsed.agentSecret),
    salt: deserializeBigInt(parsed.salt),
    capabilities: (parsed.capabilities as Array<{ capabilityId: string }>).map((c) => ({
      capabilityId: deserializeBigInt(c.capabilityId),
    })),
    leafHashes: (parsed.leafHashes as string[]).map(deserializeBigInt),
    capabilityMerkleRoot: deserializeBigInt(parsed.capabilityMerkleRoot),
    registrationCommit: parsed.registrationCommit as string,
    usedNullifiers: (parsed.usedNullifiers ?? []) as string[],
  }
}

export function persistNullifier(filePath: string, nullifier: string): void {
  const state = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  const used: string[] = state.usedNullifiers ?? []
  if (!used.includes(nullifier)) {
    used.push(nullifier)
    state.usedNullifiers = used
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2))
  }
}

export async function fetchRegistryRoot(rpcUrl: string): Promise<bigint> {
  const now = Date.now()
  if (registryRootCache && now - registryRootCache.fetchedAt < ROOT_CACHE_TTL_MS) {
    return registryRootCache.root
  }
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const rootHex = await readRegistryRoot(AGENT_PRIVACY_REGISTRY, provider)
  const root = BigInt(rootHex)
  registryRootCache = { root, fetchedAt: now }
  return root
}

export async function generateMembershipProofForAgent(
  agentState: AgentPrivateState,
  auctionId: bigint,
  registryRoot: bigint,
): Promise<{ proof: Groth16Proof; publicSignals: string[] }> {
  const treeResult = await buildPoseidonMerkleTree(agentState.leafHashes)
  const merkleProof = getMerkleProof(0, treeResult.layers, (treeResult as any).zeroHashes)
  return generateMembershipProof({
    agentSecret: agentState.agentSecret,
    capabilityId: agentState.capabilities[0].capabilityId,
    leafIndex: 0n,
    pathElements: merkleProof.pathElements,
    pathIndices: merkleProof.pathIndices,
    auctionId,
    salt: agentState.salt,
    registryRoot,
  })
}

export async function generateBidRangeProofForAgent(
  bidAmount: bigint,
  reservePrice: bigint,
  maxBudget: bigint,
): Promise<{ proof: Groth16Proof; publicSignals: string[] }> {
  const effectiveMaxBudget = maxBudget === 0n ? BigInt(2 ** 48) : maxBudget
  const bidSalt = generateSecret()
  return generateBidRangeProof({
    bid: bidAmount,
    salt: bidSalt,
    reservePrice,
    maxBudget: effectiveMaxBudget,
  })
}
```

### Pattern 2: Structured ZK Error Classes

```typescript
// agent-client/src/zk.ts (error section)

export class ZkProofError extends Error {
  readonly code: string
  readonly detail: string
  readonly suggestion: string
  constructor(code: string, detail: string, suggestion: string) {
    super(detail)
    this.name = 'ZkProofError'
    this.code = code
    this.detail = detail
    this.suggestion = suggestion
  }
}

export class NullifierReusedError extends ZkProofError {
  constructor(nullifier: string, auctionId: string) {
    super(
      'NULLIFIER_REUSED',
      `Nullifier ${nullifier} already spent for auction ${auctionId}`,
      'This agent has already joined this auction. Each agent can only join once per auction.',
    )
    this.name = 'NullifierReusedError'
  }
}

export class BidOutOfRangeError extends ZkProofError {
  constructor(bid: bigint, reservePrice: bigint, maxBudget: bigint) {
    const constraint = bid < reservePrice
      ? `bid ${bid} < reservePrice ${reservePrice}`
      : `bid ${bid} > maxBudget ${maxBudget}`
    super(
      'BID_OUT_OF_RANGE',
      `Bid violates range constraint: ${constraint}`,
      `Bid must satisfy reservePrice (${reservePrice}) <= bid <= maxBudget (${maxBudget})`,
    )
    this.name = 'BidOutOfRangeError'
  }
}
```

### Pattern 3: EIP-712 Nullifier Wiring in auction.ts joinAuction()

The current `joinAuction()` derives a keccak nullifier and passes `proof: null`. The new version must:
1. Accept `proofPayload` parameter
2. Extract Poseidon nullifier from `publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER]` (index 2)
3. Use that nullifier in the EIP-712 `Join` message

```typescript
// auction.ts — joinAuction() signature extension
import { MEMBERSHIP_SIGNALS } from '@agent-auction/crypto'

export async function joinAuction(params: {
  auctionId: `0x${string}`
  agentId: bigint
  bondAmount: bigint
  nonce: number
  signer: WalletSignerAdapter
  proofPayload?: { proof: unknown; publicSignals: string[] }  // NEW
}): Promise<EngineActionResponse> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300)
  const wallet = await params.signer.getAddress()

  let nullifier: bigint
  if (params.proofPayload) {
    // Poseidon nullifier from ZK proof — MUST match what engine extracts
    nullifier = BigInt(params.proofPayload.publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER])
  } else {
    // Legacy keccak fallback
    nullifier = deriveJoinNullifier(wallet, params.auctionId)
  }

  const signature = await params.signer.signTypedData({
    domain: EIP712_DOMAIN,
    types: JOIN_TYPES,
    primaryType: 'Join',
    message: {
      auctionId: BigInt(params.auctionId),
      nullifier,
      depositAmount: params.bondAmount,
      nonce: BigInt(params.nonce),
      deadline,
    },
  })

  const payload = {
    type: 'JOIN',
    agentId: params.agentId.toString(),
    wallet,
    amount: params.bondAmount.toString(),
    nonce: params.nonce,
    deadline: deadline.toString(),
    signature,
    proof: params.proofPayload ?? null,  // CHANGED from hardcoded null
  }
  // ... rest of retry loop unchanged
}
```

### Pattern 4: BID proof attachment (no nullifier change needed)

The BID EIP-712 type has no nullifier field. The proof is attached AFTER signing (object spread), consistent with the MCP server:

```typescript
export async function placeBid(params: {
  auctionId: `0x${string}`
  agentId: bigint
  amount: bigint
  nonce: number
  signer: WalletSignerAdapter
  proofPayload?: { proof: unknown; publicSignals: string[] }  // NEW
}): Promise<EngineActionResponse> {
  // ... sign as before (BID types unchanged) ...
  return engineFetch<EngineActionResponse>(`/auctions/${params.auctionId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'BID',
      agentId: params.agentId.toString(),
      wallet,
      amount: params.amount.toString(),
      nonce: params.nonce,
      deadline: deadline.toString(),
      signature,
      proof: params.proofPayload ?? null,  // NEW — attached after signing
    }),
  })
}
```

### Pattern 5: Pre-validation before BidRange proof generation

```typescript
// In zk.ts or inline at call site:
export function validateBidRange(bid: bigint, reservePrice: bigint, maxBudget: bigint): void {
  if (bid < reservePrice) throw new BidOutOfRangeError(bid, reservePrice, maxBudget)
  const effective = maxBudget === 0n ? BigInt(2 ** 48) : maxBudget
  if (bid > effective) throw new BidOutOfRangeError(bid, reservePrice, effective)
}
```

### Pattern 6: index.ts — loading state per agent

Each agent needs its own state file. The env-based `AGENT_STATE_FILE` works for single-agent MCP, but the demo runs 3 agents. The recommended approach: `AGENT_STATE_FILES` env var with comma-separated paths, or derive from `AGENT_STATE_FILE_PREFIX`:

```typescript
// config.ts addition
export function getAgentStateFiles(count: number): string[] {
  const env = process.env.AGENT_STATE_FILES
  if (env) {
    return env.split(',').map(s => s.trim()).slice(0, count)
  }
  // Default: look for agent-1.json, agent-2.json, agent-3.json relative to cwd
  // or in packages/crypto/test-agents/
  const prefix = process.env.AGENT_STATE_DIR ?? '../packages/crypto/test-agents'
  return Array.from({ length: count }, (_, i) => `${prefix}/agent-${i + 1}.json`)
}
```

### Pattern 7: Demo flow with timing and failure cases in index.ts

```typescript
// Show proof timing
logStep('zk', 'generating RegistryMembership proof...')
const t0 = Date.now()
const membershipProof = await generateMembershipProofForAgent(agentState, BigInt(auction.auctionId), registryRoot)
logStep('zk', `Membership proof generated in ${Date.now() - t0}ms`)

// After happy path: demonstrate double-join rejection
logStep('demo', '--- Demonstrating double-join prevention ---')
try {
  await joinAuction({ ...sameParams, proofPayload: membershipProof })
  throw new Error('Expected NullifierReusedError but join succeeded!')
} catch (err) {
  if (err instanceof Error && err.message.includes('Nullifier already')) {
    logStep('security', `PASS: double-join rejected — ${err.message}`)
  } else throw err
}

// Demonstrate out-of-range bid pre-validation
logStep('demo', '--- Demonstrating bid range pre-validation ---')
try {
  validateBidRange(BigInt(1), reservePrice, maxBudget)  // bid=1 below reserve
} catch (err) {
  if (err instanceof BidOutOfRangeError) {
    logStep('security', `PASS: out-of-range bid caught — ${err.detail}`)
  } else throw err
}
```

### Anti-Patterns to Avoid

- **Using MEMBERSHIP_SIGNALS.NULLIFIER = 2 literally:** Always import from `@agent-auction/crypto` — the constant is the canonical source of truth. Hard-coding index 2 creates silent bugs if circuit signals reorder.
- **Not persisting nullifier before engine call:** If the engine call fails after a successful proof generation, the nullifier is effectively "lost" but the proof was valid. Persist the nullifier to the state file AFTER a successful engine response, not before.
- **Generating BidRange proof before local validation:** snarkjs fullProve takes ~1-2 seconds and throws unclearly on constraint violation. Always pre-validate `bid >= reservePrice && bid <= maxBudget` before calling fullProve to produce a clean error immediately.
- **Using keccak nullifier with ZK proof:** The engine's `handleJoin` reads `publicSignals[2]` as the nullifier for spent-nullifier checking. If the EIP-712 message uses the keccak nullifier but the proof contains a Poseidon nullifier, signature verification fails because the message hash won't match.
- **Importing `snarkjs` directly in agent-client:** The `proof-generator.ts` in `@agent-auction/crypto` handles the wasm/zkey path resolution relative to the `circuits/` directory. Direct snarkjs calls require manually resolving these paths.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Groth16 proof generation | Custom prover | `generateMembershipProof()`, `generateBidRangeProof()` from `@agent-auction/crypto` | Already resolves wasm/zkey paths relative to circuits/; handles snarkjs fullProve API |
| Poseidon Merkle tree | Custom tree | `buildPoseidonMerkleTree()`, `getMerkleProof()` from `@agent-auction/crypto` | Matches circuit's tree structure exactly; path element ordering must match circuit witness |
| BigInt JSON serialization | Custom serializer | Follow trailing-"n" convention + `deserializeBigInt()` helper | agent-N.json files use this format; mcp-server already does it correctly |
| Registry root fetch | Custom eth_call | `readRegistryRoot()` from `@agent-auction/crypto` + ethers `JsonRpcProvider` | Same pattern as mcp-server; caching TTL already proven |
| Signal index constants | Hard-coded numbers | `MEMBERSHIP_SIGNALS`, `BID_RANGE_SIGNALS` from `@agent-auction/crypto` | Source of truth; used by engine verifier too |

**Key insight:** The mcp-server's `proof-generator.ts` already solved every non-trivial problem in this domain. The agent-client implementation is a near-copy with file-system state persistence added.

---

## Common Pitfalls

### Pitfall 1: EIP-712 nullifier mismatch
**What goes wrong:** joinAuction signs with keccak nullifier but proof contains Poseidon nullifier → engine's `verifySignature()` calls `verifyActionSignature()` with the Poseidon nullifier extracted from proof → signature doesn't match → "Invalid EIP-712 signature" error.
**Why it happens:** The legacy `deriveJoinNullifier()` in `auction.ts` is keccak-based. The engine extracts the nullifier from `proof.publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER]` for the EIP-712 message reconstruction.
**How to avoid:** When `proofPayload` is present, use `BigInt(proofPayload.publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER])` as the nullifier in the signed message. This is already the pattern in `mcp-server/src/lib/signer.ts::signJoin()`.
**Warning signs:** Engine returns "Invalid EIP-712 signature" despite correct private key.

### Pitfall 2: snarkjs fullProve throws on constraint violation (not returns error)
**What goes wrong:** A bid outside the declared range causes `snarkjs.groth16.fullProve` to throw, not return a result with `RANGE_OK=0`. If not wrapped, the demo crashes with an unhandled exception.
**Why it happens:** Circom circuit constraints are enforced at witness computation time. Unsatisfied constraints throw from the WASM witness builder.
**How to avoid:** Pre-validate locally before calling fullProve. Also wrap fullProve calls in try/catch and translate snarkjs throws to `ZkProofError` with a clear message.
**Warning signs:** Unhandled "Error: Assert Failed" from snarkjs WASM module.

### Pitfall 3: Stale or mismatched registry root
**What goes wrong:** Proof is generated against an old Poseidon Merkle root. Engine's `expectedRegistryRoot` check (if enabled) may reject it.
**Why it happens:** The `registryRoot` passed to `generateMembershipProof()` is embedded in the circuit's public signals. If the on-chain root has changed (new agent registered), the proof is for a different root.
**How to avoid:** Always call `fetchRegistryRoot()` just before generating the membership proof. The 5-min cache is acceptable — during a demo session the root won't change. If the engine rejects with "membership proof invalid", fetch a fresh root and retry once.
**Warning signs:** Engine returns "Invalid membership proof" despite correct secrets.

### Pitfall 4: @agent-auction/crypto not installed in agent-client
**What goes wrong:** `npm run start` crashes with "Cannot find package '@agent-auction/crypto'".
**Why it happens:** `agent-client/package.json` currently has NO `@agent-auction/crypto` dependency. The mcp-server uses `"file:../packages/crypto"` but the agent-client does not.
**How to avoid:** Add `"@agent-auction/crypto": "file:../packages/crypto"` to agent-client's dependencies and run `npm install`.
**Warning signs:** Module not found error at runtime before any proof generation.

### Pitfall 5: crypto dist not rebuilt after code changes
**What goes wrong:** `@agent-auction/crypto` changes not visible in agent-client because `dist/` is stale.
**Why it happens:** `file:` dependencies use the built `dist/` output. TypeScript changes to `packages/crypto/src/` require `npm run build` in that package.
**How to avoid:** The dist is already built and the relevant exports (proof-generator, signal-indices, onboarding) are in `dist/`. No rebuild needed unless crypto package is modified in this phase.
**Warning signs:** Type errors mentioning outdated function signatures.

### Pitfall 6: Multi-agent state — each agent needs its own state file
**What goes wrong:** Three agents sharing one state file means agent-1's secret is used for all three → wrong agentId, wrong leafHash, wrong Merkle proof → proof verification failure.
**Why it happens:** The demo runs 3 agents but the MCP server was designed for single-agent use (`AGENT_STATE_FILE` singular).
**How to avoid:** Use `AGENT_STATE_FILES` (comma-separated) or `AGENT_STATE_DIR` + index convention. Map each `agentId` to its own `agent-N.json`. See Pattern 6 above.
**Warning signs:** All three agents produce the same proof (same agentSecret, same nullifier).

### Pitfall 7: nullifier persistence write after engine call
**What goes wrong:** Nullifier is persisted to the state file BEFORE the engine call, then the engine call fails (network, validation). Now the agent thinks it joined but it didn't — `usedNullifiers` blocks future join attempts.
**Why it happens:** Overly defensive persistence strategy.
**How to avoid:** Write nullifier to `usedNullifiers` AFTER a successful engine response. If the engine returns a 200 with `seq`, the nullifier is committed on the engine side — only then persist locally.

---

## Code Examples

### Dependency installation
```bash
cd /path/to/auction-design/agent-client
# Add to package.json dependencies manually or via:
npm install --save-dev "@agent-auction/crypto@file:../packages/crypto"
```

### Loading agent state from test-agents/
```typescript
// Source: mcp-server/src/lib/proof-generator.ts (verified)
const agentState = loadAgentState('../packages/crypto/test-agents/agent-1.json')
// agentState.agentId = 1n
// agentState.agentSecret = 485223...n (bigint)
// agentState.leafHashes = [535586...n]  (1 leaf for single capability)
// agentState.capabilities = [{ capabilityId: 1n }]
```

### agent-N.json format (verified from test-agents/agent-1.json)
```json
{
  "agentId": "1n",
  "agentSecret": "48522356348147806962650576748431149313794733673002242294742474058282018015649n",
  "salt": "93316576990977548274287248231356764445495433193208458199475627546817858158110n",
  "capabilities": [{ "capabilityId": "1n" }],
  "leafHashes": ["5355868530869969814004341200158693275797967109316430686351562446010717716626n"],
  "capabilityMerkleRoot": "14499290734076608881305220656338019461512843868363993420666618569603816482327n",
  "registrationCommit": "0x47b3e17f5a4a4e4a694f2739418a284cadb78b8dfc8c73aff11e1a0288a71442"
}
```
BigInt fields use trailing "n" convention. `usedNullifiers` field added by phase 3 (missing from existing files = empty array).

### Engine action payload with proof (verified from engine types)
```typescript
// JOIN with proof
{
  type: 'JOIN',
  agentId: '1',             // bigint.toString()
  wallet: '0x...',
  amount: '50000000',       // bondAmount in base units
  nonce: 0,
  deadline: '1234567890',   // BigInt.toString()
  signature: '0x...',
  proof: {
    proof: { pi_a: [...], pi_b: [[...],[...]], pi_c: [...], protocol: 'groth16', curve: 'bn128' },
    publicSignals: ['registryRoot', 'capabilityCommitment', 'nullifier']  // strings
  }
}

// BID with proof (proof attached AFTER signing — BID type has no nullifier field)
{
  type: 'BID',
  agentId: '1',
  wallet: '0x...',
  amount: '100000000',
  nonce: 0,
  deadline: '1234567890',
  signature: '0x...',
  proof: {
    proof: { pi_a: [...], pi_b: [...], pi_c: [...], protocol: 'groth16', curve: 'bn128' },
    publicSignals: ['rangeOk', 'bidCommitment', 'reservePrice', 'maxBudget']
  }
}
```

### Circuit artifacts location (verified)
```
circuits/
├── RegistryMembership_js/
│   └── RegistryMembership.wasm   # accessed via circuitsDir() in proof-generator.ts
└── keys/
    ├── registry_member_final.zkey
    ├── bid_range_final.zkey
    ├── registry_member_vkey.json  # for verification
    └── bid_range_vkey.json
```
Path resolution: `packages/crypto/src/proof-generator.ts` uses `fileURLToPath(import.meta.url)` to navigate `../../../circuits`. This works when the file is at `packages/crypto/src/` and circuits are at `circuits/`. The `file:` dep installs a symlink/copy in `node_modules` — path resolution must work from the installed location. Verify this works with tsx before assuming it does.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| keccak256 commitment in privacy.ts | Poseidon commitment via @agent-auction/crypto | Phase 1 for crypto SDK; Phase 3 for agent-client | Entire privacy.ts keccak path is now dead code — full replacement |
| `proof: null` in joinAuction/placeBid | proof payload with real Groth16 proof | Phase 3 | Engine was already wired to accept it (Phase 2 complete) |
| Single AGENT_STATE_FILE for MCP | Per-agent state files with usedNullifiers | Phase 3 | Multi-agent demo requires one file per agent |

**Deprecated/outdated:**
- `deriveJoinNullifier()` in `auction.ts`: The keccak fallback function. Kept for backward compatibility with non-ZK joins but the demo will use Poseidon.
- `preparePrivacyState()` in `privacy.ts`: The keccak-based commitment computation. To be replaced with Poseidon from crypto SDK.
- `computeRegistrationCommit()` in `privacy.ts`: Same — keccak version of what `@agent-auction/crypto::computeRegistrationCommit()` does with Poseidon.

---

## Open Questions

1. **Does `proof-generator.ts` wasm path resolution work from agent-client's node_modules?**
   - What we know: `packages/crypto/src/proof-generator.ts` resolves paths via `fileURLToPath(import.meta.url)` navigating `../../../circuits`. This works when imported from `packages/crypto/src/`. When installed as `file:` dep, it's in `node_modules/@agent-auction/crypto/dist/proof-generator.js`, which navigates to `node_modules/@agent-auction/crypto/dist/../../../circuits` — that should resolve to `auction-design/circuits/` (correct, assuming agent-client is at `auction-design/agent-client/`).
   - What's unclear: Whether tsx/Node.js resolves `import.meta.url` correctly for `file:` dependencies vs symlinked packages.
   - Recommendation: Verify wasm path resolution with a quick `node -e "import('./node_modules/@agent-auction/crypto/dist/proof-generator.js')"` test before committing to this approach. If it fails, the fallback is to copy the path resolution logic with an explicit `path.resolve(process.cwd(), '../circuits')` override in `zk.ts`.

2. **Which agentIds/state files correspond to which agents in the demo?**
   - What we know: `test-agents/agent-1.json` has `agentId: "1n"`, agent-2.json has `agentId: "2n"`, agent-3.json has `agentId: "3n"`. The demo currently uses `agentIds = [BigInt(1001), BigInt(1002), BigInt(1003)]`.
   - What's unclear: The test-agents were generated with IDs 1, 2, 3, not 1001, 1002, 1003. The agentId in the state file determines what's committed in the Merkle tree. If the demo uses ID 1001 but loads agent-1.json (ID 1), the proof will assert `agentId=1` but the action will have `agentId=1001` — the engine may reject or ignore this mismatch.
   - Recommendation: Either use agentIds 1, 2, 3 in the demo (matching the test-agent files), OR regenerate state files with IDs 1001, 1002, 1003. Using 1, 2, 3 is simpler and the test-agent files are the canonical pre-registered state.

3. **Are agents 1, 2, 3 already registered in AgentPrivacyRegistry on Base Sepolia?**
   - What we know: Phase 1 plan 03 registered agents and set root `0xca223b34b59d6362ccffa90e04ebaa12ea40bb6d5ef3d9b611e2231126cc50f2`. The `test-agents/agent-N.json` files were committed as the stable anchor.
   - What's unclear: Which specific agentIds were registered. If only test agentIds (not 1001/1002/1003) are in the Merkle tree, the circuit will fail to prove membership.
   - Recommendation: Check the on-chain registry leaf hashes OR regenerate fresh state files at demo time. The safer path: use the existing agent-N.json files (IDs 1/2/3) and update the demo to use those IDs.

---

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `mcp-server/src/lib/proof-generator.ts` — complete reference for loadAgentState, generateMembershipProofForAgent, generateBidRangeProofForAgent, fetchRegistryRoot
- Codebase inspection: `packages/crypto/src/proof-generator.ts` — generateMembershipProof, generateBidRangeProof, wasm/zkey path resolution
- Codebase inspection: `packages/crypto/src/index.ts` — complete export surface of @agent-auction/crypto
- Codebase inspection: `packages/crypto/src/signal-indices.ts` — MEMBERSHIP_SIGNALS.NULLIFIER=2, BID_RANGE_SIGNALS
- Codebase inspection: `packages/crypto/src/nullifier.ts` — Poseidon nullifier formula: `Poseidon(agentSecret, auctionId, 1n)` for JOIN
- Codebase inspection: `engine/src/handlers/actions.ts` — exactly how engine validates JOIN/BID with proofs, nullifier extraction logic
- Codebase inspection: `mcp-server/src/lib/signer.ts` — EIP-712 nullifier switching (Poseidon vs keccak)
- Codebase inspection: `mcp-server/src/tools/join.ts` + `bid.ts` — full proof submission pattern, zkError format
- Codebase inspection: `packages/crypto/test-agents/agent-1.json` — verified BigInt trailing-"n" format, exact field names
- Codebase inspection: `agent-client/src/auction.ts` — current joinAuction/placeBid signatures, keccak deriveJoinNullifier
- Codebase inspection: `agent-client/src/privacy.ts` — keccak-based module to be replaced
- Codebase inspection: `agent-client/package.json` — confirms @agent-auction/crypto NOT yet installed
- Codebase inspection: `mcp-server/package.json` — `"@agent-auction/crypto": "file:../packages/crypto"` is the dependency pattern
- Codebase inspection: `circuits/keys/` — registry_member_final.zkey, bid_range_final.zkey confirmed present
- Codebase inspection: `packages/crypto/dist/` — proof-generator.js, signal-indices.js confirmed built

### Secondary (MEDIUM confidence)
- Phase state decisions: snarkjs throws (not returns) on constraint violation — established in Phase 1 Plan 03 state decisions
- Phase 2 decisions: `signJoin()` Poseidon nullifier gated on proofPayload presence — backward-compatible pattern

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries directly inspected in codebase, dist files verified present
- Architecture: HIGH — exact patterns extracted from working mcp-server reference implementation
- Pitfalls: HIGH — several confirmed from Phase 1/2 state decisions (snarkjs throws, BigInt serialization, nullifier mismatch)
- Open questions: MEDIUM — wasm path resolution requires runtime verification; agentId/state-file mapping requires clarification

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable — no fast-moving dependencies; circuit files and state format are frozen)
