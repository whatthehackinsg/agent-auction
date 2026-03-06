# Requirements: Agent Auction — Autonomous Agent Onboarding

**Defined:** 2026-03-05
**Core Value:** Working ZK proofs that actually verify — agents prove registry membership and bid range without revealing identity, demonstrated end-to-end.

## v1.1 Requirements

Requirements for milestone v1.1. Each maps to roadmap phases.

### Identity Verification

- [x] **IDVR-01**: `ENGINE_VERIFY_WALLET=true` is the default — engine rejects JOIN if wallet doesn't match ERC-8004 `ownerOf(agentId)`
- [x] **IDVR-02**: MCP tools (`join_auction`, `place_bid`) pre-flight check identity via `check_identity` before submitting actions — refuse if not verified
- [x] **IDVR-03**: Engine returns clear error when agentId is unregistered, wallet mismatches, or ERC-8004 lookup fails
- [x] **IDVR-04**: Edge cases handled: unregistered agentId → clear error, ownership transfer → re-verify on next JOIN, RPC failure → fail-closed (reject action)

### Participant Privacy

- [x] **PRIV-01**: Participant WebSocket identifies other agents by zkNullifier only (no agentId, no wallet broadcast to other participants)
- [x] **PRIV-02**: Agent identifies own events by matching their known nullifier (self-recognition without identity leak)
- [x] **PRIV-03**: Public WebSocket continues to mask agentId and omit wallet (no regression from v1.0 behavior)

### ZK Enforcement

- [x] **ZKRQ-01**: `join_auction` generates ZK proof by default when AGENT_STATE_FILE configured (no opt-out parameter)
- [x] **ZKRQ-02**: `place_bid` generates ZK proof by default when AGENT_STATE_FILE configured (no opt-out parameter)
- [x] **ZKRQ-03**: `check_identity` merges `readyForZkProofs` into `readyToParticipate` (ZK + identity = single readiness flag)
- [x] **ZKRQ-04**: `.env.example` marks AGENT_STATE_FILE and BASE_SEPOLIA_RPC as REQUIRED (not optional)

### MCP Tools

- [ ] **TOOL-01**: Agent can register ERC-8004 identity on-chain via `register_identity` MCP tool (calls `register(string agentURI)`, uses AGENT_PRIVATE_KEY + BASE_SEPOLIA_RPC)
- [ ] **TOOL-02**: Agent can deposit USDC bond to AuctionEscrow via `deposit_bond` MCP tool (USDC.approve → transfer → engine POST /auctions/:id/bonds with txHash)
- [ ] **TOOL-03**: Agent can withdraw settled funds from AuctionEscrow via `withdraw_funds` MCP tool (calls `withdraw(agentId)`, requires ownerOf(agentId) == agent wallet)
- [ ] **TOOL-04**: Agent can claim refund for non-winning bond via `claim_refund` MCP tool (calls `claimRefund(auctionId, agentId)`, permissionless, then agent calls withdraw)

### Skills

- [ ] **SKIL-01**: Delete 3 existing auction skills (SKILL.md, bond-management/SKILL.md, sealed-bid/SKILL.md)
- [ ] **SKIL-02**: New auction skill documents correct ERC-8004 `register(string agentURI)` ABI and mandatory ZK flow
- [ ] **SKIL-03**: New auction skill covers full autonomous per-auction flow (discover → bond → join(ZK) → bid(ZK) → monitor → withdraw/claim)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Full ZK Anonymity

- **FZKP-01**: Engine accepts JOIN/BID with only ZK proof + nullifier (no agentId/wallet)
- **FZKP-02**: Bond deposits linked to nullifiers instead of agentIds
- **FZKP-03**: Identity revealed only at CRE settlement, never to engine

### Demo & Narrative

- **DEMO-01**: Full live E2E demo on Base Sepolia (agent → proofs → bid → CRE settle)
- **DEMO-02**: CCIP Private Transactions future vision narrative

## Out of Scope

| Feature | Reason |
|---------|--------|
| On-chain ZK verification (Solidity verifier) | Off-chain snarkjs sufficient for hackathon |
| New Circom circuits | Existing RegistryMembership + BidRange sufficient |
| Sealed-bid commit-reveal | Requires new circuit, too ambitious |
| CCIP Private Transactions implementation | Future vision narrative only |
| Engine-level ZK anonymity (no agentId to engine) | Major rearchitect, deferred to v2 (FZKP-01–03) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| IDVR-01 | Phase 7 | Complete |
| IDVR-02 | Phase 7 | Complete |
| IDVR-03 | Phase 7 | Complete |
| IDVR-04 | Phase 7 | Complete |
| PRIV-01 | Phase 8 | Complete |
| PRIV-02 | Phase 8 | Complete |
| PRIV-03 | Phase 8 | Complete |
| ZKRQ-01 | Phase 9 | Complete |
| ZKRQ-02 | Phase 9 | Complete |
| ZKRQ-03 | Phase 9 | Complete |
| ZKRQ-04 | Phase 9 | Complete |
| TOOL-01 | Phase 10 | Pending |
| TOOL-02 | Phase 10 | Pending |
| TOOL-03 | Phase 10 | Pending |
| TOOL-04 | Phase 10 | Pending |
| SKIL-01 | Phase 11 | Pending |
| SKIL-02 | Phase 11 | Pending |
| SKIL-03 | Phase 11 | Pending |

**Coverage:**
- v1.1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-03-05*
*Last updated: 2026-03-05 after adding IDVR requirements*
