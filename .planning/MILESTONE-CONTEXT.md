# Milestone Context: v1.1 — Autonomous Agent Onboarding

## Goal

Make agents fully autonomous for the per-auction loop. Human only does one-time setup (fund wallet, install crypto pkg, register privacy). Agent handles everything else via MCP tools.

## Key Decisions Made

1. **ZK is MANDATORY** — not optional. Every join/bid requires ZK proofs. `ENGINE_REQUIRE_PROOFS=true` is the assumed default.
2. **Agent wallet signs EIP-712 off-chain** — no ETH needed for signing. ETH only needed if agent sends on-chain TXs (tiny amount on Base).
3. **MCP server is per-agent** — platform hosts engine + contracts + CRE; agent hosts their own MCP server with their private key.
4. **ERC-8004 `register(string agentURI)`** — permissionless, any wallet can call. agentId is PRE-DETERMINED (not auto-minted). Contract at `0x8004A818BFB912233c491871b3d84c89A494BD9e` (Base Sepolia). ~1384 agents registered as of 2026-03-05.
5. **Delete all existing auction skills** — `.claude/skills/auction/SKILL.md`, `bond-management/SKILL.md`, `sealed-bid/SKILL.md` — rewrite from scratch.
6. **Withdraw is NOT automatic via CRE** — `onReport()` sets `withdrawable[agentId]`, but `withdraw()` requires `msg.sender == ownerOf(agentId)`. Agent must call it.

## New MCP Tools to Build (4)

### 1. `register_identity`
- Calls `ERC-8004.register(agentURI)` from agent wallet
- agentURI format: `agent://{wallet}/{agentId}`
- agentId must be provided (pre-determined, not auto-assigned)
- Uses `AGENT_PRIVATE_KEY` + `BASE_SEPOLIA_RPC` to send on-chain TX
- Returns minted agentId from Registered event
- Reference impl: `agent-client/src/identity.ts`

### 2. `deposit_bond`
- One tool does full bond flow:
  1. `USDC.approve(AuctionEscrow, amount)`
  2. `USDC.transfer(AuctionEscrow, amount)` — actually just ERC20 transfer
  3. Auto-calls engine `POST /auctions/:id/bonds` with txHash
- Uses `AGENT_PRIVATE_KEY` + `BASE_SEPOLIA_RPC`
- Agent wallet needs ETH for gas (~$0.001 on Base) + USDC for bond
- USDC contract: `0xfEE786495d165b16dc8e68B6F8281193e041737d` (MockUSDC on Base Sepolia)
- AuctionEscrow: `0x20944f46AB83F7eA40923D7543AF742Da829743c`

### 3. `withdraw_funds`
- Calls `AuctionEscrow.withdraw(agentId)` from agent wallet
- Agent wallet must be ERC-8004 owner of agentId (or admin)
- Sends USDC to `designatedWallet[agentId]`
- Uses `AGENT_PRIVATE_KEY` + `BASE_SEPOLIA_RPC`

### 4. `claim_refund`
- Calls `AuctionEscrow.claimRefund(auctionId, agentId)` from agent wallet
- Permissionless (anyone can call for any agent)
- Moves bond amount to `withdrawable[agentId]`
- Agent then calls `withdraw_funds` to get USDC out

## Fixes to Existing Code

### check_identity tool (`mcp-server/src/tools/identity.ts`)
- Merge `readyForZkProofs` into `readyToParticipate` — ZK is mandatory
- `readyToParticipate` should require: erc8004Verified AND privacyRegistered

### join_auction tool (`mcp-server/src/tools/join.ts`)
- Remove `generateProof` parameter or default to `true`
- ZK proof always generated when AGENT_STATE_FILE configured
- Error if AGENT_STATE_FILE missing (ZK is required)

### place_bid tool (`mcp-server/src/tools/bid.ts`)
- Same: default proof generation to true

### .env.example (`mcp-server/.env.example`)
- Mark `AGENT_STATE_FILE` and `BASE_SEPOLIA_RPC` as REQUIRED (not optional)

## Skill Rewrite

Delete all 3 files:
- `.claude/skills/auction/SKILL.md`
- `.claude/skills/auction/bond-management/SKILL.md`
- `.claude/skills/auction/sealed-bid/SKILL.md`

Rewrite with correct info:
- `selfRegister(uint256)` is WRONG → correct is `register(string agentURI)`
- ZK is mandatory, not optional
- Complete 4-step onboarding: wallet → ERC-8004 → privacy registry → env config
- Full autonomous per-auction flow: discover → deposit_bond → join(ZK) → bid(ZK) → monitor → withdraw/claim

## Full Autonomous Agent Flow

```
HUMAN (one-time setup):
  1. Create wallet (private key)
  2. Fund wallet: tiny ETH + USDC
  3. Register ERC-8004 (or use register_identity MCP tool)
  4. Install @agent-auction/crypto
  5. Run prepareOnboarding() → agent-N.json
  6. Register on AgentPrivacyRegistry (on-chain TX)
  7. Configure MCP server env vars (all required)

AGENT (fully autonomous per auction):
  1. discover_auctions()
  2. get_auction_details()
  3. deposit_bond()              ← NEW
  4. join_auction() with ZK proof (mandatory)
  5. place_bid() with ZK proof (mandatory)
  6. get_auction_events() / monitor
  7. check_settlement_status()
  8. claim_refund() or withdraw_funds()  ← NEW
```

## Architecture Reference

```
Agent Runtime (Claude, etc.)
  ↕ MCP protocol (Streamable HTTP)
MCP Server (per-agent, local) — holds AGENT_PRIVATE_KEY
  ↕ HTTP to engine + on-chain TXs via RPC
Auction Engine (platform-hosted, shared)
  ↕ on-chain events
Base Sepolia + CRE (Chainlink)
```

## Contract Addresses (Base Sepolia)

| Contract | Address |
|----------|---------|
| ERC-8004 Identity Registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| AuctionRegistry (v2) | `0xFEc7a05707AF85C6b248314E20FF8EfF590c3639` |
| AuctionEscrow (v2) | `0x20944f46AB83F7eA40923D7543AF742Da829743c` |
| AgentPrivacyRegistry | `0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff` |
| MockUSDC | `0xfEE786495d165b16dc8e68B6F8281193e041737d` |
| NftEscrow | `0xa05C5AF6a07D5e1abDd2c93EFdcb95D306766a94` |

## ERC-8004 ABI (from agent-client/src/config.ts)

```typescript
[
  { name: 'register', inputs: [{ name: 'agentURI', type: 'string' }], outputs: [{ name: 'agentId', type: 'uint256' }] },
  { name: 'ownerOf', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] },
  { name: 'Registered', type: 'event', inputs: [{ name: 'agentId', type: 'uint256', indexed: true }, { name: 'owner', type: 'address', indexed: true }, { name: 'agentURI', type: 'string' }] }
]
```
