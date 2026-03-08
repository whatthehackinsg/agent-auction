# Task Agent Auction Rebrand — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebrand the NFT auction frontend into a Task Agent Auction platform with a Task Board landing page, task metadata display, and consistent "task" language — zero backend changes.

**Architecture:** Frontend-only changes across 3 layers: (1) new Task Board page replacing homepage, (2) auction room item panel rewritten as Task Brief, (3) text/label rebrand across all pages. Existing hooks, API, WebSocket, and 3D scene remain untouched.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, existing PixelPanel/PixelCard components, existing useAuctions/useAuctionDetail hooks.

---

### Task 1: Add Task Fields to AuctionSummary Type

**Files:**
- Modify: `frontend/src/hooks/useAuctions.ts:18-24`

**Step 1: Add optional task fields to AuctionSummary interface**

In `frontend/src/hooks/useAuctions.ts`, add these fields after the existing `nft_*` fields:

```typescript
  // Task metadata (reuses NFT fields for backward compat, plus display aliases)
  task_category?: string | null
  task_deadline?: string | null
  task_bounty?: string | null
```

**Step 2: Verify build passes**

Run: `cd frontend && npm run build`
Expected: No errors (fields are optional, nothing uses them yet)

**Step 3: Commit**

```bash
git add frontend/src/hooks/useAuctions.ts
git commit -m "feat(frontend): add task metadata fields to AuctionSummary type"
```

---

### Task 2: Create Task Board Landing Page

**Files:**
- Create: `frontend/src/components/task-board/TaskBoard.tsx`
- Modify: `frontend/src/app/page.tsx`

**Step 1: Create TaskBoard component**

Create `frontend/src/components/task-board/TaskBoard.tsx`:

```tsx
'use client'

import { useAuctions } from '@/hooks/useAuctions'
import { PixelCard } from '@/components/ui/PixelCard'
import Link from 'next/link'

const STATUS_LABELS: Record<number, string> = {
  0: 'PENDING',
  1: 'OPEN',
  2: 'CLOSED',
  3: 'SETTLED',
  4: 'CANCELLED',
}

const STATUS_COLORS: Record<number, string> = {
  0: 'text-[#9B9BB8]',
  1: 'text-[#6EE7B7]',
  2: 'text-[#F5C46E]',
  3: 'text-[#A78BFA]',
  4: 'text-[#f87171]',
}

/* Map NFT metadata to task display. When the engine stores task info in
   nft_name / nft_description / title / description, we surface it here. */
function taskTitle(a: { title?: string | null; nft_name?: string | null; auction_id: string }): string {
  return a.title || a.nft_name || `Task ${a.auction_id.slice(0, 8)}`
}

function taskDescription(a: { description?: string | null; nft_description?: string | null }): string {
  return a.description || a.nft_description || 'No description provided'
}

function formatUSDC(raw: string): string {
  const n = Number(raw) / 1e6
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function timeRemaining(deadline: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = deadline - now
  if (diff <= 0) return 'Ended'
  if (diff < 60) return `${diff}s left`
  if (diff < 3600) return `${Math.floor(diff / 60)}m left`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h left`
  return `${Math.floor(diff / 86400)}d left`
}

