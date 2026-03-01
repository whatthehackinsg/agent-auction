# Architecture Research

**Domain:** ZK proof integration — client-side generation to server-side verification in an agent-native auction platform
**Researched:** 2026-03-02
**Confidence:** HIGH (based on direct codebase analysis of all relevant components)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AGENT LAYER                                  │
│  ┌────────────────────┐         ┌──────────────────────────────┐    │
│  │    agent-client    │         │         mcp-server           │    │
│  │  privacy.ts        │         │  tools/join.ts  (proof: null)│    │
│  │  auction.ts        │         │  tools/bid.ts   (proof: null)│    │
│  │  (proof: null)     │         │  lib/signer.ts               │    │
│  └────────┬───────────┘         └──────────────┬───────────────┘    │
│           │  EIP-712 signed payload + ZK proof  │                   │
│           │  POST /auctions/:id/action           │                   │
└───────────┼──────────────────────────────────────┼───────────────────┘
            │                                      │
┌───────────▼──────────────────────────────────────▼───────────────────┐
│                      ENGINE LAYER (Cloudflare Workers)                │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                      AuctionRoom (Durable Object)             │    │
│  │                                                               │    │
│  │  validateAction()                                             │    │
│  │    ├─ handleJoin() → verifyMembershipProof()                  │    │
│  │    │                   snarkjs.groth16.verify(MEMBERSHIP_VKEY)│    │
│  │    │                   cross-check publicSignals[0] vs root   │    │
│  │    │                   extract nullifier from publicSignals[2] │    │
│  │    └─ handleBid()  → verifyBidRangeProof()                    │    │
│  │                        snarkjs.groth16.verify(BID_RANGE_VKEY) │    │
│  │                        rangeOk = publicSignals[0] === "1"     │    │
│  │  commitValidationMutation() → DO storage                      │    │
│  │  ingestAction() → append-only Poseidon hash chain             │    │
│  └────────────────────────────────────┬──────────────────────────┘    │
│                                       │ recordResult TX               │
└───────────────────────────────────────┼──────────────────────────────┘
                                        │
┌───────────────────────────────────────▼──────────────────────────────┐
│                      BLOCKCHAIN LAYER (Base Sepolia)                  │
│  ┌──────────────────────┐   ┌────────────────────────────────┐       │
│  │  AgentPrivacyRegistry│   │  AuctionRegistry               │       │
│  │  getRoot() → bytes32 │   │  AuctionEscrow                 │       │
│  │  register(agentId,   │   │  NftEscrow                     │       │
│  │    commit)           │   │                                │       │
│  └──────────────────────┘   └────────────────────────────────┘       │
│                                       ↓ AuctionEnded event            │
└───────────────────────────────────────┼──────────────────────────────┘
                                        │
┌───────────────────────────────────────▼──────────────────────────────┐
│                         CRE LAYER (Chainlink DON)                     │
│  AuctionEnded → verify CLOSED → cross-check winner → fetch replay     │
│  → DON signs report → writeReport → KeystoneForwarder                 │
│  → AuctionEscrow.onReport() → settlement                              │
└──────────────────────────────────────────────────────────────────────┘

