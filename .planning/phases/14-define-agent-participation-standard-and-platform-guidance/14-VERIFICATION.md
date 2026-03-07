---
status: complete
phase: 14-define-agent-participation-standard-and-platform-guidance
source:
  - 14-01-PLAN.md
  - 14-02-PLAN.md
  - 14-01-SUMMARY.md
  - 14-02-SUMMARY.md
  - ../../REQUIREMENTS.md
started: 2026-03-07T11:33:26Z
updated: 2026-03-07T11:33:26Z
---

## Current Test

[testing complete]

## Tests

### 1. Phase 14 plan frontmatter maps cleanly to the Phase 14 requirements
expected: `14-01-PLAN.md` should target `PART-01`, `PART-02`, and `PART-03`; `14-02-PLAN.md` should target `PART-03` and `PART-04`; those IDs should exist in `REQUIREMENTS.md` and describe the same scope.
result: pass
evidence: [14-01-PLAN.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/.planning/phases/14-define-agent-participation-standard-and-platform-guidance/14-01-PLAN.md#L1) declares `requirements: [PART-01, PART-02, PART-03]`, [14-02-PLAN.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/.planning/phases/14-define-agent-participation-standard-and-platform-guidance/14-02-PLAN.md#L1) declares `requirements: [PART-03, PART-04]`, and [REQUIREMENTS.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/.planning/REQUIREMENTS.md#L43) defines `PART-01` through `PART-04` with matching participation-standard and public-guide scope.

### 2. The canonical participation guide publishes the explicit Supported / Advanced / Future stack policy
expected: `docs/participation-guide.md` should be the canonical source and must explicitly label `AgentKit + CDP Server Wallet` as `Supported`, the raw-key MCP flow as `Advanced`, `Agentic Wallet` as `Future`, and Base Sepolia as the only supported network.
result: pass
evidence: [participation-guide.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/docs/participation-guide.md#L23) contains the support matrix, marks Base Sepolia as the only supported network, and calls EIP-4337 optional background rather than a participation requirement.

### 3. The minimum active-participant baseline, capability checklist, assets, entry paths, fallback, and bootstrap-only boundary are explicit
expected: The canonical guide should define active participation around one persistent Base Sepolia owner wallet, spell out the capability and asset checklist, list supported entry paths, route non-compliant operators to read-only observation or the advanced bridge, and make the human-help boundary bootstrap-only.
result: pass
evidence: [participation-guide.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/docs/participation-guide.md#L35) defines the active-bidder baseline, [participation-guide.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/docs/participation-guide.md#L50) provides the wallet checklist, [participation-guide.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/docs/participation-guide.md#L62) lists assets and config inputs, [participation-guide.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/docs/participation-guide.md#L80) lists both entry paths, [participation-guide.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/docs/participation-guide.md#L98) defines fallback behavior, and [participation-guide.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/docs/participation-guide.md#L109) makes the bootstrap-only / agent-driven boundary explicit.

### 4. Repo guidance surfaces point to one canonical guide and stay aligned on the participation standard
expected: `README.md`, `docs/README.md`, and `mcp-server/README.md` should all route readers to the same canonical participation guide, and the repo-facing summaries should keep the support labels, owner-wallet baseline, and fallback policy consistent.
result: pass
evidence: [README.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/README.md#L228) points to the canonical guide and summarizes the standard, [docs/README.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/docs/README.md#L5) elevates the guide into the docs entry flow and implementation index, and [mcp-server/README.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/mcp-server/README.md#L16) mirrors the Supported / Advanced / Future policy while routing detailed guidance back to the canonical doc instead of diverging.

### 5. A public `/participate` handoff page exists and mirrors the phase standard without replacing repo docs
expected: The frontend should expose a stable `/participate` route, keep the page checklist-first, include the support matrix and wallet checklist, split human/operator and agent/runtime tracks, deep-link back to repo docs, and state that the adapter / external skill are not yet shipped.
result: pass
evidence: [site-links.ts](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/frontend/src/lib/site-links.ts#L1) centralizes `PARTICIPATION_GUIDE_PATH = "/participate"`, [page.tsx](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/frontend/src/app/participate/page.tsx#L1) exposes the route, and [ParticipationGuidePage.tsx](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/frontend/src/components/participate/ParticipationGuidePage.tsx#L11) includes the matrix, checklist, deep links, handoff block, bootstrap-only boundary, human/operator and agent/runtime tracks, and the explicit note that Phase 14 does not claim the adapter or external skill/playbook already exists.

### 6. Landing and auction surfaces all link to the same stable setup guide
expected: The landing page, CTA section, auctions list page, and auction room page should link to `/participate` through the shared constant and use clear agent-setup copy.
result: pass
evidence: [LandingPage.tsx](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/frontend/src/components/landing/LandingPage.tsx#L18) adds the shared `SETUP` menu item and CTA button, [CTASection.tsx](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/frontend/src/components/landing/sections/CTASection.tsx#L16) tells operators to “read this setup guide first” and links to `/participate`, [auctions/page.tsx](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/frontend/src/app/auctions/page.tsx#L49) adds a spectator-safe setup panel, and [auction room page](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/frontend/src/app/auctions/[id]/page.tsx#L74) adds the room-level setup handoff.

### 7. Spectator/privacy guardrails remain intact on auction pages
expected: Phase 14 link additions must not expose live participant identities, wallets, or per-agent bid history on the spectator auction pages.
result: pass
evidence: [auction room page](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/frontend/src/app/auctions/[id]/page.tsx#L74) repeats the spectator-safe contract, [auction room page](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/frontend/src/app/auctions/[id]/page.tsx#L190) masks event identities in the room feed, [useAuctionRoom.ts](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/frontend/src/hooks/useAuctionRoom.ts#L54) strips wallets and masks agent IDs client-side, [auction-room.ts](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/engine/src/auction-room.ts#L608) masks `highestBidder` for public snapshots, and [auction-room.ts](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/engine/src/auction-room.ts#L1298) keeps participant/public WebSocket tiers privacy-preserving by omitting raw wallet exposure and masking public agent identities.

### 8. Phase 14 stayed in scope and did not leak AgentKit adapter or external skill/install implementation
expected: Phase 14 surfaces may name Phase 15 and Phase 16 boundaries, but they must not add AgentKit adapter implementation steps, package install flow, or a new external skill/install process.
result: pass
evidence: [participation-guide.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/docs/participation-guide.md#L121) explicitly limits the phase to standard-and-guidance scope, [ParticipationGuidePage.tsx](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/frontend/src/components/participate/ParticipationGuidePage.tsx#L157) says the adapter and external skill/playbook do not already exist, and a targeted grep over the Phase 14 docs/frontend surfaces found no `install AgentKit`, `@coinbase/agentkit`, `agentkit wallet adapter`, `skill install`, or `install flow` instructions.

### 9. Fresh frontend verification still passes with the new public route in place
expected: The Phase 14 frontend surfaces should continue to satisfy the module quality gate, and the production build should include the `/participate` route.
result: pass
evidence: Fresh verification ran `cd frontend && npm run lint` and `cd frontend && npm run build`. Lint exited 0 with 4 warnings and no errors (three existing `@next/next/no-img-element` warnings plus one existing `react-hooks/exhaustive-deps` warning in `useAgentProfile.ts`), and the build exited 0 and emitted the static `/participate` route alongside `/` and `/auctions`.

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
