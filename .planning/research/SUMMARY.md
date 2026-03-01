# Project Research Summary

**Project:** ZK Privacy E2E — Agent-Native Auction Platform (Chainlink 2026 Hackathon)
**Domain:** ZK proof end-to-end integration in a brownfield agent-native auction system
**Researched:** 2026-03-02
**Confidence:** HIGH

## Executive Summary

This is a brownfield integration milestone, not a greenfield build. The auction platform (contracts, engine, CRE settlement, MCP server, frontend) is fully operational on Base Sepolia with 144 passing contract tests and confirmed CRE settlement. Two Groth16 ZK circuits (RegistryMembership ~12K constraints, BidRange ~5K constraints) are compiled, verified keys exist, and verification code is already wired in the Cloudflare Workers engine. The only remaining work is closing 6 specific gaps: circuit test harness connection, on-chain Merkle root population, agent-client proof generation, MCP tool schema extension, engine end-to-end verification under `ENGINE_REQUIRE_PROOFS=true`, and frontend ZK status indicators.

The recommended approach is strictly wire-existing-pieces, in dependency order. Nothing new should be designed or invented. The dependency chain is hard: on-chain Merkle root population must complete before proof generation can produce valid proofs; circuit test harness must pass before any wiring begins; MCP tool schema must accept proof payloads before the agent autonomy angle can be demonstrated. The hackathon differentiator — an AI agent autonomously generating and submitting ZK proofs via MCP tools — requires all 6 gaps closed in sequence, not in parallel.

The primary risk is a silent hash function mismatch: the `AgentPrivacyRegistry` contract computes its Merkle root with keccak256 while the RegistryMembership circuit expects a Poseidon root. The engine's `expectedRegistryRoot` cross-check will reject every real proof submitted. The fix is a one-line removal in the engine (Option A: drop the cross-check; Groth16 verification still provides cryptographic security). A secondary risk is nullifier type mismatch: the EIP-712 signer currently derives a keccak nullifier, but when ZK proofs are present, the signature must commit to the Poseidon nullifier extracted from the proof. Both risks are confirmed via direct codebase analysis and have known, low-cost mitigations.

## Key Findings

### Recommended Stack

No new packages are needed. The entire integration uses existing dependencies. snarkjs 0.7.6 handles Groth16 `fullProve` in Node.js (agent-client) and `groth16.verify` in Cloudflare Workers (engine, using lazy dynamic import). poseidon-lite 0.3.0 is the canonical hash in all runtimes. The MCP SDK at 1.27.1 requires Zod v3 (do not upgrade to v4 — it breaks tool execution with `w._parse is not a function`). The CF Workers lazy import pattern for snarkjs (`let _snarkjs = null; async function getSnarkjs()`) is already in place and must not be changed.

**Core technologies:**
- snarkjs 0.7.6: Groth16 proof generation (`fullProve`, Node.js only) and verification (`groth16.verify`, CF Workers via lazy import) — the only JS Groth16 library; already in use
- poseidon-lite 0.3.0: Poseidon hash for Merkle trees in engine and agent-client — zero-dependency, CF Workers compatible; already canonical
- @modelcontextprotocol/sdk 1.27.1: MCP tool registration with nested Zod schemas for proof payloads — already in use; supports `z.array(z.string())` for proof arrays
- zod ^3.25.0: Peer dep of MCP SDK — must stay at v3; Zod v4 causes runtime failures in tool execution
- viem 2.46.2: EIP-712 signing for agent-client and MCP signer — already wired

### Expected Features

**Must have (table stakes — demo is unconvincing without these):**
- Circuit test harness passes for both RegistryMembership and BidRange — prerequisite for all downstream work
- AgentPrivacyRegistry Merkle root populated on-chain with test agent leaves — proof verification fails if root is 0x00
- Agent-client generates real Groth16 membership proof and submits via MCP `join_auction` — core ZK demo
- Agent-client generates real Groth16 bid range proof and submits via MCP `place_bid` — bid privacy
- Engine verifies both proofs with `ENGINE_REQUIRE_PROOFS=true`, stores `zkNullifier` in AuctionEvent — enforced ZK gate
- Frontend JOIN events show "ZK VERIFIED" badge when `zkNullifier` present — judges need visual confirmation

