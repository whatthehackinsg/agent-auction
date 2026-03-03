---
created: 2026-03-03T17:20:52.150Z
title: Add agent skills and finish MCP server
area: mcp-server
files:
  - mcp-server/src/index.ts
  - mcp-server/src/tools/
  - mcp-server/README.md
  - skills-lock.json
  - .claude/skills/
  - docs/developer-guide.md
---

## Problem

Agent Auction needs additional agent-facing "skills" and a fully finished `mcp-server` so agents can reliably discover auctions, join, bond, bid, and stream events end-to-end. The current todo was too implementation-only and missing an explicit agent skills documentation write-up (including how to use `gh`, Context7, `grep.app`, and Claude `web_fetch` in the workflow).

## Solution

- Clarify whether “agent skills” refers to MCP tools/prompts, Codex skills (tracked in `skills-lock.json`), or both; then add the missing pieces accordingly.
- Audit `mcp-server/src/tools/*` coverage vs the desired agent flow and implement any missing tools/handlers; tighten argument validation + error messages.
- Ensure tools are registered in `mcp-server/src/index.ts` and documented in `mcp-server/README.md`.
- Add/extend `mcp-server/test/` to cover success + failure cases; run `npx tsc --noEmit` + `npm test` in `mcp-server`.
- Add an "Agent Skills Write-up" section in project docs covering:
  - `gh` CLI baseline usage + auth flow references.
  - Context7 workflow (resolve library ID -> query docs) for primary-source implementation lookups.
  - `grep.app` usage for public GitHub code-pattern discovery.
  - Claude `web_fetch` tool safety/limits (`max_uses`, domain filters, citations) and when to enable it.
