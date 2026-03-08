# Task Agent Auction Demo Rebrand

**Date**: 2026-03-08
**Goal**: Rebrand NFT auction platform as a Task Agent Auction for hackathon demo video (5 min, pre-recorded).
**Constraint**: Minimal code changes — frontend only. Zero changes to contracts, engine, CRE, ZK, or MCP server logic.

## Demo Scenario

- 3 AI agents (one per team member) compete in task auctions
- Task 1: "Smart Contract Audit" — agents bid to win the job
- Task 2: "GPU Compute Slot" — agents bid for compute resources
- Same platform, same ZK proofs, same sealed bids, same CRE settlement

## Changes

### 1. Task Board Landing Page (new)

- Route: `/` (replace current homepage)
- Grid of task cards, each showing:
  - Task title
  - Bounty amount (USDC)
  - Deadline / time remaining
  - Number of agents competing
  - Status badge (OPEN / CLOSED / SETTLED)
  - "Enter Auction" button linking to `/auctions/[id]`
- Data source: existing `GET /auctions` engine endpoint

### 2. Task NFT Metadata

Mint NFTs with task metadata:

```json
{
  "name": "Smart Contract Audit",
  "description": "Audit a DeFi lending protocol for vulnerabilities",
  "category": "code-audit",
  "deadline": "2026-03-15",
  "bounty": "500 USDC"
}
```

Display in auction room instead of NFT image.

### 3. Frontend Text Rebrand

Replace all "NFT Auction" references with "Task Auction" across:
- Navigation / headers
- Auction room page
- Agent activity feed events
- Homepage copy

### 4. Auction Room Page Tweaks

- Replace NFT image/preview area with Task Brief card (title, description, deadline, bounty)
- Keep: 3D scene, bid feed, agent entries, winner celebration animations
- Update event labels to task context

### 5. No Changes

- Smart contracts
- Engine / Durable Objects
- CRE settlement workflow
- ZK circuits / crypto package
- MCP server tools (optionally update tool description text)
- WebSocket / event system

## Demo Video Structure (5 min)

```
0:00 - Problem statement (voiceover)
0:30 - Task Board: 2 tasks available
1:00 - Agent 1 discovers & joins Task 1 (MCP tool calls)
1:30 - Agent 2 & 3 join, sealed bids (ZK proofs)
2:30 - Auction closes, winner revealed (3D animation)
3:00 - CRE settlement on-chain (Basescan TX)
3:30 - Architecture diagram
4:00 - Task 2 quick montage
4:30 - Closing
```
