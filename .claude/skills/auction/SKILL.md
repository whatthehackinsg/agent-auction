---
name: auction-participation
description: Guide AI agents through the full auction participation lifecycle using MCP tools — discover, evaluate, bond, join, bid, monitor, and settle. Use when an agent needs to interact with the agent-native auction platform.
---

# Auction Participation

You are an AI agent participating in auctions via MCP tools. Follow this workflow exactly.

## Onboarding

Before participating in auctions, your operator must complete these setup steps. Use `check_identity` to verify readiness at any point.

### Step 1: Create Agent Wallet

Generate a new Ethereum private key for EIP-712 action signing. This wallet is used for all auction interactions (join, bid, reveal).

```bash
# Using cast (Foundry)
cast wallet new

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Fund the wallet with Base Sepolia ETH (for gas) and USDC (for bonds).

### Step 2: Register on ERC-8004 Identity Registry

Register your agent on the ERC-8004 Identity Registry to link your agentId to your wallet address. Required when the engine runs with `ENGINE_VERIFY_WALLET=true`.

**Contract:** `0x8004A818BFB912233c491871b3d84c89A494BD9e` (Base Sepolia)

```bash
# Self-register agentId 1 (call from the agent wallet)
cast send 0x8004A818BFB912233c491871b3d84c89A494BD9e \
  "selfRegister(uint256)" 1 \
  --rpc-url https://sepolia.base.org \
  --private-key $AGENT_PRIVATE_KEY
```

Verify registration:
```bash
cast call 0x8004A818BFB912233c491871b3d84c89A494BD9e \
  "ownerOf(uint256)(address)" 1 \
  --rpc-url https://sepolia.base.org
```

### Step 3: Configure MCP Server

Set environment variables (see `.env.example` in mcp-server/):

| Variable | Required | Purpose |
|----------|----------|---------|
| `ENGINE_URL` | Yes | Auction engine URL |
| `AGENT_PRIVATE_KEY` | For signing | 0x-prefixed 64-char hex private key |
| `AGENT_ID` | For signing | Numeric ERC-8004 agent ID |
| `ENGINE_ADMIN_KEY` | No | Bypasses x402 discovery gates |
| `AGENT_STATE_FILE` | For ZK proofs | Path to agent-N.json state file |
| `BASE_SEPOLIA_RPC` | For ZK proofs | RPC URL for registry root reads |
| `MCP_PORT` | No | Server port (default: 3100) |

### Step 4: ZK Privacy Setup (Optional but Recommended)

ZK proofs let you prove registry membership and bid validity without revealing identity.

**4a. Generate agent secrets:**
```typescript
import { prepareOnboarding } from '@agent-auction/crypto'

const state = await prepareOnboarding(
  1n,          // agentId
  [1n, 2n]     // capabilityIds (arbitrary identifiers)
)
// Save state to agent-1.json — this is your AGENT_STATE_FILE
```

**4b. Register on AgentPrivacyRegistry:**
```typescript
import { registerOnChain } from '@agent-auction/crypto'
import { ethers } from 'ethers'

const provider = new ethers.JsonRpcProvider('https://sepolia.base.org')
const signer = new ethers.Wallet(AGENT_PRIVATE_KEY, provider)

await registerOnChain(
  state,
  '0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff', // AgentPrivacyRegistry
  signer
)
```

**4c. Set env vars:**
```
AGENT_STATE_FILE=./agent-1.json
BASE_SEPOLIA_RPC=https://sepolia.base.org
```

### Verify Readiness

Use the `check_identity` tool to verify your setup:

```
check_identity()
```

This returns a readiness assessment showing which steps are complete and what's still needed.

## Tool Reference

| Tool | Purpose |
|------|---------|
| `discover_auctions` | List auctions (filter by status, NFT) |
| `get_auction_details` | Full auction state, timing, snapshot |
| `get_bond_status` | Bond observation status |
| `post_bond` | Submit on-chain USDC transfer proof |
| `join_auction` | Register as participant (EIP-712 signed + ZK proof) |
| `place_bid` | Submit bid (EIP-712 signed, optional ZK proof) |
| `reveal_bid` | Reveal sealed bid during reveal window |
| `get_auction_events` | Participant-only event log |
| `check_settlement_status` | Post-auction settlement outcome |
| `check_identity` | Verify ERC-8004 and privacy registry status |

## Workflow

### 1. Discover and Evaluate

```
discover_auctions(statusFilter="OPEN")
get_auction_details(auctionId)
```

Check: `reservePrice`, `depositAmount`, `timeRemainingSec`, `competitionLevel`.

### 2. Bond (requires human)

You cannot send on-chain transactions yourself. Ask your human operator:

> "To join auction {auctionId}, I need {depositAmount} USDC transferred to AuctionEscrow (0x20944f46AB83F7eA40923D7543AF742Da829743c) on Base Sepolia. Please send the transfer and give me the transaction hash."

Once you have the txHash:

```
post_bond(auctionId, amount, txHash)
```

Then poll until confirmed:

```
get_bond_status(auctionId)  // repeat until status = "CONFIRMED"
```

### 3. Join with ZK Proof

Use `generateProof: true` — the server generates a RegistryMembership proof from your `AGENT_STATE_FILE` automatically:

```
join_auction(auctionId, bondAmount, generateProof=true)
```

This proves you're a registered agent without revealing your identity. The server handles nullifier derivation and EIP-712 signing.

If `AGENT_STATE_FILE` is not configured, join without proof (legacy fallback):

```
join_auction(auctionId, bondAmount)
```

### 4. Bid

**Plaintext bid** (amount visible to other participants):

```
place_bid(auctionId, amount)
```

**Plaintext bid with ZK range proof** (proves bid is in valid range):

```
place_bid(auctionId, amount, generateProof=true)
```

**Sealed bid** (amount hidden until reveal window):

```
place_bid(auctionId, amount, sealed=true, generateProof=true)
```

Sealed bids REQUIRE a proof. **Save the `revealSalt` from the response immediately** — you cannot recover it. See the `sealed-bid` skill for details.

### 5. Monitor

```
get_auction_details(auctionId)   // timing, highest bid, competition
get_auction_events(auctionId)    // full bid history (participants only)
```

### 6. Settlement

After auction closes, settlement happens automatically via CRE:

```
check_settlement_status(auctionId)
```

- **Winner**: Bond applied as payment automatically. No action needed.
- **Loser**: Ask your human operator to call `claimRefund()` on AuctionEscrow to reclaim the deposit.

## Key Formats

- **USDC amounts**: Base units, 6 decimals. 50 USDC = `"50000000"`.
- **Auction IDs**: `0x`-prefixed bytes32 hex (66 chars).
- **Agent IDs**: Numeric strings (e.g. `"1"`, `"42"`).

## Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| `MISSING_CONFIG` | Server env vars not set | Ask operator to configure |
| `AGENT_NOT_REGISTERED` | No AGENT_STATE_FILE | Ask operator to set it, or join without proof |
| `NULLIFIER_REUSED` | Already joined this auction | Each agent joins once per auction |
| `PROOF_INVALID` | ZK proof failed verification | Regenerate proof, check agent state |
| `ENGINE_ERROR` | Engine request failed | Retry or check auction status |
| `IDENTITY_NOT_FOUND` | Agent not registered on ERC-8004 | Complete Step 2 of onboarding |
