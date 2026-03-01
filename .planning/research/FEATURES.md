# Feature Research

**Domain:** ZK-enabled agent-native auction platform (hackathon demo milestone)
**Researched:** 2026-03-02
**Confidence:** MEDIUM

---

## Context: What Already Exists vs What This Milestone Adds

This is a brownfield milestone on a functioning platform. The full stack (contracts, engine, CRE settlement, frontend, MCP server) is shipped and running on Base Sepolia. The question is: what ZK privacy features does the hackathon audience expect to SEE demonstrated, and which ones differentiate from typical ZK demos?

**Existing (not in scope here):**
- Agent masking via string obfuscation (`Agent ●●●●XX`) in frontend
- Nullifier derivation and storage in engine (keccak fallback)
- ZK proof structs in engine types (`proof?: unknown`, `zkNullifier?: string`)
- Engine ZK verification code (verifyMembershipProof, verifyBidRangeProof with inlined vkeys)
- Groth16 circuits compiled (RegistryMembership ~12K constraints, BidRange ~5K constraints)
- Proof generation functions in `packages/crypto` (generateMembershipProof, generateBidRangeProof)

**Gap (what this milestone wires end-to-end):**
- Circuit test harness not connected
- Agent-client generates no ZK proofs (only EIP-712 signatures)
- MCP tools do not accept ZK proof payloads
- Engine's `ENGINE_REQUIRE_PROOFS=true` path untested with real circuits
- Merkle root on-chain (`AgentPrivacyRegistry`) unpopulated with test leaves
- Frontend shows no cryptographic verification indicators — only string masking

---

## Feature Landscape

### Table Stakes (Judges Won't See ZK Value Without These)

These are the minimum features required for a hackathon judge to understand that ZK proofs are actually happening and actually providing privacy guarantees. Missing any of these = the demo looks like it has ZK in name only.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Real proof generation in agent-client** | Without generating a real Groth16 proof, there is nothing to verify — the whole chain collapses | HIGH | `generateMembershipProof` + `generateBidRangeProof` from `packages/crypto` must be called during JOIN and BID flows in `agent-client` |
| **MCP tools accept ZK proof payloads** | Judges interact with AI agents via MCP; proof must flow through agent tools, not bypass them | MEDIUM | `join_auction` and `place_bid` tools need `zkProof?: { proof, publicSignals }` input field and forwarding logic |
| **Engine verifies real proofs (ENGINE_REQUIRE_PROOFS=true)** | If the engine accepts bids without proof, the ZK gate provides no actual security — demo is hollow | MEDIUM | Engine verification path already coded; needs real circuit outputs as test input to confirm it works |
| **AgentPrivacyRegistry Merkle root populated on-chain** | Membership proof is checked against on-chain `getRoot()` — without leaves registered, all proofs fail | HIGH | Must compute Poseidon leaf hashes for test agents, build Merkle tree, and call `AgentPrivacyRegistry.updateRoot()` on Base Sepolia with deployer wallet |
| **Circuit test harness passes** | Establishes that the circuits produce valid proofs before wiring anything else | MEDIUM | `npm test` in `circuits/` or a harness that generates witness + proof using test inputs and verifies with vkey |
| **Nullifier prevents double-join** | Core privacy property — same agent cannot join twice in same auction | LOW | Code already exists; needs integration test with real Poseidon nullifier from proof, not keccak fallback |
| **Frontend shows ZK proof verified badge on JOIN events** | Without visual confirmation, judges cannot tell if ZK ran or if it was stubbed | LOW | Activity feed event row for JOIN should show "ZK VERIFIED" status chip when `zkNullifier` is present in event |
| **Frontend shows bid commitment display for BID events** | Judges need to see that bid amounts are committed-but-hidden at bid time | LOW | BID events in activity feed should show `commitment: 0x...` truncated — not the raw amount until reveal |

### Differentiators (Competitive Advantage at Hackathon)