ZK Proof Generation (agent-side, NEVER in engine):
┌──────────────────────────────────────────────────────────────────────┐
│  packages/crypto/src/proof-generator.ts                               │
│  snarkjs.groth16.fullProve(input, wasmPath, zkeyPath)                │
│  ├─ RegistryMembership.wasm + registry_member_final.zkey             │
│  │   Public signals: [registryRoot, capabilityCommitment, nullifier] │
│  └─ BidRange.wasm + bid_range_final.zkey                             │
│       Public signals: [rangeOk, bidCommitment, reservePrice, maxBudget]│
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| `packages/crypto/proof-generator.ts` | Agent-side Groth16 proof generation via snarkjs.fullProve; loads .wasm + .zkey from `circuits/` | Called by agent-client and (after wiring) MCP server |
| `packages/crypto/onboarding.ts` | Generates agentSecret + salt, builds 20-level Poseidon Merkle tree, computes registrationCommit for on-chain registration | agent-client, AgentPrivacyRegistry contract |
| `packages/crypto/snarkjs-verify.ts` | File-based vkey loading + typed snarkjs.groth16.verify wrappers (used in non-CF contexts, e.g., tests) | Used by proof-generator tests |
| `agent-client/src/auction.ts` | Submits JOIN/BID actions to engine with `proof: null` (gap to fill) | Engine HTTP API |
| `agent-client/src/privacy.ts` | Prepares registration state, calls AgentPrivacyRegistry.register() | AgentPrivacyRegistry contract |
| `mcp-server/src/tools/join.ts` | MCP join_auction tool — signs EIP-712, posts to engine with `proof: null` (gap to fill) | Engine HTTP API |
| `mcp-server/src/tools/bid.ts` | MCP place_bid tool — signs EIP-712, posts to engine (no proof field yet) (gap to fill) | Engine HTTP API |
| `engine/src/lib/crypto.ts` | CF Workers ZK verification via snarkjs (lazy-imported), inlined vkeys (MEMBERSHIP_VKEY, BID_RANGE_VKEY), EIP-712 verification | AuctionRoom DO |
| `engine/src/handlers/actions.ts` | Action validation dispatcher — routes JOIN to handleJoin (verifyMembership), BID to handleBid (verifyBidRange) | engine/src/lib/crypto.ts, DO storage |
| `engine/src/auction-room.ts` | Durable Object sequencer — validateAction → ingestAction → Poseidon hash chain | handlers/actions.ts, D1, DO storage |
| `circuits/src/RegistryMembership.circom` | Groth16 circuit: proves Merkle membership without revealing agentSecret; public signals [registryRoot, capabilityCommitment, nullifier] | Compiled to .wasm + .zkey in circuits/ |
| `circuits/src/BidRange.circom` | Groth16 circuit: proves bid within [reservePrice, maxBudget] via Poseidon commitment; public signals [rangeOk, bidCommitment, reservePrice, maxBudget] | Compiled to .wasm + .zkey in circuits/ |
| `contracts/AgentPrivacyRegistry.sol` | Stores per-agent registrationCommit on-chain; getRoot() returns Poseidon Merkle root of all commits | Engine reads getRoot(); agents call register() |
| `frontend/` | Spectator UI — currently shows string-masked agents; needs ZK proof status indicators | Engine WebSocket stream, Engine HTTP |

## Recommended Project Structure

The gap-filling work lands in existing modules, not new ones:

```
packages/crypto/src/
├── proof-generator.ts      # EXISTS: generateMembershipProof, generateBidRangeProof
├── onboarding.ts           # EXISTS: prepareOnboarding, buildPoseidonMerkleTree, getMerkleProof
├── snarkjs-verify.ts       # EXISTS: verifyMembershipProof, verifyBidRangeProof (file-based vkeys)
└── index.ts                # EXISTS: exports all of the above

agent-client/src/
├── privacy.ts              # EXISTS: preparePrivacyState, registerPrivacy — needs real Merkle tree
├── auction.ts              # EXISTS: joinAuction, placeBid — WIRE: proof: null → real proof
└── zk-prover.ts            # NEW: bridge between proof-generator and auction.ts

mcp-server/src/
├── tools/join.ts           # EXISTS — WIRE: accept zkProof param, forward in payload
├── tools/bid.ts            # EXISTS — WIRE: accept zkProof param, forward in payload
└── lib/zk-state.ts         # NEW: load agent's private state for MCP session context

engine/src/
├── lib/crypto.ts           # EXISTS: verifyMembershipProof, verifyBidRangeProof — already wired
├── handlers/actions.ts     # EXISTS: handleJoin, handleBid with ENGINE_REQUIRE_PROOFS gate
└── (no new files needed)

circuits/
├── keys/
│   ├── registry_member_final.zkey   # EXISTS
│   ├── bid_range_final.zkey         # EXISTS
│   ├── registry_member_vkey.json    # EXISTS (also inlined in engine/lib/crypto.ts)
│   └── bid_range_vkey.json          # EXISTS (also inlined in engine/lib/crypto.ts)
└── src/
    ├── RegistryMembership.circom    # EXISTS: compiled
    └── BidRange.circom              # EXISTS: compiled

frontend/src/
└── components/
    └── zk/
        └── ProofBadge.tsx           # NEW: "ZK Verified" / nullifier consumed badge
```

