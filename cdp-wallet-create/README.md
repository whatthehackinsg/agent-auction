# CDP Wallet Create

Small standalone helper for creating a new CDP Server Wallet account for Agent Auction's supported participation path.

This folder is intentionally separate from the main app so you can:

- create a new Base Sepolia Server Wallet once
- save the wallet address you want to reuse
- fund it with Base Sepolia ETH
- copy the resulting env values into the `mcp-server` supported AgentKit/CDP setup

## What This Is For

Use this helper if you want a fresh CDP Server Wallet for the supported participation stack:

- `AgentKit + CDP Server Wallet`
- Base Sepolia only
- one persistent owner wallet that stays the:
  - ERC-8004 owner
  - action signer
  - bond / refund wallet

This helper does **not**:

- register an ERC-8004 identity
- create ZK state
- fund USDC for you
- start the MCP server

It only creates and funds the wallet account itself.

## Prerequisites

From the CDP Portal, create and save:

1. a `Secret API Key`
2. a `Wallet Secret`

You need these env vars for the scripts in this folder:

- `CDP_API_KEY_ID`
- `CDP_API_KEY_SECRET`
- `CDP_WALLET_SECRET`

Optional:

- `CDP_NETWORK_ID` defaults to `base-sepolia`
- `BASE_SEPOLIA_RPC` defaults to `https://sepolia.base.org`

Important:

- `Wallet Secret` is shown once in the portal. Save it immediately.
- Do not commit your `.env` file.

## Setup

```bash
cd cdp-wallet-create
cp .env.example .env
```

Fill in `.env`:

```bash
CDP_API_KEY_ID=your_api_key_id
CDP_API_KEY_SECRET=your_api_key_secret
CDP_WALLET_SECRET=your_wallet_secret
CDP_NETWORK_ID=base-sepolia
BASE_SEPOLIA_RPC=https://sepolia.base.org
```

Install dependencies:

```bash
npm install
```

## Scripts

### 1. Create a new wallet

```bash
npm run create-wallet
```

This creates a new CDP Server Wallet account and prints:

- the new wallet address
- the network
- an env block you can copy into your `mcp-server` local env file

After it prints the address, save it into `.env` if you want to reuse it for the faucet step:

```bash
CDP_WALLET_ADDRESS=0xYourNewWalletAddress
```

### 2. Request Base Sepolia faucet ETH

```bash
npm run request-faucet
```

This script:

- reads `CDP_WALLET_ADDRESS`
- requests Base Sepolia ETH from the CDP faucet
- waits for confirmation
- prints the Basescan link

If `CDP_WALLET_ADDRESS` is missing, the script stops and tells you to run `create-wallet` first.

## Using The Wallet With Agent Auction

Once you have a wallet address, create a local env file for the MCP server, for example:

`mcp-server/.env.agentkit.local`

```bash
MCP_WALLET_BACKEND=agentkit
CDP_API_KEY_ID=your_api_key_id
CDP_API_KEY_SECRET=your_api_key_secret
CDP_WALLET_SECRET=your_wallet_secret
CDP_WALLET_ADDRESS=0xYourNewWalletAddress
CDP_NETWORK_ID=base-sepolia
BASE_SEPOLIA_RPC=https://your-base-sepolia-rpc
ENGINE_URL=http://localhost:8787
```

Then load and run the MCP server:

```bash
cd mcp-server
set -a
source .env.agentkit.local
set +a
npm run dev
```

## What To Do After Wallet Creation

Before the wallet can actively participate in auctions, it still needs:

1. Base Sepolia ETH for gas
2. Base Sepolia USDC for bond flows
3. ERC-8004 + ZK onboarding through the MCP lifecycle

Typical next flow:

```text
create wallet
  -> request faucet ETH
  -> fund Base Sepolia USDC
  -> run MCP with AgentKit/CDP env
  -> register_identity
  -> check_identity
  -> deposit_bond
  -> join_auction
  -> place_bid
```

## References

- Server Wallet v2 quickstart: https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart
- Server Wallet v2 overview: https://docs.cdp.coinbase.com/server-wallets/v2/introduction/welcome
- AgentKit wallet management: https://docs.cdp.coinbase.com/agent-kit/core-concepts/wallet-management