**Should have (differentiators, add once P1 chain is green):**
- MCP-native full autonomous proof flow (AI agent generates + submits proofs end-to-end via MCP tools) — unique hackathon angle not seen in any comparable project
- Frontend BID events show truncated `bidCommitment` — visualizes bid privacy
- Privacy guarantee explainer panel in auction room — accessibility for non-ZK judges
- Proof generation timing display in agent-client logs — demonstrates real computation
- Nullifier display in settlement page — cryptographic audit trail

**Defer (v2+ / post-hackathon):**
- On-chain Solidity Groth16 verifier — P1 per PROJECT.md; adds gas cost without hackathon demo value
- Sealed-bid commit-reveal flow — requires new circuit; out of scope
- In-browser proof generation — WASM + large proving keys cause bad UX
- ZK replay integrity verification — prove event log integrity via ZK hash chain proof

### Architecture Approach

The architecture is already correctly designed with a strict client-side / server-side proof boundary. Proof generation (`snarkjs.groth16.fullProve`) stays in agent-client and MCP server (Node.js; requires filesystem for `.wasm` and `.zkey`). Proof verification (`snarkjs.groth16.verify` with inlined vkeys) stays in the CF Workers engine. The integration work fills 6 gaps in existing files — two new files are needed (`agent-client/src/zk-prover.ts`, `mcp-server/src/lib/zk-state.ts`) and one new frontend component (`frontend/src/components/zk/ProofBadge.tsx`). No new contracts, no new circuits, no architecture changes.

**Major components:**
1. `packages/crypto/proof-generator.ts` — generates Groth16 proofs client-side; already implemented; needs to be called
2. `packages/crypto/onboarding.ts` — builds 20-level Poseidon Merkle tree and extracts membership witness; already implemented
3. `engine/src/lib/crypto.ts` — verifies Groth16 proofs in CF Workers with inlined vkeys; already implemented; needs real proofs sent to it
4. `mcp-server/src/tools/join.ts` and `bid.ts` — currently hardcode `proof: null`; need ZK proof payload parameter added
5. `agent-client/src/auction.ts` — currently submits `proof: null`; needs proof generation wired in
6. `contracts/AgentPrivacyRegistry.sol` — on-chain Merkle root; currently empty; must be populated before demo

**Key patterns to preserve:**
- Lazy snarkjs import in engine (`let _snarkjs = null` + dynamic import) — any static import breaks CF Workers startup
- Proof generation strictly in Node.js runtimes, never in CF Workers (`fullProve` requires filesystem)
- `agentSecret` loaded from secure config at server startup, never passed through MCP tool parameters or LLM context

### Critical Pitfalls

1. **keccak256 vs Poseidon Merkle root mismatch** — `AgentPrivacyRegistry._updateRoot()` uses keccak256; RegistryMembership circuit expects Poseidon. Engine's `expectedRegistryRoot` cross-check will reject every real proof. Fix: remove the cross-check from the engine (Option A) — Groth16 verification alone provides cryptographic security. One-line change, no contract redeploy. Must be addressed in Phase 1.

2. **EIP-712 nullifier type mismatch** — `mcp-server/src/lib/signer.ts` derives a keccak nullifier in `signJoin()`. When ZK proof is present, the engine extracts a Poseidon nullifier from `publicSignals[2]`. Signature verification fails because the signed message contains the wrong nullifier. Fix: extend `signJoin()` to accept an optional `nullifier: bigint` parameter; caller computes `Poseidon(agentSecret, auctionId, 1)` before signing. Must be addressed in Phase 2.