### Structure Rationale

- **proof-generator.ts stays in packages/crypto:** Agent-side generation uses Node-compatible snarkjs with filesystem .zkey loading. This cannot run in CF Workers (no filesystem). The boundary is deliberate.
- **vkeys inlined in engine/lib/crypto.ts:** CF Workers has no filesystem access. The existing MEMBERSHIP_VKEY and BID_RANGE_VKEY constants are already inlined — this is correct and must not change.
- **snarkjs lazy-imported in engine/lib/crypto.ts:** Required because ffjavascript calls `URL.createObjectURL()` at module init, which does not exist in CF Workers. The `let _snarkjs = null` + dynamic import pattern is the correct CF Workers workaround.
- **New zk-prover.ts in agent-client:** Bridges `packages/crypto/proof-generator.ts` with `agent-client/src/auction.ts`. Keeps proof generation logic isolated from auction flow.

## Architectural Patterns

### Pattern 1: Proof-as-Optional-Payload (Existing Contract)

**What:** The engine's `ActionRequest.proof` field is typed as `unknown` and defaults to `null`. The validation gate is controlled by `ENGINE_REQUIRE_PROOFS=true`. When the flag is off, missing proofs pass through (`requireProof: false` returns `valid: true`). When the flag is on, null proof returns `valid: false`.

**When to use:** This is the existing two-mode design — use it exactly as-is. Do not add a new proof field or schema; wire real proofs into the existing `proof` slot.

**Example (existing contract to preserve):**
```typescript
// agent-client/src/auction.ts joinAuction() — current state
const payload = {
  type: 'JOIN',
  agentId: params.agentId.toString(),
  wallet,
  amount: params.bondAmount.toString(),
  nonce: params.nonce,
  deadline: deadline.toString(),
  signature,
  proof: null,   // ← WIRE: replace null with { proof, publicSignals }
}

// engine/src/lib/crypto.ts — verification is already wired end-to-end
// isMembershipProofPayload() checks: obj.proof != null && obj.publicSignals.length === 3
// Returns valid: true when proof passes snarkjs.groth16.verify(MEMBERSHIP_VKEY, ...)
```

### Pattern 2: Snarkjs Lazy Import for CF Workers Compatibility (Critical)

**What:** snarkjs cannot be imported at module init time in CF Workers because ffjavascript's `URL.createObjectURL()` crashes. The engine already uses the correct lazy-import pattern.

**When to use:** Any file in `engine/src/` that needs snarkjs must use this pattern. Never top-level import snarkjs in engine code.

**Example (existing — do not change):**
```typescript
// engine/src/lib/crypto.ts
let _snarkjs: typeof import('snarkjs') | null = null
async function getSnarkjs() {
  if (!_snarkjs) {
    _snarkjs = await import('snarkjs')
  }
  return _snarkjs
}
// Usage: const snarkjs = await getSnarkjs()
// Never: import * as snarkjs from 'snarkjs' at top level
```

### Pattern 3: Merkle Proof Preparation Separate from Proof Generation

**What:** The RegistryMembership circuit requires a 20-level Poseidon Merkle proof (pathElements + pathIndices) computed from the agent's local tree. The Merkle proof preparation (building the tree, extracting the path) is separate from the Groth16 proof generation. Both steps are already implemented in `packages/crypto/onboarding.ts`.

**When to use:** Before calling `generateMembershipProof()`, the agent must: (1) read the current on-chain registryRoot via `AgentPrivacyRegistry.getRoot()`, (2) build or restore the sparse Merkle tree from stored leafHashes, (3) call `getMerkleProof(leafIndex, layers, zeroHashes)` to get pathElements + pathIndices.

