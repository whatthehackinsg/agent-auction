# Phase 2: MCP + Engine Wiring - Research

**Researched:** 2026-03-02
**Domain:** MCP tool extension, EIP-712 nullifier switching, ZK proof pass-through, server-side proof generation
**Confidence:** HIGH — all findings sourced directly from the codebase with zero ambiguity

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Hybrid proof mode**: MCP tools accept EITHER pre-built proofs `{ proof, publicSignals }` OR `generateProof: true` for server-side generation
- **No local MCP verification**: Pre-built proofs are passed through to the engine without local verification — engine is the sole verifier
- **Server-side generation uses**: `generateMembershipProof` / `generateBidRangeProof` from `@agent-auction/crypto` (monorepo import, not bundled artifacts)
- **Merkle witness fetching**: MCP fetches Merkle witness from AgentPrivacyRegistry on-chain (agent only needs agentSecret)
- **Bid range auto-fetch**: MCP auto-fetches `reservePrice` and `maxBudget` from engine's `GET /auctions/:id` — agent just provides bid amount
- **Agent state files**: MCP server reads from existing `agent-N.json` files (created in Phase 1), path configured via `AGENT_STATE_FILE` env var
- **Agent state format**: Files contain `agentSecret` + nullifiers, are git-ignored, path configured via env var
- **`generateProof: true` UX**: Agent indicates `generateProof: true` rather than passing secrets; agentSecret inferred from loaded state file
- **Circuit artifacts**: `.wasm/.zkey` accessed via `packages/crypto` package imports (monorepo paths)
- **Structured errors**: `{ code, detail, suggestion }` for all ZK-specific failures
- **Error codes**: `PROOF_INVALID`, `NULLIFIER_REUSED`, `AGENT_NOT_REGISTERED`, `INVALID_SECRET`, `STALE_ROOT`, `REGISTRY_ROOT_MISMATCH`
- **Test infrastructure**: vitest + miniflare (matching existing engine test infrastructure)
- **Two test tiers**: fast fixture-based (~100ms) + slow real-generation tests (~5-10s with snarkjs + .wasm/.zkey)
- **Tests must validate**: proof accepted with `ENGINE_REQUIRE_PROOFS=true`, request rejected without proof

### Claude's Discretion

- Merkle tree caching strategy (TTL-based vs fresh fetch) — pick what's pragmatic for hackathon
- Test root injection method (DO storage vs mock RPC) — pick what works cleanly with existing test setup
- Whether integration tests also validate WebSocket event output (zkNullifier/bidCommitment fields)
- Whether structured errors include a `raw` debug field with the original engine error string

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MCPE-01 | MCP `join_auction` tool accepts and forwards ZK membership proof payload to engine | Zod schema extension + proof pass-through in POST body; signer nullifier switch is the critical coupling point |
| MCPE-02 | MCP `place_bid` tool accepts and forwards ZK bid range proof payload to engine | Identical pattern to MCPE-01; BidRange proof has 4 public signals vs membership's 3 |
| MCPE-03 | EIP-712 signer supports Poseidon nullifier path (not just keccak) for ZK-enabled joins | `signJoin()` in `signer.ts` must branch on proof presence; Poseidon nullifier comes from `publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER]` (index 2) as string; must convert to bigint for EIP-712 message |
| MCPE-04 | Engine verifies real ZK proofs end-to-end with `ENGINE_REQUIRE_PROOFS=true` | Engine verification is fully implemented; tests must confirm proof accepted + no-proof rejected under this flag |
| MCPE-05 | MCP server can optionally generate proofs on behalf of agents (hybrid mode — server-side fullProve with agent-provided secrets) | Requires: loading agent-N.json, fetching Merkle witness on-chain, calling `generateMembershipProof` / `generateBidRangeProof`, handling `@agent-auction/crypto` import in MCP server context |
</phase_requirements>

---

## Summary

Phase 2 is almost entirely MCP server work — the engine's Groth16 verification pipeline is complete and correct. The primary implementation gap is that `join.ts` and `bid.ts` MCP tools have no `proof` parameter in their Zod schemas, and `signer.ts`'s `signJoin()` always uses the keccak256 nullifier regardless of proof presence. These are the two blocking changes for MCPE-01/02/03.