export function TaskBoard() {
  const { auctions, isLoading, error } = useAuctions()

  return (
    <div className="min-h-screen bg-[#04050a] px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mx-auto max-w-6xl text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight text-[#EEEEF5] sm:text-5xl">
          TASK <span className="text-[#6EE7B7]">AUCTION</span> BOARD
        </h1>
        <p className="mt-4 text-lg text-[#9B9BB8] max-w-2xl mx-auto">
          AI agents compete for tasks with sealed bids, zero-knowledge proofs, and trustless on-chain settlement.
        </p>
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <p className="text-center text-[#9B9BB8]">Loading tasks…</p>
      )}
      {error && (
        <p className="text-center text-[#f87171]">Failed to load tasks.</p>
      )}

      {/* Task Grid */}
      {auctions && auctions.length > 0 ? (
        <div className="mx-auto max-w-6xl grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {auctions.map((a) => (
            <Link key={a.auction_id} href={`/auctions/${a.auction_id}`} className="block group">
              <PixelCard title={taskTitle(a)}>
                <div className="space-y-3">
                  {/* Status + Time */}
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-mono font-bold ${STATUS_COLORS[a.status] ?? 'text-[#9B9BB8]'}`}>
                      {STATUS_LABELS[a.status] ?? 'UNKNOWN'}
                    </span>
                    {a.deadline > 0 && (
                      <span className="text-xs text-[#5E5E7A] font-mono">
                        {timeRemaining(a.deadline)}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-sm text-[#9B9BB8] line-clamp-2">
                    {taskDescription(a)}
                  </p>

                  {/* Stats Row */}
                  <div className="flex items-center justify-between border-t border-[#28283e] pt-3">
                    <div>
                      <span className="text-xs text-[#5E5E7A] block">Reserve</span>
                      <span className="text-sm font-mono text-[#F5C46E]">
                        {formatUSDC(a.reserve_price)} USDC
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-[#5E5E7A] block">Bond</span>
                      <span className="text-sm font-mono text-[#EEEEF5]">
                        {formatUSDC(a.deposit_amount)} USDC
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-[#5E5E7A] block">Agents</span>
                      <span className="text-sm font-mono text-[#A78BFA]">
                        {a.participant_count ?? 0}
                      </span>
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="text-center pt-2">
                    <span className="text-xs font-mono text-[#6EE7B7] group-hover:text-[#EEEEF5] transition-colors">
                      [ ENTER AUCTION → ]
                    </span>
                  </div>
                </div>
              </PixelCard>
            </Link>
          ))}
        </div>
      ) : (
        !isLoading && (
          <div className="text-center py-16">
            <p className="text-[#5E5E7A] text-lg">No tasks available right now.</p>
            <Link href="/auctions/create" className="mt-4 inline-block text-[#6EE7B7] hover:underline text-sm font-mono">
              [ CREATE A TASK AUCTION ]
            </Link>
          </div>
        )
      )}
    </div>
  )
}
```

**Step 2: Replace homepage to render TaskBoard**

Replace `frontend/src/app/page.tsx` content with:

```tsx
import { TaskBoard } from '@/components/task-board/TaskBoard'

export default function Home() {
  return <TaskBoard />
}
```

**Step 3: Verify build**

Run: `cd frontend && npm run build`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/components/task-board/TaskBoard.tsx frontend/src/app/page.tsx
git commit -m "feat(frontend): add Task Board landing page replacing homepage"
```

---

### Task 3: Replace NFT Item Panel with Task Brief in Auction Room

**Files:**
- Modify: `frontend/src/app/auctions/[id]/page.tsx:120-193`

**Step 1: Replace the Item Details panel**

In `frontend/src/app/auctions/[id]/page.tsx`, find the section starting around line 120 that displays NFT image, nft_name, nft_description, explorer links, OpenSea link, and escrow badge. Replace the entire `{/* ── Item Details */}` panel (approximately lines 120–193) with a Task Brief panel:

Replace:
```tsx
        {/* ── Item Details ── */}
```
and everything in that PixelPanel (the one with `headerLabel="item.details"`) through its closing `</PixelPanel>`, with:

```tsx
        {/* ── Task Brief ── */}
        <PixelPanel accent="gold" headerLabel="task.brief">
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-[#EEEEF5]">
              {detail?.auction.title || detail?.auction.nft_name || 'Untitled Task'}
            </h3>
            <p className="text-sm text-[#9B9BB8]">
              {detail?.auction.description || detail?.auction.nft_description || 'No description available.'}
            </p>
            {detail?.auction.reserve_price && (
              <div className="flex items-center justify-between border-t border-[#28283e] pt-3">
                <div>
                  <span className="text-xs text-[#5E5E7A] block">Reserve Price</span>
                  <span className="text-sm font-mono text-[#F5C46E]">
                    {(Number(detail.auction.reserve_price) / 1e6).toLocaleString()} USDC
                  </span>
                </div>
                {detail.auction.deposit_amount && (
                  <div>
                    <span className="text-xs text-[#5E5E7A] block">Required Bond</span>
                    <span className="text-sm font-mono text-[#EEEEF5]">
                      {(Number(detail.auction.deposit_amount) / 1e6).toLocaleString()} USDC
                    </span>
                  </div>
                )}
              </div>
            )}
            {detail?.nftEscrowState && (
              <span className="inline-block rounded border border-[#6EE7B7]/30 bg-[#6EE7B7]/10 px-2 py-0.5 text-xs font-mono text-[#6EE7B7]">
                TASK POSTED
              </span>
            )}
          </div>
        </PixelPanel>
```

**Step 2: Remove unused NFT imports**

At the top of the same file, remove the imports for `nftExplorerUrl` and `nftMarketplaceUrl` from `@/lib/format` (line ~14). If the import line becomes empty, remove it entirely.

**Step 3: Verify build**

Run: `cd frontend && npm run build`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/app/auctions/[id]/page.tsx
git commit -m "feat(frontend): replace NFT item panel with Task Brief in auction room"
```

---

### Task 4: Rebrand Auctions List Page

**Files:**
- Modify: `frontend/src/app/auctions/page.tsx`

**Step 1: Remove NFT filter and rebrand labels**

In `frontend/src/app/auctions/page.tsx`:

1. Remove the `nftFilter` state variable and its filter logic (lines ~19-34)
2. Remove the NFT filter buttons section (lines ~66-79)
3. Change the page title from any NFT-referencing text to task-oriented text
4. Change the NFT badge on cards (line ~140-143) to show task category instead
5. Replace `nft_name` display (line ~148-150) with task title
6. Replace `nft_image_url` references with a placeholder or remove
7. Update any empty state text to reference tasks

**Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/app/auctions/page.tsx
git commit -m "feat(frontend): rebrand auctions list page from NFT to task"
```

---

### Task 5: Update Navigation Labels

**Files:**
- Modify: `frontend/src/components/auction/AuctionShell.tsx:14-18`
- Modify: `frontend/src/app/layout.tsx`

**Step 1: Update AuctionShell menu items**

In `frontend/src/components/auction/AuctionShell.tsx`, update the menu items array:

```typescript
// Change from:
{ label: 'HOME', href: '/' },
{ label: 'AUCTIONS', href: '/auctions' },
{ label: 'CREATE', href: '/auctions/create' },

// Change to:
{ label: 'TASK BOARD', href: '/' },
{ label: 'TASKS', href: '/auctions' },
{ label: 'POST TASK', href: '/auctions/create' },
```

**Step 2: Update layout metadata**

In `frontend/src/app/layout.tsx`, update the title and description:

```typescript
// Change title to something like:
title: "AGENT_TASK_AUCTION"
// Change description to:
description: "AI agents compete for tasks with trustless settlement."
```

**Step 3: Verify build**

Run: `cd frontend && npm run build`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/components/auction/AuctionShell.tsx frontend/src/app/layout.tsx
git commit -m "feat(frontend): update navigation and metadata for task auction branding"
```

---

### Task 6: Update Create Auction Page Labels

**Files:**
- Modify: `frontend/src/app/auctions/create/page.tsx`

**Step 1: Rebrand create page labels**

In `frontend/src/app/auctions/create/page.tsx`:

1. Change page heading from any "Create Auction" to "Post Task Auction"
2. Rename NFT fields section from "NFT fields" comment to "Task fields"
3. Change label for `nftContract` field to "Task Contract (optional)"
4. Change label for `nftTokenId` field to "Task Token ID (optional)"
5. Update any placeholder text or descriptions to reference tasks

**Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/app/auctions/create/page.tsx
git commit -m "feat(frontend): rebrand create auction page for task posting"
```

---

### Task 7: Update Activity Feed Event Labels

**Files:**
- Modify: `frontend/src/app/auctions/[id]/page.tsx:198-248`

**Step 1: Update event display text**

In the activity feed section of `frontend/src/app/auctions/[id]/page.tsx`:

1. Change the panel header from `activity.feed` to `task.activity`
2. For BID events, change display text to include "bid for task" context
3. For JOIN events, the existing "Agent ●●●● joined" is fine
4. For CLOSE events, change to "Task auction closed — winner: Agent ●●●●{suffix}"

**Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/app/auctions/[id]/page.tsx
git commit -m "feat(frontend): update activity feed labels for task auction context"
```

---

### Task 8: Update ZK Privacy Info Panel Text

**Files:**
- Modify: `frontend/src/app/auctions/[id]/page.tsx:336-348`

**Step 1: Update ZK panel copy**

In the ZK Privacy Info panel section, update any text that references NFTs or items to reference tasks. The ZK explanation should mention:
- "Agents prove task qualifications without revealing identity"
- Keep the technical details (Groth16, Poseidon, nullifiers) as-is

**Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/app/auctions/[id]/page.tsx
git commit -m "feat(frontend): update ZK info panel for task auction context"
```

---

### Task 9: Final Build + Lint Check

**Files:** None (verification only)

**Step 1: Run full build**

Run: `cd frontend && npm run build`
Expected: Clean build, no errors

**Step 2: Run lint**

Run: `cd frontend && npm run lint`
Expected: No new lint errors

**Step 3: Manual visual check**

Run: `cd frontend && npm run dev`

Verify in browser at `http://localhost:3000`:
- [ ] Homepage shows Task Board with grid of task cards
- [ ] Navigation says "TASK BOARD", "TASKS", "POST TASK"
- [ ] Auction room shows Task Brief panel instead of NFT image
- [ ] Activity feed uses task language
- [ ] Page title says "AGENT_TASK_AUCTION"
- [ ] 3D scene still works (unchanged)
- [ ] Create page labels reference tasks

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore(frontend): verify task auction rebrand build and lint"
```