These are what push this beyond a standard "we have ZK" demo. The Chainlink 2026 hackathon evaluates technology, innovation, completion, and documentation. These features address innovation and the AI-native angle specifically.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **MCP-native proof submission (AI agent generates and submits ZK proof autonomously)** | No other ZK auction demo shows an AI agent using MCP tools to autonomously generate and submit cryptographic proofs — this is the unique AI-native ZK angle | HIGH | Agent-client + MCP server together: agent receives auction context from `discover_auction` MCP tool, computes Merkle path from on-chain state, calls `generateMembershipProof`, submits via `join_auction` MCP tool — full agent autonomy |
| **Two-tier privacy display in spectator UI** | Public sees masked identities + proof verification status, participants see full event data — this visualizes the two-tier WebSocket architecture meaningfully | MEDIUM | Enhance existing masked agent display: public view shows "ZK MEMBER" badge and nullifier hash prefix, participant view (if ever unlocked) shows full identity |
| **Live Base Sepolia proof chain visible in frontend** | Replay viewer showing the Poseidon hash chain with nullifiers tied to real on-chain Merkle root is a uniquely verifiable demo artifact | MEDIUM | Replay bundle already exists; extend to include `zkNullifier` field in event display with a link to `AgentPrivacyRegistry.getRoot()` on Basescan |
| **Privacy guarantee explainer panel in frontend** | Judges who are not ZK experts need 2-3 sentences explaining what they are seeing — "This agent proved membership without revealing who they are" | LOW | Static explanatory callout in auction room page, context-sensitive to proof status |
| **Nullifier display in settlement view** | After settlement, showing the consumed nullifier hash as a cryptographic audit trail — proves agent cannot double-join | LOW | Settlement page: list `zkNullifier` values from all JOIN events alongside their on-chain Merkle root |
| **Proof generation timing display in agent-client logs** | Shows judges that real computation happened (1-3 seconds for BidRange ~5K constraints, longer for RegistryMembership ~12K) | LOW | Add `console.time` / `logStep` around proof generation calls — no code change needed in core, just instrumentation |

### Anti-Features (Deliberately NOT Building for This Milestone)

Features that seem relevant but would cost time without demo value, or contradict the milestone's explicit out-of-scope boundaries.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **On-chain Solidity Groth16 verifier** | Adds a new contract deployment, gas cost, and integration complexity. Off-chain snarkjs in the engine is sufficient — judges see the proof verified, not where verification runs | Display "verified off-chain (snarkjs/Groth16)" badge in UI explicitly |
| **Sealed-bid commit-reveal flow** | Requires a new circuit and protocol-level changes (bid stays hidden until reveal round). Not in existing circuits, and out of scope per PROJECT.md | Use BidRange proof (bid is in range) as the privacy primitive — sufficient for demo |
| **New circuit development** | PROJECT.md explicitly prohibits this; RegistryMembership + BidRange are the two circuits to use as-is | Wire existing circuits only |
| **Proof generation in-browser** | snarkjs in browser requires WASM + large proving keys (~hundreds of MB for RegistryMembership) — causes bad demo UX with long load times | Keep proof generation in agent-client (Node) or MCP server; frontend only shows verification status |
| **ZK KYC / compliance gating** | This is an identity/compliance pattern (e.g., Palm zkKYC on Uniswap v4) that adds regulatory surface area; unrelated to the agent-native auction value proposition | Membership proof (registry inclusion) is the identity primitive |
| **ZK-STARK or PLONK circuits** | Existing circuits are Groth16/Circom; switching proof systems mid-hackathon is a rewrite | Stay on Groth16 with existing circuits |
| **Multi-party nullifier or threshold schemes** | Advanced privacy primitive requiring new circuit; no existing support | Single-party nullifier via `Poseidon(agentSecret, auctionId, actionType)` is sufficient |
| **Mobile-responsive ZK UI** | Web spectator terminal aesthetic is established; responsive redesign is scope creep | Terminal/monospace web UI as-is |

---

## Feature Dependencies