**Example (the wiring that needs to be added):**
```typescript
// packages/crypto/src/onboarding.ts — already implemented
const { root, layers, zeroHashes } = await buildPoseidonMerkleTree(leafHashes)
const merkleProof = getMerkleProof(leafIndex, layers, zeroHashes)

// packages/crypto/src/proof-generator.ts — already implemented
const { proof, publicSignals } = await generateMembershipProof({
  agentSecret: state.agentSecret,
  capabilityId: state.capabilities[0].capabilityId,
  leafIndex: BigInt(leafIndex),
  pathElements: merkleProof.pathElements,
  pathIndices: merkleProof.pathIndices,
  auctionId: BigInt(auctionId),
  salt: state.salt,
  registryRoot: registryRoot,
})
// → { proof, publicSignals } goes into ActionRequest.proof
```

### Pattern 4: Dual Nullifier Strategy

**What:** The engine supports two nullifier schemes simultaneously. When a ZK proof is provided, the engine extracts the Poseidon nullifier from `publicSignals[2]` and uses it for double-join prevention. When no proof is provided, it falls back to a keccak256 nullifier derived from wallet + auctionId. The code path selection is automatic in `handleJoin()`.

**When to use:** The ZK nullifier path activates automatically when a valid membership proof is submitted. No code change needed in `handlers/actions.ts`. The key consequence: once an agent joins with a ZK nullifier, a second JOIN attempt with the same proof is rejected by the DO's `nullifierKey` store.

**Example (already in handlers/actions.ts):**
```typescript
const hasZkNullifier = membership.nullifier !== '0x00'
if (hasZkNullifier) {
  // ZK-proven Poseidon nullifier from proof's publicSignals[2]
  zkNullifier = membership.nullifier
  nullifierHash = membership.nullifier
} else {
  // Legacy keccak fallback
  const fallback = await deriveNullifier(wallet, auctionId, 0)
  nullifierHash = toHex(fallback)
}
```

### Pattern 5: Registry Root Cross-Check

**What:** The engine reads `AgentPrivacyRegistry.getRoot()` on-chain and passes it as `expectedRegistryRoot` to `verifyMembershipProof()`. The proof's `publicSignals[0]` must match this on-chain root. This prevents proofs generated against a stale or fake Merkle root from being accepted.

**When to use:** This cross-check is already wired in `handleJoin()` via `ValidationContext.expectedRegistryRoot`. The engine must populate this field when calling `validateAction()`. The on-chain root must match the root used during proof generation — meaning the AgentPrivacyRegistry must have the test agent's commitment registered BEFORE the demo runs.

**Data flow implication:** This creates a mandatory ordering: `registerOnChain()` → (optionally wait for root update) → `generateMembershipProof()` → `joinAuction()`.

## Data Flow

### JOIN with ZK Membership Proof

```
[Agent local state: agentSecret, leafHashes, capabilities]
    │
    ├─ AgentPrivacyRegistry.getRoot() → registryRoot (on-chain read)
    │
    ├─ buildPoseidonMerkleTree(leafHashes) → { layers, zeroHashes }
    │
    ├─ getMerkleProof(leafIndex, layers) → { pathElements, pathIndices }
    │
    ├─ generateMembershipProof({agentSecret, capabilityId, leafIndex,
    │     pathElements, pathIndices, auctionId, salt, registryRoot})
    │   [snarkjs.groth16.fullProve — ~2-5s on first call, loads .wasm + .zkey]
    │   → { proof: Groth16Proof, publicSignals: [registryRoot, capCommit, nullifier] }
    │
    ├─ ActionSigner.signJoin({ auctionId, agentId, bondAmount, nonce })
    │   [EIP-712 signed with nullifier = Poseidon(agentSecret, auctionId, 1)]
    │   → { type: 'JOIN', agentId, wallet, amount, nonce, deadline, signature }
    │
POST /auctions/:id/action
    { type: 'JOIN', ..., signature, proof: { proof, publicSignals } }
    │
    ▼ Engine: AuctionRoom.fetch() → auction-room.ts
    │
    ├─ validateAction(action, storage, auctionId, ctx)
    │   ├─ handleJoin()
    │   │   ├─ verifyMembershipProof({ proof, publicSignals }, { requireProof: true, expectedRegistryRoot })
    │   │   │   snarkjs.groth16.verify(MEMBERSHIP_VKEY, publicSignals, proof)
    │   │   │   cross-check publicSignals[0] === expectedRegistryRoot
    │   │   │   → { valid: true, registryRoot, nullifier }
    │   │   ├─ extract zkNullifier from publicSignals[2]
    │   │   ├─ verifySignature(action, auctionId, { nullifier: BigInt(zkNullifier) })
    │   │   │   verifyTypedData(EIP712_DOMAIN, JOIN_TYPES, message, signature)
    │   │   ├─ checkNullifier(zkNullifier, storage)  ← rejects double-join
    │   │   └─ checkNonce(agentId, JOIN, nonce, storage)
    │   └─ commitValidationMutation(mutation, storage) → DO storage
    │
    ├─ ingestAction() → Poseidon hash chain event (seq, eventHash, zkNullifier)
    ├─ broadcast to participant WebSocket (full data) + public WebSocket (masked)
    └─ return { seq, eventHash, prevHash }
```

