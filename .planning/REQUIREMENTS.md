# Requirements: Agent Auction — ZK Privacy E2E

**Defined:** 2026-03-02
**Core Value:** Working ZK proofs that actually verify on-chain — agents prove registry membership and bid range without revealing identity, demonstrated end-to-end on Base Sepolia.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### ZK Foundation

- [ ] **ZKFN-01**: Circuit test harness wired and passing for both RegistryMembership and BidRange circuits via `npm test`
- [x] **ZKFN-02**: Keccak/Poseidon Merkle root mismatch resolved so engine cross-check passes with real circuit proofs
- [x] **ZKFN-03**: AgentPrivacyRegistry Merkle root populated with test agent commitments on Base Sepolia
- [x] **ZKFN-04**: Public signal index constants defined and shared across proof generator, engine verifier, and MCP server

### Agent ZK Integration

- [ ] **AGZK-01**: Agent-client can generate real RegistryMembership Groth16 proof via snarkjs
- [ ] **AGZK-02**: Agent-client can generate real BidRange Groth16 proof via snarkjs
- [ ] **AGZK-03**: Agent private state persisted across sessions (secrets, nullifiers, Merkle witness)
- [ ] **AGZK-04**: BidRange constraint failures caught and translated to meaningful error messages

### MCP + Engine Wiring

- [ ] **MCPE-01**: MCP `join_auction` tool accepts and forwards ZK membership proof payload to engine
- [ ] **MCPE-02**: MCP `place_bid` tool accepts and forwards ZK bid range proof payload to engine
- [ ] **MCPE-03**: EIP-712 signer supports Poseidon nullifier path (not just keccak) for ZK-enabled joins
- [ ] **MCPE-04**: Engine verifies real ZK proofs end-to-end with `ENGINE_REQUIRE_PROOFS=true`
- [ ] **MCPE-05**: MCP server can optionally generate proofs on behalf of agents (hybrid mode — server-side fullProve with agent-provided secrets)

### Frontend Display

- [ ] **FRNT-01**: Frontend shows ZK proof verification badge on bids and joins (not just string masking)
- [ ] **FRNT-02**: Frontend shows nullifier consumed indicator for verified participants
- [ ] **FRNT-03**: Frontend includes privacy explainer panel explaining ZK guarantees to spectators

### Live Demo

- [ ] **DEMO-01**: Full E2E on Base Sepolia: agent registers → generates proofs → joins auction → bids with range proof → auction settles via CRE
- [ ] **DEMO-02**: Demo narrative includes CCIP Private Transactions as future vision for closing on-chain privacy gap (bonds, settlement calldata)

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### On-Chain Privacy

- **ONPR-01**: CCIP Private Transactions integration for encrypted bond deposits
- **ONPR-02**: Encrypted CRE settlement reports (on-chain calldata privacy)
- **ONPR-03**: On-chain Solidity Groth16 verifier contract

### Advanced Protocols

- **ADVP-01**: Sealed-bid commit-reveal auction format with dedicated circuit
- **ADVP-02**: In-browser ZK proof generation for web-based agents
- **ADVP-03**: Multi-round ZK proof aggregation for batch auctions

## Out of Scope

| Feature | Reason |
|---------|--------|
| On-chain Solidity ZK verifier | Off-chain snarkjs verification sufficient for hackathon; adds contract complexity without demo value |
| In-browser proof generation | snarkjs fullProve requires .wasm/.zkey file access; browser bundling adds significant complexity |
| Sealed-bid commit-reveal | Requires new circuit + protocol changes; too ambitious for this milestone |
| New circuit development | Existing RegistryMembership + BidRange circuits are sufficient |
| Mobile/responsive frontend | Web-first spectator UI is sufficient for hackathon demo |
| CCIP Private Transactions implementation | Mentioned as future vision in demo narrative only; actual integration deferred |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ZKFN-01 | Phase 1 | Pending |
| ZKFN-02 | Phase 1 | Complete |
| ZKFN-03 | Phase 1 | Complete |
| ZKFN-04 | Phase 1 | Complete |
| AGZK-01 | Phase 3 | Pending |
| AGZK-02 | Phase 3 | Pending |
| AGZK-03 | Phase 3 | Pending |
| AGZK-04 | Phase 3 | Pending |
| MCPE-01 | Phase 2 | Pending |
| MCPE-02 | Phase 2 | Pending |
| MCPE-03 | Phase 2 | Pending |
| MCPE-04 | Phase 2 | Pending |
| MCPE-05 | Phase 2 | Pending |
| FRNT-01 | Phase 4 | Pending |
| FRNT-02 | Phase 4 | Pending |
| FRNT-03 | Phase 4 | Pending |
| DEMO-01 | Phase 4 | Pending |
| DEMO-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-03-02*
*Last updated: 2026-03-02 — ZKFN-03 marked complete after 01-03-PLAN.md execution (all Phase 1 requirements now complete)*
