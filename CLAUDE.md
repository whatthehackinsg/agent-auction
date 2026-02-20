# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repository Is

This repo is for the Chainlink hackathon: https://chain.link/hackathon

This is a **design document repository** (no source code) for an **agent-native auction platform** — a system where AI agents can discover, join, bid in, and settle auctions with minimal human intervention. All documents are written in Chinese.

There are no build commands, tests, or linters. The work here is writing, reviewing, and evolving design specifications.

### Reference Links

- Developer docs: https://docs.chain.link/cre
- Use Cases blog: https://blog.chain.link/5-ways-to-build-with-cre/
- Developer Assistant MCP Server: https://www.npmjs.com/package/@chainlink/mcp-server
- Demos: https://credemos.com/cdf
- Blog post: https://blog.chain.link/chainlink-runtime-environment-now-live/

## Repository Structure

### `docs/` — Design Documents

The numbered documents follow a progression representing the auction lifecycle:

- `0-agent-onboarding.md` — Identity model (3-layer: Root Controller / Runtime Key / Session Token), registration flows (off-chain Flow A, on-chain ERC-8004 Flow B, hybrid Flow C), key rotation/revocation
- `1-agent-voice.md` — How agents "speak" in auctions: signing, reliable delivery, sequencing; two entry modes (MCP Gateway vs Web HTTP)
- `2-room-broadcast.md` — Authoritative event ordering via Sequencer, append-only log, multi-channel broadcast (WS/SSE), reconnection/replay from `seq` cursor
- `3-payment.md` — x402 protocol integration; platform as Merchant, external Facilitator; bond/settlement/refund flows
- `4-auction-host.md` — Host role design (platform-hosted MVP → pluggable external Host Agent via ERC-8004); escrow models; host permissions/restrictions
- `5-auction-object.md` — Three tiers of auctionable objects: machine-verifiable (P0), semi-verifiable, high-privilege services
- `6-human-observation.md` — Spectator UI: live view (status bar + event timeline + leaderboard) and replay/audit mode
- `things-need-answer.md` — Roadmap: MVP (P0) → Advanced (P1: sealed-bid, scoring auctions, anti-spam) → Production (P2: on-chain escrow, privacy, federation)

### `agent-onboarding-research/` — Competitive Research

Deep research on 28 agent onboarding platforms/protocols, structured using the `/research` skill workflow:

- `outline.yaml` — Research items: 28 platforms/protocols across categories (on-chain, off-chain, enterprise, standards)
- `fields.yaml` — Field definitions: ~35 fields across 10 categories (identity, security, delegation, discovery, payment, etc.)
- `results/` — Per-item JSON research results (one file per platform)
- `generate_report.py` — Python script to compile results into `report.md`. Run with: `python3 agent-onboarding-research/generate_report.py`
- `report.md` — Generated comparison report (~360KB)

## Key Architecture Concepts

- **Sequencer + Append-only Log**: Central truth source. All auction state is derived from a monotonically increasing `seq`-numbered event stream. Any third party can replay the log to verify the winner.
- **Dual Entry**: Agents enter via either MCP Gateway (Streamable HTTP + SSE) or plain HTTP — both converge on the same Room Core (Cloudflare Durable Objects).
- **Identity**: Supports both on-chain (ERC-8004 agentId) and off-chain (Ed25519 runtime keys) identities. Runtime keys are always used for signing actions; root controllers (Passkey/wallet) are for admin operations.
- **Payment via x402**: HTTP 402 → agent signs payment → Facilitator settles on-chain. Platform acts as Merchant (collects then distributes).
- **Host as pluggable role**: MVP = platform hosts; future = external Host Agents discoverable via ERC-8004 registry, paid via x402, auditable via signed event logs.

## Conventions

- All design docs are in **Chinese** (Mandarin). Maintain this language when editing or extending them.
- Priority labels: **P0** = MVP/hackathon, **P1** = advanced, **P2** = production-grade.
- Auction types referenced: English, sealed-bid (commit-reveal), reverse, scoring.
- Tech stack references: Cloudflare Workers + Durable Objects, PostgreSQL, Redis, Next.js/React frontend, Node.js/TypeScript or Go backend, Ed25519 signing, ERC-8004, x402, MCP Streamable HTTP.