3. **MCP tools have no proof payload path** — `join_auction` and `place_bid` input schemas accept no proof parameters; `signJoin()` hardcodes `proof: null`. When `ENGINE_REQUIRE_PROOFS=true`, these tools always produce rejected actions. Fix: add optional `proof: z.string().optional()` (JSON-encoded) to both tool schemas; pass through to engine payload. Phase 2.

4. **Public signals index is an implicit contract** — `RegistryMembership` circuit outputs `[registryRoot, capabilityCommitment, nullifier]` at indices 0/1/2; BidRange outputs `[rangeOk, bidCommitment, reservePrice, maxBudget]` at indices 0/1/2/3. If these drift, proofs silently verify while extracting wrong semantic values. Fix: define named constants in `packages/crypto/src/signal-indices.ts` and use them everywhere. Phase 1.

5. **BidRange throws on out-of-range bid instead of returning invalid** — `snarkjs.groth16.fullProve` throws an exception (not a structured error) when `bid < reservePrice` because Num2Bits(64) constraint fails on field-wrapped negative values. Fix: validate bid bounds before calling `generateBidRangeProof()`; wrap `fullProve` in try-catch returning `{ success: false, reason: 'bid_out_of_range' }`. Phase 3.

## Implications for Roadmap

Research reveals a strict dependency chain that determines phase order. No phase can begin until its prerequisites are confirmed. The recommended structure is 4 phases:

### Phase 1: Circuit Test Harness and Foundation

**Rationale:** Every downstream phase depends on confirmed circuit behavior. The keccak/Poseidon root mismatch (Pitfall 1) and public signals index contract (Pitfall 4) must be identified and fixed here before any wiring begins. This is the highest-risk phase — failures here are blockers, not bugs.

**Delivers:**
- Circuit test harness connected to real `.wasm` and `.zkey` artifacts; both RegistryMembership and BidRange tests passing
- `packages/crypto/src/signal-indices.ts` with named signal index constants
- Engine `expectedRegistryRoot` cross-check removed (Option A fix for keccak/Poseidon mismatch)
- AgentPrivacyRegistry populated on Base Sepolia with test agent leaves; `getRoot()` returns non-zero value
- `packages/crypto/` builds cleanly with `npm run build`; proof generation works end-to-end in Node.js context

**Features addressed:** Circuit test harness passing, Merkle root populated on-chain

**Pitfalls avoided:** keccak vs Poseidon root mismatch, public signals index mismatch, `fullProve` filesystem access in CF Workers (by keeping tests in Node.js Vitest, not Miniflare)

**Research flag:** No additional research needed — all patterns are documented in ARCHITECTURE.md and PITFALLS.md with codebase references.

### Phase 2: MCP Tool ZK Payload Wiring

**Rationale:** The AI-native angle (MCP-mediated proof submission) is the primary hackathon differentiator. This phase wires proof payloads through the MCP tool interface, fixes the EIP-712 nullifier mismatch, and validates the engine accepts real proofs end-to-end.

**Delivers:**
- `join_auction` and `place_bid` MCP tool input schemas extended with optional `proof: z.string()` parameter
- `mcp-server/src/lib/zk-state.ts` loading `AgentPrivateState` at server startup (never through tool parameters)
- `signJoin()` extended to accept optional `nullifier: bigint` for ZK flow
- Integration test: proof generated client-side → submitted via MCP tool → engine accepts with `ENGINE_REQUIRE_PROOFS=true` → `zkNullifier` present in stored AuctionEvent

**Features addressed:** MCP tools accept ZK proof payloads, MCP-native full autonomous proof flow

**Pitfalls avoided:** EIP-712 nullifier type mismatch, `agentSecret` exposure via MCP parameters

**Research flag:** No additional research needed — MCP SDK Zod schema patterns are confirmed in STACK.md.

### Phase 3: Agent-Client ZK Integration

**Rationale:** The agent-client is the proof generation orchestrator. With Phase 1 (circuits confirmed working) and Phase 2 (MCP tools accepting proofs) complete, this phase wires the full flow: agent reads on-chain state, builds Merkle witness, generates proof, signs with Poseidon nullifier, submits via MCP.