```
[AgentPrivacyRegistry Merkle root populated on-chain]
    └──required-by──> [Real proof generation in agent-client]
                          └──required-by──> [MCP tools accept ZK proof payloads]
                                                └──required-by──> [Engine verifies real proofs]
                                                                       └──required-by──> [zkNullifier in AuctionEvent]
                                                                                             └──required-by──> [Frontend ZK badge on JOIN events]

[Circuit test harness passes]
    └──required-by──> [Real proof generation in agent-client]

[zkNullifier in AuctionEvent]
    └──required-by──> [Nullifier display in settlement view]
    └──required-by──> [Live Base Sepolia proof chain in replay viewer]

[Frontend ZK badge on JOIN events]
    └──enhances──> [Two-tier privacy display in spectator UI]
    └──enhances──> [Privacy guarantee explainer panel]

[MCP-native proof submission]
    └──requires──> [MCP tools accept ZK proof payloads]
    └──requires──> [Real proof generation in agent-client]
```

### Dependency Notes

- **Merkle root population blocks proof generation**: `generateMembershipProof` requires `pathElements` and `pathIndices` derived from the same Merkle tree whose root is stored on-chain. If the on-chain root doesn't match the tree used to generate proof inputs, all membership proofs fail at engine verification (`expectedRegistryRoot` check).

- **Circuit test harness is a prerequisite, not a parallel task**: Running the harness confirms `.wasm` + `.zkey` files produce valid proofs before wiring them into agent-client. A circuit failure discovered mid-integration is a demo-blocking blocker.

- **Engine verification only needs to handle one path**: The existing `ENGINE_REQUIRE_PROOFS=false` (stub/bypass) path is fine for non-proof participants. The key is that when a real proof IS submitted, the engine's `verifyMembershipProof` and `verifyBidRangeProof` functions pass — and the `zkNullifier` makes it into the stored `AuctionEvent`.

- **Frontend features have no backend dependencies beyond `zkNullifier` in events**: Once the event log carries `zkNullifier`, all frontend visualization features (badge, explainer panel, settlement display) can be built independently from proof generation.

---

## MVP Definition

### Launch With (v1 — Minimum for Hackathon Judge to See ZK)

These are the features that, combined, demonstrate the ZK claim is real:

- [ ] Circuit test harness wired and passing for both circuits — confirms the cryptographic primitive works
- [ ] AgentPrivacyRegistry Merkle root populated with test agent leaves on Base Sepolia — enables proof verification
- [ ] Agent-client generates real Groth16 membership proof (RegistryMembership) and submits via MCP `join_auction` — end-to-end proof generation
- [ ] Agent-client generates real Groth16 bid range proof (BidRange) and submits via MCP `place_bid` — end-to-end bid privacy
- [ ] Engine verifies both proofs with `ENGINE_REQUIRE_PROOFS=true` and stores `zkNullifier` in `AuctionEvent` — proof acceptance is enforced
- [ ] Frontend JOIN event display shows "ZK VERIFIED" badge when `zkNullifier` present — judges see it worked

### Add After Core ZK Chain Works (v1.x)

Features that enhance the demo once the proof chain is proven end-to-end:

- [ ] Frontend BID events show truncated `bidCommitment` — visible privacy of bid values
- [ ] Privacy guarantee explainer panel in auction room — helps non-ZK judges understand what they are seeing
- [ ] Proof generation timing in agent-client logs — shows real computational work
- [ ] Nullifier display in settlement page — cryptographic audit trail after settlement

### Future Consideration (v2+ / Post-Hackathon)

- [ ] On-chain Solidity Groth16 verifier — P1 per PROJECT.md, adds full trustlessness
- [ ] Sealed-bid commit-reveal — requires new circuit development
- [ ] In-browser proof generation — better UX but requires WASM optimization work
- [ ] ZK replay integrity verification — prove event log has not been tampered using ZK proof over hash chain

---

## Feature Prioritization Matrix

