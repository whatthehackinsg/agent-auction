# Roadmap: Agent Auction Platform

## Milestones

- ✅ **v1.0 ZK Privacy E2E** — Phases 1-6 (shipped 2026-03-04)

## Phases

<details>
<summary>✅ v1.0 ZK Privacy E2E (Phases 1-6) — SHIPPED 2026-03-04</summary>

- [x] Phase 1: ZK Foundation (3/3 plans) — completed 2026-03-02
- [x] Phase 2: MCP + Engine Wiring (4/4 plans) — completed 2026-03-02
- [x] Phase 3: Agent-Client ZK Integration (2/2 plans) — completed 2026-03-03
- [x] Phase 4: Frontend + Demo (2/2 plans) — completed 2026-03-03
- [x] Phase 5: Key Figures Dashboard (2/2 plans) — completed 2026-03-03
- [x] Phase 6: Refine Stats Card UI (1/1 plan) — completed 2026-03-04

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. ZK Foundation | v1.0 | 3/3 | Complete | 2026-03-02 |
| 2. MCP + Engine Wiring | v1.0 | 4/4 | Complete | 2026-03-02 |
| 3. Agent-Client ZK Integration | v1.0 | 2/2 | Complete | 2026-03-03 |
| 4. Frontend + Demo | v1.0 | 2/2 | Complete | 2026-03-03 |
| 5. Key Figures Dashboard | v1.0 | 2/2 | Complete | 2026-03-03 |
| 6. Refine Stats Card UI | v1.0 | 1/1 | Complete | 2026-03-04 |

### Phase 1: Fix NFT support gaps

**Goal:** Close gaps in NFT metadata visibility across engine, MCP tools, and frontend by resolving ERC-721 tokenURI at auction creation time, reading NftEscrow deposit status on-chain, and surfacing rich NFT context (image, name, description, escrow badge, marketplace links) through all layers.
**Requirements**: NFT-RESOLVE, NFT-ESCROW, NFT-ENGINE-API, NFT-MCP-DISCOVER, NFT-MCP-DETAILS, NFT-MCP-FILTER, NFT-FRONTEND-LIST, NFT-FRONTEND-DETAIL, NFT-FRONTEND-FILTER, NFT-FRONTEND-MARKETPLACE
**Depends on:** None (post-v1.0 standalone phase)
**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md — Engine: D1 migration, tokenURI resolution, NftEscrow reads, API enrichment
- [ ] 01-02-PLAN.md — MCP: Enrich discover/details tools with NFT fields and hasNft filter
- [ ] 01-03-PLAN.md — Frontend: NFT name display, filter toggle, escrow badge, OpenSea links

### Phase 2: Finish MCP server: audit tool coverage vs agent flow, implement missing tools, add tests, write agent skills documentation

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 1
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 2 to break down)
