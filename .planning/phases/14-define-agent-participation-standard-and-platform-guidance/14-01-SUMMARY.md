---
phase: 14-define-agent-participation-standard-and-platform-guidance
plan: 01
subsystem: docs+mcp-server
tags: [docs, standards, agentkit, mcp, onboarding]
requires:
  - phase: 13-redeploy-agentprivacyregistry-and-repoint-base-sepolia-config
    provides: verified active auction lifecycle and stable Worker-safe proof path
provides:
  - canonical participation standard at `docs/participation-guide.md`
  - consistent support labels and fallback policy across repo guidance surfaces
  - explicit active-participant wallet and bootstrap-help boundary
affects: [phase-14-02, docs, mcp-server, frontend]
tech-stack:
  added: []
  patterns:
    - checklist-first operator guidance that is readable by both humans and AI agents
    - one canonical participation-standard doc with repo surfaces linking to it instead of restating divergent rules
key-files:
  created:
    - docs/participation-guide.md
  modified:
    - README.md
    - docs/README.md
    - mcp-server/README.md
key-decisions:
  - "`AgentKit + CDP Server Wallet` is the supported target stack, the raw-key MCP path is the advanced bridge, and `Agentic Wallet` stays future/not-yet-verified."
  - "Active participation requires one persistent Base Sepolia owner wallet that remains the ERC-8004 owner, action signer, and bond/refund wallet."
  - "Human help is bootstrap-only; ongoing participation must be agent-driven or fall back to read-only observation / the advanced bridge."
patterns-established:
  - "The new canonical operator guidance lives in docs first, then the public frontend guide mirrors it in Wave 2."
requirements-completed: [PART-01, PART-02, PART-03]
duration: 20min
completed: 2026-03-07
---

# Phase 14 Plan 01: Participation Standard and Repo Guidance Summary

**The canonical participation standard now exists in one place, and the repo’s main guidance surfaces all point to it consistently**

## Performance

- **Duration:** ~20m
- **Completed:** 2026-03-07T19:14:00+08:00
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `docs/participation-guide.md` as the canonical Phase 14 participation-standard document with the `Supported / Advanced / Future` matrix, the active-bidder baseline, the wallet capability checklist, supported entry paths, fallback policy, and the bootstrap-only human-help boundary.
- Aligned the root repo README, docs index, and MCP README so they all point to the same canonical guide instead of teaching different setup rules in parallel.
- Made the repo guidance explicit that Base Sepolia is the only supported network for this standard and that unsupported stacks should observe only or use the advanced bridge.

## Task Commits

- `be08add` — `feat(14-01): add canonical participation guide`
- `e55d6a4` — `docs(14-01): align repo guidance to participation standard`
- `0f3354c` — `docs(14-01): tighten guide boundary wording`

## Files Created/Modified

- `docs/participation-guide.md` - new canonical participation-standard guide for human operators and agent runtimes
- `README.md` - adds the top-level participation-standard entry point and baseline summary
- `docs/README.md` - promotes the participation guide as a primary operator-facing docs entry point
- `mcp-server/README.md` - clarifies the raw-key MCP route as the advanced bridge and points to the canonical guide

## Decisions Made

- Kept the support labels compact and explicit: `Supported`, `Advanced`, and `Future`.
- Kept the standard at the requirement/guidance layer only; no AgentKit adapter implementation or external skill material is claimed in this wave.
- Treated minimal human assistance as a hard boundary in the published guidance, not just an internal planning note.

## Deviations from Plan

- The final wording pass removed explicit “playbook” language from the public guide so the published output stays within the Phase 14 scope checks while still pointing forward to later participation materials.

## Issues Encountered

- The first pass of the new guide used Phase 16 “playbook” terminology directly, which tripped the Phase 14 scope-preservation grep check. The follow-up wording cleanup keeps the same boundary meaning without leaking that later-phase label into the published guide.

## User Setup Required

None.

## Next Phase Readiness

- Wave 1 is complete.
- Wave 2 can now build the public `/participate` page directly from `docs/participation-guide.md` instead of inventing a second version of the standard.

## Self-Check: PASSED

- `cd /Volumes/MainSSD/HomeData/zengy/workspace/auction-design && rg -n "AgentKit \\+ CDP Server Wallet|Supported|Advanced|Future|persistent Base Sepolia owner wallet|Base Sepolia ETH|Base Sepolia USDC|register_identity|AGENT_STATE_FILE|read-only|Agentic Wallet" docs/participation-guide.md`
- `cd /Volumes/MainSSD/HomeData/zengy/workspace/auction-design && rg -n "bootstrap-only|agent-driven after setup|read-only observation|advanced bridge" docs/participation-guide.md`
- `cd /Volumes/MainSSD/HomeData/zengy/workspace/auction-design && rg -n "participation guide|AgentKit \\+ CDP Server Wallet|advanced bridge|persistent owner wallet|Base Sepolia" README.md docs/README.md mcp-server/README.md`
- `cd /Volumes/MainSSD/HomeData/zengy/workspace/auction-design && if rg -n "install AgentKit|external skill|playbook" README.md docs/README.md mcp-server/README.md docs/participation-guide.md; then exit 1; else echo "Phase 14 scope preserved"; fi`
