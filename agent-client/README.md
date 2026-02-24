# agent-client

TypeScript demo client that runs a full 3-agent auction lifecycle on Base Sepolia.

> This is a demo/integration test, not a production SDK.

## What It Does

Spins up three software agents, each with a smart wallet and on-chain identity, then walks them through a complete auction: creation, bonding, bidding, settlement, winner verification, and loser refunds. The whole flow runs against live Base Sepolia contracts.

## Prerequisites

- Node.js 18+
- Three funded EOA private keys on Base Sepolia
- A deployer key with enough ETH for gas
- Contracts deployed (see `contracts/` for deployment scripts)

## Setup

```bash
cd agent-client
npm install
```

The package depends on the root workspace (`"auction-design": "file:.."`), so install from the repo root if you hit resolution issues.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DEPLOYER_PRIVATE_KEY` | Yes | Deployer EOA private key (hex, 0x-prefixed) |
| `AGENT_PRIVATE_KEYS` | Yes | Comma-separated list of 3 agent EOA private keys |
| `BASE_SEPOLIA_RPC` | No | RPC endpoint (defaults to `https://sepolia.base.org`) |
| `ENGINE_URL` | No | Auction engine URL (defaults to `http://localhost:8787`) |

Create a `.env` file or export these before running.

## Usage

```bash
npm start
# or
npm run demo
```

Type-check without running:

```bash
npm run typecheck
```

## File Structure

```
agent-client/src/
  index.ts      Main demo script, orchestrates the full lifecycle
  config.ts     Deployed addresses, ABI fragments, viem client setup
  auction.ts    Auction flow helpers (create, join, bid, bond, settle, claim)
  wallet.ts     Smart wallet deployment via AgentAccountFactory (CREATE2)
  identity.ts   ERC-8004 identity registration, USDC funding
  utils.ts      Logging and sleep helpers
```

## How the Demo Works

The script runs a deterministic auction lifecycle end to end:

1. **Wallet setup** ... Creates 3 agents (A, B, C). Each gets an EOA signer and an AgentAccount smart wallet deployed via the factory using CREATE2.
2. **Identity registration** ... Registers each agent in the ERC-8004 identity registry.
3. **Funding** ... Sends 200 USDC to each agent's smart wallet.
4. **Auction creation** ... Agent A creates a new auction via AuctionRegistry.
5. **Bonding** ... Each agent posts a 50 USDC bond to AuctionEscrow.
6. **Joining** ... All three agents join the auction.
7. **Bidding** ... Agents place bids: A = 100, B = 150, C = 120.
8. **Settlement** ... Waits for CRE-based on-chain settlement.
9. **Verification** ... Confirms Agent B (highest bid) is the winner.
10. **Refunds** ... Losing agents (A, C) claim their bond refunds.

## Deployed Addresses (Base Sepolia v2)

All addresses are configured in `src/config.ts`:

- EntryPoint (ERC-4337)
- MockUSDC
- MockIdentityRegistry (ERC-8004)
- AgentAccountFactory
- AuctionRegistry
- AuctionEscrow

See `config.ts` for the exact values.

## Dependencies

| Package | Purpose |
|---|---|
| `viem` | Ethereum client, ABI encoding, contract interaction |
| `permissionless` | ERC-4337 smart account tooling |
| `auction-design` | Shared types and ABIs from root workspace |
| `tsx` | TypeScript execution (dev) |
| `typescript` | Type checking (dev) |