### BID with ZK BidRange Proof

```
[Agent state: bid amount, salt, auctionId]
    │
    ├─ computeBidCommitment(bid, salt) → bidCommitment = Poseidon(bid, salt)
    │
    ├─ generateBidRangeProof({ bid, salt, reservePrice, maxBudget })
    │   [snarkjs.groth16.fullProve — ~1-2s]
    │   → { proof: Groth16Proof,
    │        publicSignals: [rangeOk, bidCommitment, reservePrice, maxBudget] }
    │
    ├─ ActionSigner.signBid({ auctionId, agentId, amount, nonce })
    │   → { type: 'BID', ..., signature }
    │
POST /auctions/:id/action
    { type: 'BID', ..., signature, proof: { proof, publicSignals } }
    │
    ▼ Engine: AuctionRoom → handleBid()
    │
    ├─ verifyBidRangeProof({ proof, publicSignals }, { requireProof: true })
    │   snarkjs.groth16.verify(BID_RANGE_VKEY, publicSignals, proof)
    │   check publicSignals[0] === '1' (rangeOk output)
    │   → { valid: true, bidCommitment, reservePrice, maxBudget }
    ├─ cross-check: proof.maxBudget <= auction.maxBid cap (if set)
    ├─ verifySignature(action, auctionId)
    ├─ checkNonce(agentId, BID, nonce, storage)
    └─ validate amount > highestBid
```

### Agent Onboarding (One-Time, Before Auctions)

```
[Agent setup — run once per agent identity]
    │
    ├─ generateSecret() → agentSecret (random 256-bit)
    ├─ generateSecret() → salt
    ├─ computeLeaf(capabilityId, agentSecret, leafIndex) → leafHash
    ├─ buildPoseidonMerkleTree([leafHash]) → { root, layers, zeroHashes }
    ├─ computeRegistrationCommit(agentSecret, capabilityMerkleRoot, salt) → commit
    │   keccak256(abi.encodePacked(agentSecret, capabilityMerkleRoot, salt))
    │
    └─ AgentPrivacyRegistry.register(agentId, commit) → TX on Base Sepolia
       [After TX confirmed, getRoot() returns new Poseidon root including this agent]
```

### Frontend ZK Status Display

