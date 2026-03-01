# agent-client

TypeScript demo client that runs a full 3-agent auction lifecycle on Base Sepolia.

> This is a demo/integration test, not a production SDK.

## What It Does

Spins up three software agents, each with a smart wallet and on-chain identity, then walks them through a complete auction: creation, bonding, bidding, settlement, winner verification, and loser refunds. The whole flow runs against live Base Sepolia contracts.

## Prerequisites

- Node.js 18+
- Wallet signer source for 3 agents:
  - Local mode: three funded EOA private keys on Base Sepolia
  - Coinbase mode: CDP API credentials + three managed account addresses
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
| `AGENT_WALLET_PROVIDER` | No | `local` (default), `coinbase`, `dynamic`, or `privy` |
| `AGENT_PRIVATE_KEYS` | Local mode only | Comma-separated list of 3 agent EOA private keys |
| `CDP_API_KEY_ID` | Coinbase mode only | Coinbase CDP API key ID |
| `CDP_API_KEY_SECRET` | Coinbase mode only | Coinbase CDP API key secret |
| `CDP_WALLET_SECRET` | Coinbase mode only | Coinbase CDP wallet secret |
| `COINBASE_AGENT_ADDRESSES` | Coinbase mode only | Comma-separated 0x addresses for 3 CDP managed wallets |
| `COINBASE_EVM_NETWORK` | No | CDP network slug (default: `base-sepolia`) |
| `ONBOARDING_CHALLENGE_SIGN` | No | Set `1` to emit runtime signer challenge signatures during boot |
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

## Wallet Adapter Modes

`agent-client` now uses a provider-agnostic `WalletSignerAdapter` abstraction:

- `local`: signs with raw private keys (existing demo behavior)
- `coinbase`: signs/sends via Coinbase CDP managed wallets
- `dynamic` / `privy`: adapter stubs are wired, but runtime methods intentionally throw until credentials + SDK wiring are added

The Engine action API is unchanged: `JOIN`/`BID` still post EIP-712 signatures to `/auctions/:id/action`.

**Engine API notes:**
- `/auctions/:id/events` requires a `participantToken` query param (the agent's `agentId` that has a JOIN event) or an admin key. Unauthenticated requests return 403.
- Discovery endpoints (`/auctions`, `/auctions/:id`) may require x402 micropayment when the engine has `ENGINE_X402_DISCOVERY` enabled. The demo client uses `@x402/fetch` for transparent auto-payment.

## Security Model (Managed Wallets)

- Delegated signing scope should be limited to auction action payloads (`JOIN`/`BID`) and required bond transactions.
- Keep provider credentials (`CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`) server-side only; never ship them to browser clients.
- Rotate managed wallet credentials independently from auction identity (`agentId`) to limit blast radius.
- `ONBOARDING_CHALLENGE_SIGN=1` enables a challenge-sign proof log for runtime key control hardening before production enforcement.

## File Structure

```
agent-client/src/
  index.ts            Main demo script, orchestrates the full lifecycle
  config.ts           Deployed addresses, ABI fragments, viem client setup
  auction.ts          Auction flow helpers (create, join, bid, bond, settle, claim)
  wallet-adapter.ts   Provider-agnostic wallet signer abstraction (local, coinbase, dynamic, privy)
  identity.ts         ERC-8004 identity registration, USDC funding
  privacy.ts          ZK privacy helpers (onboarding, membership proofs)
  utils.ts            Logging, sleep, and x402 auto-payment helpers
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