The central insight from reading the engine code is the **nullifier coupling contract**: when a ZK membership proof is present, the engine extracts the nullifier from `publicSignals[2]` (MEMBERSHIP_SIGNALS.NULLIFIER) and uses it for both double-spend tracking AND EIP-712 signature verification (`verifySignature()` passes `extra.nullifier` into the Join message). This means `signJoin()` in the MCP server MUST use the same Poseidon nullifier that will appear in `publicSignals[2]` — otherwise the engine's signature verification will fail with `Invalid EIP-712 signature`. This is the "central fix" identified in CONTEXT.md.

For MCPE-05 (server-side generation), the MCP server needs to: (1) load agent-N.json from `AGENT_STATE_FILE`, (2) rebuild the Merkle tree from stored `leafHashes` and derive the witness, (3) call `generateMembershipProof()` from `@agent-auction/crypto`, (4) use the resulting `publicSignals[2]` as the Poseidon nullifier for signing. The crypto package exports all needed functions and the agent state files created in Phase 1 have the exact shape needed (`agentSecret`, `leafHashes`, `capabilityMerkleRoot`).

**Primary recommendation:** Start with MCPE-01/02/03 (Zod schema + proof pass-through + signer nullifier switch) as they are small targeted changes; then MCPE-05 (server-side generation) as a new `proofGenerator.ts` lib module in MCP; then integration tests for MCPE-04.

---

## Standard Stack

### Core (already in the project — no new dependencies)

| Library | Location | Purpose | Status |
|---------|----------|---------|--------|
| `@agent-auction/crypto` | `packages/crypto` | `generateMembershipProof`, `generateBidRangeProof`, `MEMBERSHIP_SIGNALS`, `BID_RANGE_SIGNALS`, `deriveNullifierBigInt`, `buildPoseidonMerkleTree`, `getMerkleProof`, `AgentPrivateState` | Installed, exported from `index.ts`; NOT yet imported in mcp-server |
| `snarkjs` | `packages/crypto/node_modules` | fullProve via `@agent-auction/crypto` re-exports; MCP doesn't need a direct snarkjs dep | Transitive |
| `zod` | `mcp-server/node_modules` | Input schema for MCP tools | Already in use |
| `viem` | `mcp-server/node_modules` | EIP-712 signing (viem/accounts), address types | Already in use |
| `poseidon-lite` | `packages/crypto/node_modules` | Poseidon hash for nullifier derivation | Transitive through `@agent-auction/crypto` |

### MCP Server Does NOT Have

| Missing | Required For | How to Get |
|---------|-------------|------------|
| `@agent-auction/crypto` as a dependency | MCPE-05 server-side proof generation | Add monorepo path reference to `mcp-server/package.json` (e.g. `"@agent-auction/crypto": "file:../packages/crypto"`) |
| `vitest` | Integration tests | Add to `mcp-server/devDependencies` — matches existing engine test pattern |
| `miniflare` | Integration tests if testing DO behavior | Only needed if testing engine internals; MCP tests likely test the MCP layer + mock engine |

### New Environment Variables (to add to `config.ts`)

| Variable | Purpose | Default |
|----------|---------|---------|
| `AGENT_STATE_FILE` | Path to agent-N.json for server-side proof generation | `null` (optional) |
| `BASE_SEPOLIA_RPC` | On-chain Merkle witness fetch (AgentPrivacyRegistry) | Required when `generateProof: true` |

---

## Architecture Patterns

### Recommended MCP Server Structure (additions only)

```
mcp-server/src/
├── lib/
│   ├── config.ts          # ADD: AGENT_STATE_FILE, BASE_SEPOLIA_RPC env vars
│   ├── signer.ts          # MODIFY: signJoin() nullifier branch
│   ├── engine.ts          # No change — proof passes through JSON.stringify
│   └── proof-generator.ts # NEW: agent state loading + server-side proof generation
├── tools/
│   ├── join.ts            # MODIFY: Zod schema + proof parameter + generateProof flag
│   └── bid.ts             # MODIFY: Zod schema + proof parameter + generateProof flag
```