```
[WebSocket event from Engine — participant channel]
    {
      actionType: 'JOIN',
      zkNullifier: '0x...',   ← present when proof was provided
      agentId: '●●●●XX',      ← masked for public channel
    }
    │
    └─ Frontend checks: event.zkNullifier !== undefined
       → render <ProofBadge verified={true} nullifier={event.zkNullifier} />
       → display: "ZK Verified — Nullifier consumed"
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Demo (1-10 agents) | Proof generation in agent-client or MCP server process; no distributed concerns |
| Hackathon demo | Single DO per auction, snarkjs runs synchronously in agent process, no queuing needed |
| Production | Move proof generation to dedicated worker service; cache Merkle trees in DB; batch registry root reads |

### Scaling Priorities

1. **First bottleneck:** Proof generation time (2-5s per membership proof). At demo scale, this is synchronous in the agent process. For production, offload to a dedicated prover service that accepts witness inputs and returns proofs.
2. **Second bottleneck:** On-chain registry root staleness. If many agents register simultaneously, the root changes. Agents must re-read the root immediately before proof generation, not cache it from registration time.

## Anti-Patterns

### Anti-Pattern 1: Top-Level snarkjs Import in CF Workers

**What people do:** `import * as snarkjs from 'snarkjs'` at the top of an engine file.
**Why it's wrong:** ffjavascript (snarkjs dependency) calls `URL.createObjectURL()` during module initialization. CF Workers does not have this API. The worker crashes on startup, not at verification time.
**Do this instead:** Use the lazy-import pattern already in `engine/src/lib/crypto.ts` — `let _snarkjs = null; async function getSnarkjs() { if (!_snarkjs) _snarkjs = await import('snarkjs'); return _snarkjs }`.

### Anti-Pattern 2: Generating Proofs in the Engine

**What people do:** Move proof generation (snarkjs.fullProve) into the Cloudflare Worker to accept witness inputs and return proofs.
**Why it's wrong:** Proof generation requires loading `.wasm` and `.zkey` files (tens of MB) that cannot be bundled into a CF Worker. CF Workers have a 25MB bundle limit and no filesystem. Generation is also computationally expensive (seconds), not suitable for request-handling path.
**Do this instead:** Generate proofs in the agent-client (or a dedicated Node.js prover service). Only verification happens in the engine. This is the existing design.

### Anti-Pattern 3: Reusing the Same Salt for Multiple Proofs

**What people do:** Generate agentSecret once, use the same salt for every JOIN and BID proof across auctions.
**Why it's wrong:** The BidRange circuit uses `Poseidon(bid, salt)` as the bidCommitment. Reusing salt + bid across auctions allows commitment correlation. The RegistryMembership circuit's nullifier is `Poseidon(agentSecret, auctionId, 1)` which is auction-scoped (safe), but bid salts should be fresh per bid.
**Do this instead:** `agentSecret` is long-lived (stored in AgentPrivateState). `salt` for BidRange should be randomly generated per bid. The `salt` in AgentPrivateState is for registration; use `crypto.getRandomValues()` per bid call.

### Anti-Pattern 4: Passing AgentPrivateState (agentSecret) Through MCP Tool Parameters

**What people do:** Accept agentSecret as an MCP tool input parameter so the LLM can construct it from context.
**Why it's wrong:** agentSecret is the root credential. It must never be in LLM context, MCP logs, tool call history, or wire. Exposure allows proof forgery and identity impersonation.
**Do this instead:** Load agentSecret from a secure file or environment variable at MCP server startup, store it in `ServerConfig` in memory, and reference it from tool handlers via the config object. The LLM should only pass non-secret parameters (auctionId, bidAmount).

### Anti-Pattern 5: Skipping the On-Chain Registry Root Cross-Check

**What people do:** Generate a membership proof against a locally-computed root without verifying it matches `AgentPrivacyRegistry.getRoot()` before submission.
**Why it's wrong:** The engine already cross-checks `publicSignals[0] === expectedRegistryRoot`. If the on-chain root has changed since the agent last registered (other agents registered after), the proof will be rejected with a root mismatch error. This is a runtime failure that is hard to diagnose.
**Do this instead:** Always read `AgentPrivacyRegistry.getRoot()` immediately before generating the membership proof, and use that exact value as `registryRoot` in the circuit inputs.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| AgentPrivacyRegistry (Base Sepolia) | `publicClient.readContract({ functionName: 'getRoot' })` — read before proof generation; `walletClient.writeContract({ functionName: 'register' })` — one-time agent setup | Root changes whenever a new agent registers; must read fresh before each proof |
| CF Workers Durable Object | HTTP POST `/auctions/:id/action` with `proof: { proof: Groth16Proof, publicSignals: string[] }` in body | Engine verifies via inlined vkeys; no vkey file loading needed in engine |
| MCP server ↔ agent-client | Agent-client uses HTTP; MCP server uses MCP tool calls from LLM. Both share the same proof payload schema. | MCP server needs access to AgentPrivateState for proof generation |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| agent-client / packages/crypto | Direct TypeScript import — `generateMembershipProof`, `buildPoseidonMerkleTree`, etc. | No serialization boundary; runs in same Node.js process |
| mcp-server / packages/crypto | Direct TypeScript import (same package, loaded at server startup) | MCP server must have `circuits/` directory accessible (relative path via `circuitsDir()`) |
| mcp-server tool → Engine | HTTP POST with JSON payload including `proof` field | MCP server tool handlers currently hardcode `proof: null`; need to pass through real proof |
| Engine (CF Worker) / snarkjs | Lazy dynamic import within worker — `await import('snarkjs')` | Verification only, not generation; vkeys are inlined constants (no file I/O) |
| packages/crypto/proof-generator.ts ↔ circuits/ | Filesystem path resolution via `circuitsDir()` = `dirname(import.meta.url)/../../../circuits` | If MCP server or agent-client moves, this relative path must remain valid or be made configurable |

### Build Order for ZK Integration

The dependency chain determines build order:

```
1. circuits/ — must be compiled first (circom → .wasm + .zkey)
   circom RegistryMembership.circom → RegistryMembership_js/RegistryMembership.wasm
   snarkjs groth16 setup → circuits/keys/registry_member_final.zkey
   (DONE — already compiled)

