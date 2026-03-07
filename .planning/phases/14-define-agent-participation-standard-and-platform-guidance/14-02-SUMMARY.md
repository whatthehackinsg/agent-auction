---
phase: 14-define-agent-participation-standard-and-platform-guidance
plan: 02
subsystem: ui
tags: [nextjs, react, tailwind, ui, participation-guide, spectator-safety]
requires:
  - phase: 14-01
    provides: "Canonical participation guide language, support matrix, and fallback policy reused by the public frontend handoff surface"
provides:
  - "Public `/participate` setup guide route for operators and agent runtimes"
  - "Shared frontend link constants for the stable handoff URL and canonical repo docs"
  - "Landing and auction-surface setup CTAs that route operators to the same guide without changing spectator privacy"
affects:
  - 15-agentkit-wallet-adapter
  - 16-external-agent-playbook
  - spectator-ui
tech-stack:
  added: []
  patterns:
    - shared-site-link-constants
    - static-checklist-first-handoff-pages
    - spectator-safe-setup-ctas
key-files:
  created:
    - frontend/src/lib/site-links.ts
    - frontend/src/app/participate/page.tsx
    - frontend/src/components/participate/ParticipationGuidePage.tsx
  modified:
    - frontend/src/components/landing/LandingPage.tsx
    - frontend/src/components/landing/sections/CTASection.tsx
    - frontend/src/app/auctions/page.tsx
    - frontend/src/app/auctions/[id]/page.tsx
key-decisions:
  - "The stable public handoff URL is the static `/participate` route, with all frontend surfaces importing the same shared constant instead of scattering links."
  - "The public guide mirrors `docs/participation-guide.md` with a checklist-first Supported / Advanced / Future matrix and deep links to repo docs rather than duplicating every implementation detail."
  - "Auction entry points may promote setup guidance, but they must stay spectator-first and avoid exposing identities, wallets, or per-agent bid history."
patterns-established:
  - "Frontend guidance surfaces should point to one canonical setup route backed by shared site-link constants."
  - "Operator setup CTAs on live auction views should use compact helper panels that preserve masked, read-only scoreboard behavior."
requirements-completed: [PART-03, PART-04]
duration: 9min
completed: 2026-03-07
---

# Phase 14 Plan 02: Public Participation Handoff Summary

**Static `/participate` operator handoff page with checklist-first participation guidance and setup CTAs across landing and auction surfaces**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-07T11:16:53Z
- **Completed:** 2026-03-07T11:25:44Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Published a public `/participate` route that acts as the stable setup-guide handoff page for humans and agent runtimes.
- Added shared frontend link constants for the public route plus canonical repo documentation so the handoff path is centralized.
- Linked the landing page, CTA section, auction list, and auction room to the same setup guide while keeping auction surfaces spectator-safe and privacy-preserving.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the public `/participate` setup guide page with shared guide-link constants** - `741d588` (feat)
2. **Task 2: Add prominent setup-guide links to the landing and auction surfaces** - `c0f3ad2` (feat)

## Files Created/Modified

- `frontend/src/lib/site-links.ts` - shared constants for the `/participate` route and the canonical repo documentation links.
- `frontend/src/app/participate/page.tsx` - lightweight route entry point for the public participation guide.
- `frontend/src/components/participate/ParticipationGuidePage.tsx` - static checklist-first handoff UI with support matrix, capability checklists, track split, handoff boundary, and deep links.
- `frontend/src/components/landing/LandingPage.tsx` - landing-header setup guide entry using the shared route constant.
- `frontend/src/components/landing/sections/CTASection.tsx` - promoted `[ agent_setup_guide ]` CTA and “read this setup guide first” copy.
- `frontend/src/app/auctions/page.tsx` - compact pre-participation setup banner that stays spectator-first.
- `frontend/src/app/auctions/[id]/page.tsx` - compact room-level setup handoff panel that preserves the masked live-room model.

## Decisions Made

- Kept `/participate` static and checklist-first, with no wallet connectors, live engine fetches, or onboarding automation in this phase.
- Reused the existing doodle/pixel UI language via `DoodleBackground`, `PixelPanel`, `PixelCard`, and `PixelButton` rather than introducing a second design system.
- Added setup links to auction surfaces as helper panels and CTA buttons instead of changing any room data, identity masking, or scoreboard visibility rules.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npm run lint` initially failed after the auction-list setup banner was added because `frontend/src/app/auctions/page.tsx` was missing a `PixelButton` import. The import was added immediately, then lint and build were rerun successfully.
- `git add` and `git commit` required elevated execution because the repository `.git` directory resolves outside the writable sandbox path. Staging stayed limited to the task files for each atomic commit.
- Frontend lint still reports pre-existing warnings for existing `<img>` usage and one `useMemo` dependency in `useAgentProfile.ts`; there were no lint errors after the fix, and `npm run build` completed successfully.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase `15` can implement the AgentKit-compatible wallet adapter against a live public handoff URL that already explains the supported stack, fallback rules, and runtime boundary.
- Phase `16` can reference `/participate` as the public starting point while publishing the external skill/playbook materials.

## Self-Check: PASSED

- Found `.planning/phases/14-define-agent-participation-standard-and-platform-guidance/14-02-SUMMARY.md`
- Found task commits `741d588` and `c0f3ad2`