### Pattern 1: Proof Parameter in Zod Schema

The engine's `ActionRequest.proof` is typed as `unknown`, and `EngineClient.post()` passes the body through `JSON.stringify`. The MCP schema needs to accept both shapes:

```typescript
// In join.ts and bid.ts Zod schemas
proofPayload: z.object({
  proof: z.object({
    pi_a: z.array(z.string()),
    pi_b: z.array(z.array(z.string())),
    pi_c: z.array(z.string()),
    protocol: z.string(),
    curve: z.string(),
  }),
  publicSignals: z.array(z.string()),
}).optional().describe('Pre-built Groth16 proof payload {proof, publicSignals}'),
generateProof: z.boolean().optional().describe('If true, MCP generates proof server-side from AGENT_STATE_FILE'),
```

### Pattern 2: Nullifier Switching in signJoin()

**CRITICAL COUPLING**: The engine's `handleJoin()` flow:
1. Calls `verifyMembership()` → extracts `nullifier` from `publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER]` (string)
2. Sets `nullifierBigInt = BigInt(membership.nullifier)`
3. Calls `verifySignature(action, auctionId, { nullifier: nullifierBigInt })`
4. Which constructs `{ auctionId, nullifier: extra?.nullifier ?? 0n, depositAmount, nonce, deadline }` for EIP-712

So the MCP signer must construct the EIP-712 message with the SAME nullifier. The fix:

```typescript
// In signer.ts signJoin()
async signJoin(params: {
  auctionId: Hex
  agentId: string
  bondAmount: bigint
  nonce: number
  deadlineSec?: number
  proofPayload?: { proof: unknown; publicSignals: string[] } // NEW
}): Promise<JoinPayload> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSec ?? 300))

  // BRANCH: use Poseidon nullifier from proof if present, else keccak fallback
  let nullifier: bigint
  if (params.proofPayload) {
    // MEMBERSHIP_SIGNALS.NULLIFIER = 2
    nullifier = BigInt(params.proofPayload.publicSignals[2])
  } else {
    nullifier = deriveJoinNullifier(this.account.address, params.auctionId)
  }

  const signature = await this.account.signTypedData({
    domain: EIP712_DOMAIN,
    types: JOIN_TYPES,
    primaryType: 'Join',
    message: {
      auctionId: BigInt(params.auctionId),
      nullifier,  // Poseidon or keccak depending on proof presence
      depositAmount: params.bondAmount,
      nonce: BigInt(params.nonce),
      deadline,
    },
  })

  return {
    type: 'JOIN',
    agentId: params.agentId,
    wallet: this.account.address,
    amount: params.bondAmount.toString(),
    nonce: params.nonce,
    deadline: deadline.toString(),
    signature,
    proof: params.proofPayload ?? null,  // pass-through to engine
  }
}
```

Note: `MEMBERSHIP_SIGNALS.NULLIFIER = 2` is already imported in the engine. For signer.ts, either import from `@agent-auction/crypto` or use the literal `2` with a comment. The constant is stable and defined in Phase 1.

### Pattern 3: Agent State Loading and Deserialization

The agent-N.json files use `bigint`-suffixed string serialization (e.g. `"12345n"`). The `register-test-agents.ts` script shows the format. Loading requires:

```typescript
// In proof-generator.ts
function deserializeBigInt(value: string): bigint {
  // Format: "12345n" → BigInt(12345)
  if (typeof value === 'string' && value.endsWith('n')) {
    return BigInt(value.slice(0, -1))
  }
  return BigInt(value)
}

function loadAgentState(filePath: string): AgentPrivateState {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  return {
    agentId: deserializeBigInt(raw.agentId),
    agentSecret: deserializeBigInt(raw.agentSecret),
    salt: deserializeBigInt(raw.salt),
    capabilities: raw.capabilities.map((c: { capabilityId: string }) => ({
      capabilityId: deserializeBigInt(c.capabilityId),
    })),
    leafHashes: raw.leafHashes.map(deserializeBigInt),
    capabilityMerkleRoot: deserializeBigInt(raw.capabilityMerkleRoot),
    registrationCommit: raw.registrationCommit,
  }
}
```