2. packages/crypto/ — proof generation + verification library
   npm run build → dist/
   npm test — connects proof-generator.test.ts to real .wasm/.zkey files
   (PARTIALLY DONE — tests exist but test harness not connected)

3. agent-client/ — needs packages/crypto as dependency
   Wire privacy.ts to use buildPoseidonMerkleTree (currently uses shortcut capabilityId as root)
   Wire auction.ts joinAuction/placeBid to call generateMembershipProof/generateBidRangeProof
   (NOT DONE)

4. mcp-server/ — needs packages/crypto accessible
   Add zkProof parameter to join_auction and place_bid tools
   Load AgentPrivateState from config at startup
   Forward proof payload in engine POST body
   (NOT DONE)

5. Engine (already done — no new work needed for verification)
   verifyMembershipProof and verifyBidRangeProof already wired in handlers/actions.ts
   ENGINE_REQUIRE_PROOFS=true flag already implemented
   (DONE — just needs real proofs sent to it)

6. AgentPrivacyRegistry — populate with test agents
   Run agent onboarding script for demo agents
   Confirm getRoot() returns populated root
   (NOT DONE)

7. Frontend — ZK status indicators
   Add zkNullifier field to WebSocket event type
   Render ProofBadge component when zkNullifier present in JOIN event
   (NOT DONE)
```

## Sources

- Direct codebase analysis: `engine/src/lib/crypto.ts` — snarkjs lazy-import pattern, inlined vkeys, verifyMembershipProof, verifyBidRangeProof (HIGH confidence)
- Direct codebase analysis: `engine/src/handlers/actions.ts` — handleJoin, handleBid, dual nullifier strategy (HIGH confidence)
- Direct codebase analysis: `packages/crypto/src/proof-generator.ts` — generateMembershipProof, generateBidRangeProof, .wasm/.zkey file paths (HIGH confidence)
- Direct codebase analysis: `packages/crypto/src/onboarding.ts` — buildPoseidonMerkleTree, getMerkleProof, computeLeaf (HIGH confidence)
- Direct codebase analysis: `circuits/src/RegistryMembership.circom` — circuit public/private signal layout (HIGH confidence)
- Direct codebase analysis: `circuits/src/BidRange.circom` — circuit public/private signal layout (HIGH confidence)
- Direct codebase analysis: `mcp-server/src/tools/join.ts`, `bid.ts` — current state with `proof: null` (HIGH confidence)
- Direct codebase analysis: `agent-client/src/auction.ts` — current state with `proof: null` (HIGH confidence)
- Direct codebase analysis: `engine/src/types/engine.ts` — ActionRequest.proof as `unknown`, AuctionEvent.zkNullifier (HIGH confidence)
- Cloudflare Workers constraints (URL.createObjectURL absence, 25MB bundle limit): MEDIUM confidence — well-established CF Workers limitation, confirmed by engine's existing workaround

---
*Architecture research for: ZK proof integration in agent-native auction platform*
*Researched: 2026-03-02*
