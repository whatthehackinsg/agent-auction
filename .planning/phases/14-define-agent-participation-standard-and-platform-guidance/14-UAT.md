---
status: complete
phase: 14-define-agent-participation-standard-and-platform-guidance
source: [14-01-SUMMARY.md, 14-02-SUMMARY.md]
started: 2026-03-07T19:44:06+08:00
updated: 2026-03-07T19:44:06+08:00
---

## Current Test

[testing complete]

## Tests

### 1. Canonical participation guide publishes the supported participation standard
expected: The repo should have one canonical guide that explicitly labels `AgentKit + CDP Server Wallet` as `Supported`, the raw-key MCP path as `Advanced`, `Agentic Wallet` as `Future`, and Base Sepolia as the only supported network.
result: pass
evidence: [docs/participation-guide.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/docs/participation-guide.md) contains the support matrix and Base Sepolia-only policy, and `rg -n "AgentKit \\+ CDP Server Wallet|Raw-private-key MCP flow|Agentic Wallet|Base Sepolia is the only supported network" docs/participation-guide.md` returned all expected hits.

### 2. Canonical guide defines the active-participant baseline, assets, entry paths, fallback, and bootstrap boundary
expected: The canonical guide should define active participation around one persistent Base Sepolia owner wallet, list the required assets and config inputs, document supported entry paths, route unsupported setups to read-only observation or the advanced bridge, and make the bootstrap-only human-help boundary explicit.
result: pass
evidence: [docs/participation-guide.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/docs/participation-guide.md) defines the persistent-owner-wallet baseline, wallet checklist, Base Sepolia ETH/USDC requirements, `register_identity` and external identity entry paths, read-only fallback, and the `bootstrap-only` / `agent-driven after setup` boundary.

### 3. Repo guidance surfaces point back to the same canonical guide
expected: The root README, docs index, and MCP README should all route operators to the same participation guide and keep the same Supported / Advanced / Future language.
result: pass
evidence: [README.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/README.md), [docs/README.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/docs/README.md), and [mcp-server/README.md](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/mcp-server/README.md) all reference the participation guide, and `rg -n "participation guide|AgentKit \\+ CDP Server Wallet|advanced bridge|Agentic Wallet" README.md docs/README.md mcp-server/README.md` returned consistent hits across those surfaces.

### 4. Public /participate page mirrors the standard without overclaiming future phases
expected: The frontend should expose a stable `/participate` route with a checklist-first guide, support matrix, wallet checklist, human/operator and agent/runtime tracks, deep links back to repo docs, and an explicit note that the adapter and external skill are not already shipped.
result: pass
evidence: [page.tsx](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/frontend/src/app/participate/page.tsx), [ParticipationGuidePage.tsx](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/frontend/src/components/participate/ParticipationGuidePage.tsx), and [site-links.ts](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/frontend/src/lib/site-links.ts) implement the static route, shared links, matrix, checklists, tracks, doc deep links, and the “this phase does not claim the adapter or an external skill/playbook already exists” boundary.

### 5. Landing surfaces route operators to the setup guide before active participation
expected: The landing page navigation and CTA section should both point operators to `/participate` with clear setup-first language.
result: pass
evidence: [LandingPage.tsx](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/frontend/src/components/landing/LandingPage.tsx) adds the shared `SETUP` entry and `[ agent_setup_guide ]` CTA, and [CTASection.tsx](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/frontend/src/components/landing/sections/CTASection.tsx) says to “read this setup guide first” before active participation.

### 6. Auction list and room pages add setup handoff links without changing spectator privacy
expected: The auctions list and room pages should link to `/participate`, stay spectator-first, and avoid introducing any new participant identity, wallet, or bid-history exposure.
result: pass
evidence: [frontend/src/app/auctions/page.tsx](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/frontend/src/app/auctions/page.tsx) and [frontend/src/app/auctions/[id]/page.tsx](/Volumes/MainSSD/HomeData/zengy/workspace/auction-design/frontend/src/app/auctions/[id]/page.tsx) add compact setup panels pointing to `/participate`, while the Phase 14 verification report confirms the existing masked-event and public-snapshot privacy guardrails remain intact.

### 7. Frontend quality gates still pass and emit the new static route
expected: The frontend should still pass lint and build, and the build output should include the static `/participate` route.
result: pass
evidence: Fresh verification on 2026-03-07 ran `cd frontend && npm run lint` and `cd frontend && npm run build`. Lint exited 0 with 4 pre-existing warnings (`no-img-element` on existing pages and one existing `react-hooks/exhaustive-deps` warning in `useAgentProfile.ts`), and the build exited 0 with `/participate` emitted as a static route.

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
