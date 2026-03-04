---
phase: 04-frontend-demo
plan: 02
subsystem: frontend
tags: [zk, badges, ui, activity-feed, explainer-panel]
dependency_graph:
  requires: [04-01]
  provides: [ZK badge display, nullifier tags, zk.privacy explainer, zk.membership circuit specs]
  affects: [frontend/src/app/auctions/[id]/page.tsx, frontend/src/app/agents/[agentId]/page.tsx]
tech_stack:
  added: []
  patterns: [Badge variant=warn for gold ZK identity, PixelPanel accent=gold for crypto context panels, truncateHex for hash display]
key_files:
  created: []
  modified:
    - frontend/src/app/auctions/[id]/page.tsx
    - frontend/src/app/agents/[agentId]/page.tsx
decisions:
  - Gold Badge variant=warn is the visual identity for all ZK-verified events
  - nullifier tag rendered as separate element from badge (two distinct crypto evidences per CONTEXT.md)
  - bidCommitment !== '0' guard prevents sentinel value from rendering
  - Non-ZK events render with no extra labels (no UNVERIFIED clutter)
  - Agent profile zk.membership shows static circuit specs not per-agent live data (D1 lacks ZK columns)
  - DEMO-01 and DEMO-02 deferred (not implemented) per user decision
metrics:
  duration: ~8 min
  completed: "2026-03-03"
  tasks_completed: 2
  files_modified: 2
---

# Phase 4 Plan 2: ZK Visual Display — Activity Feed Badges and Explainer Panels

Gold Groth16 proof badges on JOIN/BID events in the activity feed, plus static ZK explainer panels in auction room and agent profile pages.

## What Was Built

### Task 1: Auction Room ZK Badges and Explainer Panel

Three edits to `frontend/src/app/auctions/[id]/page.tsx`:

1. **Badge import added** — `import { Badge } from '@/components/ui/Badge'`

2. **ZK evidence row in activity feed** — After the event description `<p>`, a conditional row renders only when ZK proof data is present:
   - `Badge variant="warn"` shows "ZK PROVEN" (JOIN events) or "ZK VERIFIED" (BID events) in gold/amber
   - Separate nullifier tag: `nullifier: 0xab12...f9c3` (truncated via truncateHex)
   - Separate commit tag: `commit: 0xab12...f9c3` (BID events with non-zero bidCommitment)
   - Guard: `e.bidCommitment && e.bidCommitment !== '0'` prevents sentinel display
   - Events without ZK fields render normally — no UNVERIFIED label

3. **`zk.privacy` PixelPanel** added in right column after `auction.stats`:
   - Gold accent (`accent="gold"`, `headerLabel="zk.privacy"`)
   - Glossary: Groth16, RegistryMembership, BidRange, Poseidon, nullifier — each with one-line plain-language annotation
   - Always visible (not collapsible) — judges see it immediately

### Task 2: Agent Profile ZK Membership Panel

One edit to `frontend/src/app/agents/[agentId]/page.tsx`:

- Replaced `<Badge variant="default">UNVERIFIED</Badge>` with `<Badge variant="warn">ZK ENABLED</Badge>`
- Added `Groth16 · BN254` inline identifier next to badge
- Added circuit specifications: RegistryMembership (~12K constraints), BidRange (~5K constraints), Poseidon
- Added architecture note: "ZK proofs verified off-chain via snarkjs · on-chain settlement via CRE"
- Removed all placeholder comments awaiting integration

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Items

- **DEMO-01**: Full E2E Base Sepolia live run — deferred per user decision, not implemented
- **DEMO-02**: CCIP narrative — deferred per user decision, not implemented

## Verification

- `npx tsc --noEmit` passes with zero errors after both tasks
- Badge import correctly added; variant="warn" used for all ZK badges
- ZK evidence row conditional on `e.zkNullifier || (e.bidCommitment && e.bidCommitment !== '0')`
- bidCommitment sentinel guard: `e.bidCommitment !== '0'`
- zk.privacy PixelPanel positioned after auction.stats in right column
- Agent profile zk.membership shows gold ZK ENABLED badge, circuit specs, no placeholder text

## Commits

- `4fe86f3` feat(04-02): inject ZK badges, nullifier tags, and explainer panel into auction room
- `b0f3ae3` feat(04-02): replace agent profile zk.membership placeholder with circuit specifications

## Self-Check: PASSED

Files verified:
- frontend/src/app/auctions/[id]/page.tsx — modified, Badge import + ZK row + zk.privacy panel
- frontend/src/app/agents/[agentId]/page.tsx — modified, zk.membership panel updated

Commits verified: 4fe86f3, b0f3ae3 present in git log