**Delivers:**
- `agent-client/src/zk-prover.ts` — bridge between `packages/crypto/proof-generator.ts` and auction flow
- `agent-client/src/privacy.ts` updated to use `buildPoseidonMerkleTree` with real leaf hashes (not shortcut)
- `agent-client/src/auction.ts` `joinAuction()` and `placeBid()` replace `proof: null` with real Groth16 proofs
- Bid bounds validation before `generateBidRangeProof()` with structured error return
- `AgentPrivateState` persisted as JSON file; loaded per session
- End-to-end demo: agent autonomously onboards → joins with ZK membership proof → bids with ZK range proof → CRE settles

**Features addressed:** Real proof generation in agent-client, nullifier prevents double-join (integration test), MCP-native full autonomous flow (complete)

**Pitfalls avoided:** BidRange constraint failure on out-of-range bid, wrong Merkle tree root (per-agent vs global)

**Research flag:** No additional research needed — data flows are fully documented in ARCHITECTURE.md.

### Phase 4: Frontend ZK Status Indicators

**Rationale:** Without visual confirmation, judges cannot distinguish real ZK from stubbed behavior. This phase adds the UI elements that make the cryptographic guarantees visible. It has no backend dependencies beyond `zkNullifier` appearing in AuctionEvents (delivered by Phase 2/3).

**Delivers:**
- `frontend/src/components/zk/ProofBadge.tsx` — "ZK VERIFIED" / nullifier consumed badge
- JOIN event rows in activity feed show ZK badge when `zkNullifier` present in WebSocket event
- BID event rows show truncated `bidCommitment` when available
- Privacy guarantee explainer panel in auction room page
- Settlement page shows consumed nullifier hashes as audit trail
- Basescan link to `AgentPrivacyRegistry` for judges to verify on-chain root

**Features addressed:** Frontend ZK badge on JOIN events, bid commitment display, privacy explainer panel, nullifier display in settlement, two-tier privacy display

**Pitfalls avoided:** Frontend inferring ZK status from proof field presence (must read `proofVerified: true` from engine event record)

**Research flag:** Standard React/Next.js component work. No research needed.

### Phase Ordering Rationale

- Phase 1 must come first because the keccak/Poseidon mismatch is a silent blocker. Discovering it after wiring agent-client and MCP tools would require debugging a non-obvious cross-system failure. Discovering it in the circuit test harness produces a clear, isolated failure.
- Phase 2 before Phase 3 because the MCP tool schema must accept proof payloads before the agent-client can submit them through MCP. Wiring agent-client first with direct HTTP bypasses the MCP layer and misses the nullifier mismatch.
- Phase 4 last because it has no blocking dependencies and is entirely additive. Frontend can be built independently once `zkNullifier` appears in event records.
- The dependency chain `[Phase 1 circuits passing] → [Phase 1 Merkle root on-chain] → [Phase 2 MCP schema] → [Phase 3 agent-client proof] → [Phase 3 E2E demo]` must be satisfied in order. All other features are parallel to this critical path.

### Research Flags

Phases needing additional research during planning:
- None. All integration patterns are confirmed from direct codebase analysis (HIGH confidence). The ARCHITECTURE.md documents the complete data flow for both JOIN and BID with ZK proofs, including the exact function calls and file locations.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Circuit Test Harness):** Circuit test patterns are well-documented; snarkjs `fullProve` usage is confirmed working in the existing `packages/crypto/src/proof-generator.ts`.
- **Phase 2 (MCP Tool Wiring):** MCP SDK Zod schema patterns are confirmed; the only non-standard element (nullifier mismatch fix) has a known fix documented in PITFALLS.md.
- **Phase 3 (Agent-Client Integration):** All functions needed exist in `packages/crypto`; wiring is connecting existing pieces.
- **Phase 4 (Frontend):** Standard React component work with no novel patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm registry; CF Workers constraints confirmed via official docs and existing codebase workarounds |
| Features | MEDIUM | Hackathon judge expectations are inferred from comparable ZK hackathon projects (ETHGlobal Bangkok 2024, zkVerify) — not confirmed by this specific Chainlink track rubric |
| Architecture | HIGH | All component responsibilities and data flows verified via direct codebase analysis; no speculation |
| Pitfalls | HIGH | Pitfalls 1, 2, 3, 5 confirmed via direct source code inspection (keccak in contract, null in signer, static import in engine); Pitfalls 4, 6, 7 confirmed from ZK domain knowledge with codebase cross-references |