| Feature | Hackathon Judge Value | Implementation Cost | Priority |
|---------|----------------------|---------------------|----------|
| Circuit test harness passing | HIGH (blocks everything) | MEDIUM | P1 |
| Merkle root populated on-chain | HIGH (blocks proof verification) | MEDIUM | P1 |
| Agent-client generates membership proof | HIGH (core ZK demo) | HIGH | P1 |
| Agent-client generates bid range proof | HIGH (core ZK demo) | MEDIUM | P1 |
| MCP tools accept ZK proof payloads | HIGH (AI-native angle) | MEDIUM | P1 |
| Engine verifies proofs (REQUIRE_PROOFS=true) | HIGH (proof of security) | MEDIUM | P1 |
| Frontend ZK badge on JOIN events | HIGH (visual confirmation) | LOW | P1 |
| Frontend bid commitment display | MEDIUM | LOW | P2 |
| Privacy explainer panel | MEDIUM (judge accessibility) | LOW | P2 |
| MCP-native full autonomous proof flow | HIGH (differentiator) | HIGH | P1 |
| Proof generation timing logs | LOW | LOW | P2 |
| Nullifier display in settlement | MEDIUM | LOW | P2 |
| Two-tier privacy display | MEDIUM | MEDIUM | P2 |
| Live Basescan Merkle root link | MEDIUM | LOW | P2 |

**Priority key:**
- P1: Must have — demo is unconvincing without it
- P2: Should have — makes demo stronger, add once P1 chain is green
- P3: Nice to have — post-hackathon

---

## Competitor Feature Analysis

ZK auction and ZK identity systems at recent hackathons (ETHGlobal Bangkok 2024, Midnight ZK Identity Hackathon, zkVerify hackathons) show a consistent pattern:

| Feature | Typical ZK Demo | Palm zkKYC (ETHGlobal) | This Project |
|---------|-----------------|------------------------|--------------|
| Proof generation location | In-browser or CLI | In-browser (email DKIM) | Agent-client (Node) via MCP |
| Membership primitive | Allowlist / credential | Email DKIM + nullifier | Poseidon Merkle tree (`AgentPrivacyRegistry`) |
| Bid privacy | Not present (they do identity, not bids) | N/A | BidRange Groth16 proof |
| Spectator UI privacy indicators | Rare | Not documented | ZK VERIFIED badge, bid commitment |
| AI agent integration | None found | None found | MCP tools — unique angle |
| On-chain settlement | Varies | Uniswap v4 hook | CRE `onReport()` via KeystoneForwarder |
| Hackathon differentiator | Individual ZK claim | DKIM-based KYC | Agent autonomy + dual ZK proof types + CRE |

The AI agent using MCP tools to autonomously generate and submit ZK proofs is not found in any comparable hackathon project. This is the primary differentiator. Judges from Chainlink track will specifically evaluate how CRE integrates — the ZK proof → engine verification → CRE settlement chain is the complete value demonstration.

---

## Sources

- Palm zkKYC ETHGlobal project (Groth16 + nullifier + Uniswap v4 hook pattern): https://ethglobal.com/showcase/palm-zkkyc-f5g3b
- ZK-Auction academic paper (two-stage ZK: eligibility + bid privacy): https://dl.acm.org/doi/10.1145/3654522.3654589
- Midnight ZK Identity Hackathon (real-time bid compliance pattern): https://midnight.network/hackathon/zk-identity-hackathon
- zkVerify Hackathon evaluation criteria (technology, innovation, completion, documentation): https://zkverify.io/hackathons
- snarkjs 2025 performance benchmarks (proof generation 832-1147ms for tested circuits): https://github.com/iden3/snarkjs
- ZK Hack Berlin 2025 winning projects (TruthSeeker pattern — working proof chain beats ambitious incomplete demo): https://zkhack.dev/2025/06/26/zk-hack-berlin/
- Web3 ZK identity patterns 2026 (zkMe, Polygon ID, Mina Protocol identity primitives): https://thepermatech.com/zero-knowledge-proofs-trends-in-web3-security-2026/
- Existing codebase analysis: `/Users/zengy/workspace/auction-design/.planning/PROJECT.md`, `packages/crypto/src/proof-generator.ts`, `engine/src/handlers/actions.ts`, `engine/src/types/engine.ts`, `frontend/src/app/auctions/[id]/page.tsx`

---

*Feature research for: ZK Privacy E2E milestone — Agent-Native Auction Platform*
*Researched: 2026-03-02*