### Pattern 4: Server-Side Membership Proof Generation

The agent state files already contain `leafHashes` from Phase 1. The Merkle witness can be rebuilt entirely from stored data — no on-chain call is needed for the witness itself. The on-chain registry root IS needed as a circuit public input (it's the `registryRoot` signal):

```typescript
// In proof-generator.ts (MCP server)
import {
  buildPoseidonMerkleTree, getMerkleProof, generateMembershipProof
} from '@agent-auction/crypto'

async function generateMembershipProofForAgent(
  agentState: AgentPrivateState,
  auctionId: bigint,
  registryRoot: bigint,  // fetched on-chain via readRegistryRoot()
): Promise<{ proof: Groth16Proof; publicSignals: string[] }> {
  // Rebuild tree from stored leafHashes
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
```

Key insight: `buildPoseidonMerkleTree` returns `{ root, layers }` but also `zeroHashes` as a non-typed field (see `circuits.test.ts` line 54: `(treeResult as any).zeroHashes`). This cast pattern is established in Phase 1 tests and must be replicated.

### Pattern 5: Server-Side BidRange Proof Generation

BidRange proof needs: `bid` (agent's actual bid amount), `salt` (from agent state), `reservePrice`, `maxBudget`. MCP fetches the last two from the engine:

```typescript
// GET /auctions/:id returns auction detail including reservePrice and maxBid
const detail = await engine.get<AuctionDetail>(`/auctions/${auctionId}`)
const reservePrice = BigInt(detail.reservePrice ?? '0')
const maxBudget = BigInt(detail.maxBid ?? '0')  // 0 = uncapped

// Generate salt for bid commitment (random per bid)
const bidSalt = generateSecret()  // from @agent-auction/crypto

const bidRangeProof = await generateBidRangeProof({
  bid: BigInt(bidAmount),
  salt: bidSalt,
  reservePrice,
  maxBudget,
})
```

Note: `generateSecret()` is exported from `onboarding.ts` (which re-exports from the `@agent-auction/crypto` package index). Each bid uses a fresh random salt to prevent bid commitment linkage.

### Pattern 6: Structured Error Responses

The MCP tools use `ToolResult` with `content: [{ type: 'text', text: JSON.stringify(...) }]`. ZK errors should follow:

```typescript
function zkError(code: string, detail: string, suggestion: string): ToolResult {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ success: false, error: { code, detail, suggestion } }, null, 2),
    }],
  }
}
```

Error codes and when to use them:
- `PROOF_INVALID` — engine rejected proof (snarkjs verify returned false)
- `NULLIFIER_REUSED` — engine returned "Nullifier already spent"
- `AGENT_NOT_REGISTERED` — AGENT_STATE_FILE not set or file missing
- `INVALID_SECRET` — state file exists but deserialization fails
- `STALE_ROOT` — on-chain registry root fetch failed
- `REGISTRY_ROOT_MISMATCH` — proof generated with wrong root (paranoia check, likely unused)

### Anti-Patterns to Avoid

- **Hardcoding `publicSignals[2]`**: Use `MEMBERSHIP_SIGNALS.NULLIFIER` constant from `@agent-auction/crypto` even if the MCP server imports it directly; keeps it in sync if the circuit ever changes
- **Verifying proof in MCP before forwarding**: CONTEXT.md locks this — engine is the sole verifier; double-verification wastes time and duplicates the vkey
- **Importing from `@agent-auction/crypto/proof-generator` directly**: Use the main `@agent-auction/crypto` export which re-exports everything from `index.ts`
- **Using `generateSecret()` for `auctionId` conversion**: `auctionId` is a `0x`-prefixed bytes32 hex string from the MCP tool input; convert to bigint via `BigInt(auctionId)` — the same pattern used in `signer.ts`
- **Assuming agent state has `Merkle witness stored`**: Phase 1 state files store `leafHashes` but NOT pre-computed Merkle witnesses — witness must be rebuilt via `buildPoseidonMerkleTree` + `getMerkleProof` on every proof generation

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Poseidon hashing for nullifier | Custom hash | `poseidonHash()` from `@agent-auction/crypto` | Circuit uses BN254 Poseidon; hand-rolled hash won't match circuit output |
| Groth16 proof generation | Custom prover | `generateMembershipProof()` / `generateBidRangeProof()` from `@agent-auction/crypto` | wasm path resolution is already wired relative to the package; hand-rolling requires duplicating path logic |
| Merkle tree construction | Custom tree | `buildPoseidonMerkleTree()` + `getMerkleProof()` | Sparse tree with zero-hash padding; matches the 20-level circuit exactly |
| BigInt serialization from JSON | Custom parser | `deserializeBigInt()` utility (small, per-project convention) | The `"12345n"` format is project-specific; no library needed but must match existing convention |
| On-chain registry root read | Custom ABI call | `readRegistryRoot()` from `@agent-auction/crypto` or inline with ethers | Already implemented in `onboarding.ts`; reuse |

**Key insight:** The `@agent-auction/crypto` package is a purpose-built SDK for exactly this phase's needs. All crypto primitives, proof generation, tree construction, and on-chain registration are already implemented and tested.

---

## Common Pitfalls

### Pitfall 1: Nullifier Type Mismatch (the Central Bug)

**What goes wrong:** `signJoin()` uses the keccak256 nullifier; engine expects the Poseidon nullifier from the proof's `publicSignals[2]`. The EIP-712 signature verification fails with `Invalid EIP-712 signature for agent X` even though the proof itself is valid.

**Why it happens:** The engine's `verifySignature()` constructs the EIP-712 message using `extra?.nullifier ?? 0n` — this nullifier MUST match what the signer used. When a proof is present, the engine derives `nullifierBigInt = BigInt(membership.nullifier)` from `publicSignals[2]`. The signer must do the same.

**How to avoid:** After generating or receiving the proof, extract `BigInt(publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER])` before calling `signJoin()` and pass it in.

**Warning signs:** Engine responds with `Invalid EIP-712 signature` (not `Invalid membership proof`); the proof itself passes verification.

### Pitfall 2: BigInt Serialization from Agent State Files

**What goes wrong:** `JSON.parse` returns `"48522356...n"` as a plain string. Passing it to BigInt without stripping the trailing `n` causes `SyntaxError: Cannot convert 48522356...n to a BigInt`.

**Why it happens:** The `register-test-agents.ts` serialization appends `n` to all bigint values. Standard `JSON.parse` doesn't handle this.

**How to avoid:** Use `BigInt(value.slice(0, -1))` for any field known to be bigint (or a reviver function).

**Warning signs:** `SyntaxError` during agent state load, not during proof generation.

### Pitfall 3: @agent-auction/crypto Import Resolution in MCP Server

**What goes wrong:** `import { generateMembershipProof } from '@agent-auction/crypto'` throws `Cannot find module` at runtime.

**Why it happens:** `mcp-server/package.json` does not list `@agent-auction/crypto` as a dependency. The engine has it; the MCP server does not.

**How to avoid:** Add `"@agent-auction/crypto": "file:../packages/crypto"` to `mcp-server/package.json` and run `npm install` in mcp-server. The `moduleResolution: "Bundler"` in tsconfig handles path resolution.

**Warning signs:** TypeScript typecheck passes (if types are resolved via path aliases) but runtime throws; or both fail.

### Pitfall 4: zeroHashes Not in buildPoseidonMerkleTree Return Type

**What goes wrong:** `getMerkleProof()` requires `zeroHashes` as the third parameter to correctly pad sparse tree siblings. `buildPoseidonMerkleTree()` returns `{ root, layers }` typed but the actual return includes `zeroHashes` as an untyped extra field.

**Why it happens:** The TypeScript declaration matches the documented return shape; the actual implementation returns more. This is an existing project wart documented in `circuits.test.ts` line 54.

**How to avoid:** Cast with `(treeResult as any).zeroHashes` exactly as Phase 1 tests do.

**Warning signs:** Merkle proofs generate but proof verification fails because wrong zero-hashes were used for sibling padding.

### Pitfall 5: BidRange reservePrice/maxBudget Fetch Timing

**What goes wrong:** When `generateProof: true`, the MCP fetches `reservePrice` and `maxBudget` from the engine's auction detail before the proof is generated. If the engine uses `maxBid: "0"` to mean "uncapped", the BidRange circuit may receive `maxBudget=0` and produce an invalid range constraint.

**Why it happens:** The circuit enforces `reservePrice <= bid <= maxBudget`. If `maxBudget=0` and `bid=100`, the circuit fails (fullProve throws).

**How to avoid:** When `maxBudget=0` (uncapped), substitute a large sentinel value (e.g. `BigInt(2**48)` or a known max USDC amount). Document this substitution clearly.

**Warning signs:** `snarkjs.groth16.fullProve throws` specifically for bids in otherwise valid auctions.

### Pitfall 6: MCP Server Importing snarkjs (Node vs CF Workers)

**What goes wrong:** If `snarkjs` is imported at module init time in the MCP server (Node.js runtime), it works fine — but if the same code is later adapted for Cloudflare Workers, it will break because snarkjs uses `URL.createObjectURL()`.

**Why it happens:** The engine already handles this with a lazy import pattern. The MCP server runs on Node.js (not CF Workers), so this is NOT a current problem.

**How to avoid:** For Phase 2 (Node.js MCP server), direct `import` of snarkjs via `@agent-auction/crypto` is fine. If the MCP server ever moves to CF Workers, adapt the lazy-import pattern from `engine/src/lib/crypto.ts`.

---

## Code Examples

### Current signJoin() return type (signer.ts line 101–109)

```typescript
// Current — always returns proof: null
return {
  type: 'JOIN',
  agentId: params.agentId,
  wallet: this.account.address,
  amount: params.bondAmount.toString(),
  nonce: params.nonce,
  deadline: deadline.toString(),
  signature,
  proof: null,   // ← must become proofPayload ?? null
}
```

After fix, when `proofPayload` is provided:
```typescript
proof: params.proofPayload ?? null,
```
The engine's `ActionRequest.proof: unknown` accepts any shape; `EngineClient.post()` uses `JSON.stringify(body)` which serializes the proof object correctly.

### Engine nullifier branch (actions.ts lines 253–272) — READ-ONLY REFERENCE

```typescript
// Engine does this — MCP signer must mirror it:
const hasZkNullifier = membership.nullifier !== '0x00'
if (hasZkNullifier) {
  zkNullifier = membership.nullifier          // Poseidon from publicSignals[2]
  nullifierHash = membership.nullifier
  nullifierBigInt = BigInt(membership.nullifier)  // ← MCP signer uses this value
} else {
  // Legacy keccak fallback — MCP currently always takes this path (wrong when proof present)
  const fallback = await deriveNullifier(...)
  nullifierBigInt = BigInt(toHex(fallback))
}
// Then EIP-712 verification with this nullifierBigInt:
await verifySignature(action, auctionId, { nullifier: nullifierBigInt })
```

### Agent state file structure (agent-1.json — actual file)

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

Files live at: `/Users/zengy/workspace/auction-design/packages/crypto/test-agents/agent-{1,2,3}.json`

### AuctionEvent.zkNullifier population (auction-room.ts lines 611–622) — shows success criteria

```typescript
await this.state.storage.put(`event:${seq}`, {
  seq,
  prevHash,
  eventHash: eventHashHex,
  payloadHash: payloadHashHex,
  actionType: action.type,
  agentId: action.agentId,
  wallet: action.wallet,
  amount: action.amount,
  createdAt: Math.floor(Date.now() / 1000),
  ...(zkNullifier ? { zkNullifier } : {}),   // ← populated when proof present
} satisfies AuctionEvent)
```

Success criterion 1 (MCPE-01): `AuctionEvent.zkNullifier` is populated → proof reached engine and was accepted.

### bidCommitment storage gap

`AuctionEvent` type (engine.ts) has `zkNullifier?: string` but NO `bidCommitment` field. The engine's `handleBid` extracts `bidCommitment` from the proof but does NOT currently store it in the event. Success criterion 2 (MCPE-02) says "AuctionEvent with `bidCommitment` populated" — this requires either:
- (a) Adding `bidCommitment?: string` to `AuctionEvent` type and passing it through `ingestAction`, or
- (b) Checking `engine/src/types/engine.ts` doesn't need this and the success criterion is satisfied differently (e.g. the engine accepted the proof = bidCommitment was verified)

**This is an open question** — see Open Questions section. Either way, the BID proof path itself is fully wired in the engine; only storage is missing.

### Test helper pattern (engine/test/actions.test.ts)

The engine's integration tests use:
- `process.env.ENGINE_ALLOW_INSECURE_STUBS = 'true'` in `beforeEach` to bypass EIP-712 sig checks
- `createMockStorage()` — simple in-memory Map wrapping DurableObjectStorage interface
- Proof fixtures passed as `action.proof = { proof: {...}, publicSignals: [...] }` for ZK tests

MCP integration tests should follow the same pattern: mock the `EngineClient.post()` to inspect what proof payload reaches it, and use real proof fixtures (pre-generated JSON) for fast tests.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| keccak256 nullifier everywhere | Poseidon nullifier from ZK proof publicSignals when proof present; keccak fallback | Engine already implements dual-path; MCP signer must follow |
| No proof in MCP tools | Proof parameter added to Zod schema + pass-through | Small diff; Zod accepts `z.unknown()` or typed object |
| No server-side proof generation | Hybrid mode: `generateProof: true` triggers fullProve server-side | New `proof-generator.ts` lib in MCP server |

---

## Open Questions

1. **Does MCPE-02 success criterion require `bidCommitment` in `AuctionEvent`?**
   - What we know: `AuctionEvent.zkNullifier` is stored when JOIN proof is present. `AuctionEvent` has no `bidCommitment` field. The engine's `handleBid` returns `bidCommitment` from proof verification but `ingestAction` doesn't receive it.
   - What's unclear: Does the planner need to add `bidCommitment?: string` to `AuctionEvent` type + thread it through `handleBid` → `ValidationMutation` → `ingestAction`? Or is "produces AuctionEvent with bidCommitment populated" satisfied by a different check (e.g. the bid event existing = proof was accepted)?
   - Recommendation: Add `bidCommitment?: string` to `AuctionEvent` (small change), add `bidCommitment?: string` to `ValidationMutation`, pass from `handleBid` through `ingestAction`. This makes the event log self-describing. If scope-constrained, define success as "bid accepted" = implicit bidCommitment verification.

2. **On-chain registry root for membership proof — which RPC?**
   - What we know: `AgentPrivacyRegistry.getRoot()` must be called on Base Sepolia (`0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff`). The function `readRegistryRoot()` from `@agent-auction/crypto` uses ethers.
   - What's unclear: Should the MCP server use `BASE_SEPOLIA_RPC` env var (same as existing scripts) or reuse `ENGINE_URL` to proxy the read through the engine API?
   - Recommendation: Add `BASE_SEPOLIA_RPC` env var to MCP config — direct on-chain read is simpler and the engine doesn't expose a registry-root endpoint. Root is stable (changes only when new agents register), so a simple TTL cache (e.g. 5 minutes for hackathon) is sufficient.

3. **How do integration tests inject a known registry root?**
   - What we know: The engine's `verifyMembershipProof` ignores `expectedRegistryRoot` (removed in ZKFN-02). The circuit embeds the Poseidon Merkle root from proof generation — it doesn't cross-check the on-chain keccak root.
   - What's unclear: For MCP integration tests (fast tier), can we use a pre-generated proof that was generated with a known test registry root? Yes — the `circuits.test.ts` generates proofs with arbitrary `registryRoot` inputs. The test fixture just needs to be generated once.
   - Recommendation: Generate one fixture proof pair (membership + bidRange) using test values matching `packages/crypto/tests/circuits.test.ts` inputs. The proof's embedded root matches whatever was used in generation — no on-chain call needed for tests.

---

## Validation Architecture

*`workflow.nyquist_validation` is not set in `.planning/config.json` — this section is omitted.*

The test infrastructure is documented here for planner task creation:

### Test Location

MCP server has NO existing test directory. Engine tests use `engine/test/*.test.ts` + vitest.

**New test home:** `mcp-server/test/*.test.ts` — mirrors engine pattern.

### Test Commands

For MCP server tests (new):
```bash
cd mcp-server && npm test   # once vitest is added to devDependencies
```

For engine ZK integration tests (existing, verify MCPE-04):
```bash
cd engine && npm run test -- --match="requireProofs"
```

For crypto proof generation tests (Phase 1, validates fixture generation):
```bash
cd packages/crypto && npm test  # node --experimental-vm-modules
```

### Test Tiers

**Fast (fixture-based, ~100ms per test):**
- Pre-generated proof JSON fixtures in `mcp-server/test/fixtures/`
- Mock `EngineClient.post()` to capture the payload sent to engine
- Assert: proof field present in captured payload, nullifier type correct
- Assert: no-proof request body has `proof: null`

**Slow (real generation, ~5-10s per test, tagged `@slow`):**
- Uses actual `.wasm/.zkey` artifacts from `circuits/` directory
- Full round-trip: `generateProof: true` → MCP builds proof → signs with Poseidon nullifier → engine verifies
- Requires `BASE_SEPOLIA_RPC` or mock registry root injection

### Wave 0 Files Needed (before implementation)

```
mcp-server/
├── test/
│   ├── join.test.ts          # MCPE-01: proof pass-through, nullifier switch
│   ├── bid.test.ts           # MCPE-02: BidRange proof pass-through
│   ├── proof-generator.test.ts  # MCPE-05: server-side generation
│   └── fixtures/
│       ├── membership-proof.json  # pre-generated fixture
│       └── bidrange-proof.json    # pre-generated fixture
├── vitest.config.ts          # matches engine vitest config pattern
└── package.json              # add vitest to devDependencies
```

---

## Sources

### Primary (HIGH confidence — all from codebase direct reads)

- `engine/src/handlers/actions.ts` — handleJoin/handleBid validation flow, nullifier branch logic, ValidationMutation.zkNullifier
- `engine/src/lib/crypto.ts` — verifyMembershipProof/verifyBidRangeProof, MEMBERSHIP_SIGNALS, BID_RANGE_SIGNALS, inlined vkeys
- `engine/src/types/engine.ts` — ActionRequest.proof (unknown), AuctionEvent.zkNullifier
- `engine/src/auction-room.ts` (lines 556–622) — ingestAction, zkNullifier storage in event
- `mcp-server/src/tools/join.ts` — current Zod schema (no proof param), signJoin call
- `mcp-server/src/tools/bid.ts` — current Zod schema (no proof param), signBid call
- `mcp-server/src/lib/signer.ts` — signJoin() with keccak nullifier, signBid(), return shapes
- `mcp-server/src/lib/config.ts` — loadConfig, ServerConfig interface (no AGENT_STATE_FILE yet)
- `mcp-server/src/lib/engine.ts` — EngineClient.post(), JSON serialization pass-through
- `packages/crypto/src/proof-generator.ts` — generateMembershipProof/generateBidRangeProof signatures
- `packages/crypto/src/nullifier.ts` — deriveNullifierBigInt, ActionType constants
- `packages/crypto/src/onboarding.ts` — AgentPrivateState type, buildPoseidonMerkleTree, getMerkleProof, readRegistryRoot
- `packages/crypto/src/index.ts` — all public exports
- `packages/crypto/test-agents/agent-1.json` — exact agent state file format
- `packages/crypto/scripts/register-test-agents.ts` — BigInt serialization convention (`"12345n"`)
- `packages/crypto/tests/circuits.test.ts` — zeroHashes cast pattern, proof generation fixture approach
- `engine/test/actions.test.ts` — MockStorage pattern, ENGINE_ALLOW_INSECURE_STUBS test pattern
- `engine/test/setup.ts` — Miniflare setup, global test env
- `.planning/phases/02-mcp-engine-wiring/02-CONTEXT.md` — all locked decisions

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified by reading package.json files; import paths verified against actual source
- Architecture: HIGH — all patterns derived from reading the actual source files, not assumptions
- Pitfalls: HIGH — identified from actual code paths, not general knowledge (except Pitfall 6 which is well-known snarkjs/CF Workers issue)
- Open questions: identified from source, not speculation

**Research date:** 2026-03-02
**Valid until:** 2026-04-01 (stable — no fast-moving external dependencies; all critical code is in-repo)