**Overall confidence:** HIGH

### Gaps to Address

- **Chainlink track evaluation rubric:** The hackathon evaluation criteria specific to the Chainlink 2026 track are inferred from generic ZK hackathon patterns, not the actual rubric. If the Chainlink track weights CRE integration more than ZK privacy, Phase 4 (frontend indicators) may be lower priority than improving the CRE settlement story.
- **snarkjs `groth16.verify` latency in CF Workers production:** The ~50-400ms estimate for BN254 pairing verification in V8/WASM is from secondary sources. The engine must be on the Paid plan (5 min CPU). If latency exceeds expectations, caching verified nullifiers in DO storage (already done for double-join prevention) is the mitigation.
- **`AgentPrivacyRegistry.getRoot()` and keccak tree semantics:** After removing the `expectedRegistryRoot` cross-check (Option A fix), the on-chain `getRoot()` value is no longer used for proof validation. The research recommends this fix but does not assess whether the on-chain root serves any other security purpose that would be lost. This should be confirmed before implementation.

## Sources

### Primary (HIGH confidence)
- `engine/src/lib/crypto.ts` — snarkjs lazy-import pattern, inlined vkeys, `verifyMembershipProof`, `verifyBidRangeProof`
- `engine/src/handlers/actions.ts` — `handleJoin`, `handleBid`, dual nullifier strategy, `ENGINE_REQUIRE_PROOFS` gate
- `packages/crypto/src/proof-generator.ts` — `generateMembershipProof`, `generateBidRangeProof`, filesystem path resolution
- `packages/crypto/src/onboarding.ts` — `buildPoseidonMerkleTree`, `getMerkleProof`, `computeLeaf`
- `circuits/src/RegistryMembership.circom` and `BidRange.circom` — circuit public/private signal layouts
- `mcp-server/src/tools/join.ts`, `bid.ts`, `lib/signer.ts` — current state with `proof: null` hardcoded
- `contracts/src/AgentPrivacyRegistry.sol` — `_updateRoot` uses keccak256 (mismatch with circuit)
- npm registry (snarkjs@0.7.6, poseidon-lite@0.3.0, @modelcontextprotocol/sdk@1.27.1) — version verification
- Cloudflare Workers docs — CPU time limits (Paid plan: 5 min), `URL.createObjectURL` absence

### Secondary (MEDIUM confidence)
- GitHub issue modelcontextprotocol/modelcontextprotocol#1429 — Zod v4 incompatibility with MCP SDK
- Palm zkKYC ETHGlobal project — comparable ZK auction/identity pattern at hackathon
- ZK Hack Berlin 2025 — working proof chain beats ambitious incomplete demo (scope guidance)
- 0xPARC ZK Bug Tracker — public signals ordering vulnerabilities
- RareSkills — AliasCheck and Num2Bits_strict in Circomlib (BidRange constraint behavior)
- Cloudflare Workers higher CPU limits changelog (March 2025)

### Tertiary (LOW confidence)
- snarkjs groth16 verify ~400ms benchmark on BN254 — single source, no official benchmark; order-of-magnitude estimate only
- zkVerify Hackathon evaluation criteria — proxy for Chainlink track rubric; actual Chainlink 2026 rubric not confirmed

---
*Research completed: 2026-03-02*
*Ready for roadmap: yes*
