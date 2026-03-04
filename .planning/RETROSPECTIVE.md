# Retrospective

## Milestone: v1.0 — ZK Privacy E2E

**Shipped:** 2026-03-04
**Phases:** 6 | **Plans:** 14 | **Timeline:** 3 days

### What Was Built
- ZK circuit test harness for RegistryMembership + BidRange Groth16 circuits
- MCP tool ZK proof wiring (join_auction, place_bid with proof payloads + server-side generation)
- Agent-client real Groth16 proof generation with nullifier persistence and error handling
- Frontend ZK badges, privacy explainer panels, agent profile circuit specs
- Platform stats dashboard with animated count-up cards and SWR polling
- CSS shimmer/glow stat card effects with tailored 3-card auctions variant

### What Worked
- Strict phase dependency ordering (circuits → engine → agent-client → frontend) prevented integration issues
- Named signal constants (MEMBERSHIP_SIGNALS, BID_RANGE_SIGNALS) shared across 4 consumers with zero magic numbers
- Proof fixtures committed as JSON — fast test execution without snarkjs fullProve at test time
- Backward-compatible proof paths (keccak256 fallback for non-ZK joins) kept existing flows working

### What Was Inefficient
- SUMMARY frontmatter `requirements_completed` not populated for phases 3-4 — caused "partial" status in audit cross-reference
- DEMO-01/DEMO-02 marked complete in REQUIREMENTS.md before work was done — stale tracker state
- Phase 6 skipped VERIFICATION.md — should have been created even for polish phases

### Patterns Established
- `proofPayload?: { proof: unknown; publicSignals: string[] }` as standard ZK proof parameter shape
- Attach-after-sign pattern for BID proofs (EIP-712 type has no nullifier field)
- `return null` for graceful component degradation on API errors
- USDC amounts as strings across API for BigInt compatibility

### Key Lessons
- Cross-check removal (ZKFN-02) was the right call — Groth16 verification IS the security, redundant root checks caused bugs
- Agent state files must be gitignored (contain secrets) with README explaining regeneration
- Phase verification should always happen, even for "polish" phases with no formal requirements

## Cross-Milestone Trends

| Metric | v1.0 |
|--------|------|
| Phases | 6 |
| Plans | 14 |
| Days | 3 |
| Commits | 66 |
| Lines changed | +15,175 / -546 |
| Requirements satisfied | 16/18 (89%) |
| Integration score | 18/18 |
| E2E flows | 4/4 |
