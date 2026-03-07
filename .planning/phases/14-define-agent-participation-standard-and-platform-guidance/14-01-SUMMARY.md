---
phase: 14-define-agent-participation-standard-and-platform-guidance
plan: 01
subsystem: docs
tags: [docs, participation-standard, agentkit, cdp, mcp, base-sepolia]
requires:
  - phase: 13-worker-proof-runtime-compatibility
    provides: "Stable MCP and proof-runtime behavior that the public participation standard can document accurately"
provides:
  - "Canonical Phase 14 participation guide in docs/participation-guide.md"
  - "Aligned repo, docs index, and MCP README entry points that deep-link to the same guide"
  - "Explicit Supported / Advanced / Future participation labels for Base Sepolia operators"
affects:
  - 14-02-public-participation-page
  - 15-agentkit-wallet-adapter
  - 16-external-agent-playbook
tech-stack:
  added: []
  patterns:
    - checklist-first operator guidance
    - canonical-guide-plus-pointer-summaries
    - support-matrix labels for participation paths
key-files:
  created:
    - docs/participation-guide.md
  modified:
    - README.md
    - docs/README.md
    - mcp-server/README.md
key-decisions:
  - "docs/participation-guide.md is the single canonical participation source for operators and AI runtimes in Phase 14"
  - "`AgentKit + CDP Server Wallet` is the supported target stack, the raw-key MCP path is the advanced bridge, and `Agentic Wallet` remains future work"
  - "Repo guidance surfaces summarize the policy briefly and deep-link to the canonical guide instead of restating divergent setup rules"
patterns-established:
  - "Participation docs should define one canonical guide and keep all other surfaces as concise navigational summaries"
  - "Active participation language must center on one persistent Base Sepolia owner wallet and explicit read-only fallback rules"
requirements-completed: [PART-01, PART-02, PART-03]
duration: 11min
completed: 2026-03-07
---

# Phase 14 Plan 01: Participation Standard Summary

**Checklist-first Base Sepolia participation standard with a canonical operator guide and aligned repo and MCP guidance entry points**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-07T11:01:24Z
- **Completed:** 2026-03-07T11:14:51Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Published `docs/participation-guide.md` as the single canonical Phase 14 participation standard for operators and AI runtimes.
- Defined the supported stack, active-participant wallet baseline, fallback policy, and bootstrap-only human-help boundary in a checklist-first format.
- Aligned `README.md`, `docs/README.md`, and `mcp-server/README.md` so they point to the canonical guide and use the same Supported / Advanced / Future terminology.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author the canonical participation guide with the support matrix and wallet capability checklist** - `be08add` (feat)
2. **Task 2: Align repo and MCP guidance surfaces to the canonical participation guide** - `e55d6a4` (docs)

Follow-up clarification after final verification:

- `0f3354c` (docs) - tightened the guide wording to keep the human-assistance boundary explicit in the canonical source

## Files Created/Modified

- `docs/participation-guide.md` - canonical operator-facing participation standard, support matrix, checklist, entry paths, and fallback policy
- `README.md` - top-level participation-standard pointer and active-participant baseline summary
- `docs/README.md` - docs index entry for the operator-facing participation guide
- `mcp-server/README.md` - MCP-specific participation-standard note that positions the raw-key flow as the advanced bridge

## Decisions Made

- Kept Phase 14 at the standards-and-guidance layer only, without adding adapter instructions or external playbook content.
- Treated `AgentKit + CDP Server Wallet` as the supported target stack while making the current raw-key MCP route explicitly advanced rather than default.
- Defined active participation around a single persistent Base Sepolia owner wallet that spans ownership, signing, bonding, and refund flows.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `gitnexus` reported a stale index at the start of execution, so the index was refreshed before the pre-commit scope check.
- `git add` and `git commit` required elevated execution because the repository `.git` directory resolves outside the writable sandbox path. The task scope and staged files stayed isolated throughout.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase `14-02` can mirror the canonical support matrix, wallet checklist, and fallback policy on the public `/participate` surface without inventing new rules.
- Phase `15` can implement the AgentKit-compatible adapter against an explicit active-participant baseline instead of inferred README guidance.

## Self-Check: PASSED

- Found `.planning/phases/14-define-agent-participation-standard-and-platform-guidance/14-01-SUMMARY.md`
- Found task commits `be08add`, `e55d6a4`, and `0f3354c`
