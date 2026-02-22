# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repository Is

This repo is for the **Chainlink 2026 Hackathon**: https://chain.link/hackathon

An **agent-native auction platform** where AI agents autonomously discover, join, bid in, and settle auctions — with on-chain USDC escrow, verifiable event ordering, and CRE-based trustless settlement.

**Current stage**: Architecture designed → smart contracts implemented & tested (113 tests passing) → security audit complete (9 findings fixed) → deploying to Base Sepolia.

## Build, Test, and Lint

```bash
# Smart contracts (Foundry)
cd contracts
forge build                    # Compile (solc 0.8.24, Cancun EVM)
forge test                     # Run all 113 tests
forge test -vvv                # Verbose with traces
forge fmt                      # Format Solidity code

# Frontend (Next.js)
cd frontend
npm run dev                    # Dev server
npm run build && npm run lint  # Build + lint

# Chainlink MCP server
npm run mcp:start              # Needs .mcp.json configured
```

## Key Architecture

- **Source of truth**: `docs/full_contract_arch(amended).md`
- **Deep specs**: `docs/research/agent-auction-architecture/01–06`
- **Legacy** (historical only): `docs/legacy/`

6 Solidity contracts in `contracts/src/`:
- `AgentAccount.sol` — EIP-4337 smart wallet (secp256k1 runtime signer)
- `AgentAccountFactory.sol` — CREATE2 factory for deterministic deployment
- `AgentPaymaster.sol` — Gas sponsorship paymaster
- `AuctionRegistry.sol` — Auction lifecycle (OPEN → CLOSED → SETTLED/CANCELLED)
- `AuctionEscrow.sol` — USDC bonds + CRE settlement via `onReport()`
- `MockKeystoneForwarder.sol` — Test helper simulating Chainlink KeystoneForwarder

Target chain: **Base Sepolia** (chainId 84532).

Deployment scripts: `contracts/script/Deploy.s.sol`, `contracts/script/HelperConfig.s.sol`
Development docs: `contracts/docs/` (AgentAccount, AgentPaymaster, AuctionRegistry, AuctionEscrow)
Security: 2-round audit complete, 9 vulnerabilities fixed (see `contracts/docs/`).

## Conventions

- **Design docs** (legacy): Mandarin Chinese
- **Deep specs, README, AGENTS.md, code comments**: English
- Protocol names always English: `ERC-8004`, `x402`, `EIP-4337`, `MCP`, `CRE`
- Priority: **P0** = MVP/hackathon, **P1** = advanced, **P2** = production
- Commits: `feat(contracts): add auction escrow settlement`
- Issue tracking: **bd (beads)** CLI, never markdown TODOs

## Chainlink References

- CRE Docs: https://docs.chain.link/cre
- Use Cases: https://blog.chain.link/5-ways-to-build-with-cre/
- MCP Server: https://www.npmjs.com/package/@chainlink/mcp-server
- Demos: https://credemos.com/cdf

For detailed guidelines, see `AGENTS.md`.
