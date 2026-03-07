/**
 * MCP prompts — reusable prompt templates for AI agent auction participation.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'auction_rules',
    {
      description:
        'Explains the auction platform rules: bonding, bidding, settlement, and anti-snipe extensions.',
    },
    async () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are participating in an agent-native auction platform. Here are the rules:

1. **Onboarding**: If you do not already have a usable identity, call register_identity first. Then call check_identity and only proceed when readyToParticipate is true.

2. **Bonding**: Before joining an auction, you need the required USDC bond in escrow. The normal path is deposit_bond, which reads the auction depositAmount, transfers USDC to AuctionEscrow, and records the receipt with the engine. post_bond is only the advanced/manual fallback when you already submitted a transfer outside the MCP flow.

3. **Joining**: Once bonded, call join_auction. JOIN is EIP-712 signed and fail-closed: the MCP server auto-generates the membership proof from AGENT_STATE_FILE on the normal path, or accepts an advanced proofPayload override.

4. **Bidding**: Call place_bid to submit bids. BID is also fail-closed: the MCP server auto-generates the bid proof from AGENT_STATE_FILE on the normal path, or accepts an advanced proofPayload override. Each accepted bid must exceed the current highest bid, and the engine orders them via its monotonic sequencer.

5. **Anti-snipe**: If a bid lands during the final snipe window, the deadline extends. Check snipeWindowSec, extensionSec, and extensionsRemaining in auction details.

6. **Settlement and exits**: When the auction closes, settlement is verified through Chainlink CRE. Winners should use withdraw_funds after settlement. Losing or cancelled participants should call claim_refund, then withdraw_funds.

7. **Privacy**: Read-side auction outputs stay privacy-preserving. get_auction_events and monitor_auction expose masked identities or zkNullifier values only. Write tools may target an explicit agentId when needed.

Always confirm readiness before participating, use deposit_bond as the primary bond path, and monitor time remaining to avoid missing deadlines.`,
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'bidding_strategy',
    {
      description:
        'Provides a framework for deciding when and how much to bid in an auction.',
      argsSchema: {
        maxBudget: z
          .string()
          .describe('Maximum USDC budget in base units (6 decimals)'),
        auctionId: z
          .string()
          .optional()
          .describe('Optional auction ID to include context-specific advice'),
      },
    },
    async ({ maxBudget, auctionId }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are bidding in an auction with a maximum budget of ${maxBudget} USDC (base units, 6 decimals).${auctionId ? ` Auction ID: ${auctionId}.` : ''}

Bidding strategy framework:

1. **Discover**: Use discover_auctions to find open auctions, then get_auction_details for the target auction.

2. **Assess value**: Compare the reserve price against your budget. If reserve exceeds budget, skip this auction.

3. **Monitor competition**: Check participantCount and current highestBid. More participants = more competitive.

4. **Incremental bidding**: Start near or slightly above the current highest bid. Avoid jumping to your max immediately.

5. **Time awareness**: Monitor timeRemainingSec. Bid earlier to establish position, but save budget for potential snipe-window extensions.

6. **Extension tracking**: Check extensionCount vs maxExtensions. Once max extensions are reached, the deadline is final.

7. **Exit discipline**: If highestBid exceeds 80% of your budget, consider withdrawing to preserve capital for other auctions.

Use get_auction_events to track bid history and identify competitor patterns.`,
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'participation_loop',
    {
      description:
        'Step-by-step workflow for autonomous auction participation from discovery to settlement.',
    },
    async () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Autonomous auction participation workflow:

**Phase 0 — Identity**
1. If you do not yet have an auction identity, call register_identity
2. Call check_identity and confirm readyToParticipate is true

**Phase 1 — Discovery**
1. Call discover_auctions with statusFilter="OPEN"
2. For each interesting auction, call get_auction_details
3. Evaluate reservePrice, depositAmount, timeRemainingSec, and competitionLevel

**Phase 2 — Bonding**
1. Call deposit_bond with the auctionId
2. If the bond is already PENDING or CONFIRMED, the tool returns that state idempotently
3. Use post_bond only as the advanced/manual fallback for an already-submitted transfer

**Phase 3 — Entry**
1. Call join_auction with the auctionId and bondAmount. On the normal path the MCP server loads AGENT_STATE_FILE and auto-generates the required JOIN proof.
2. Verify success via the returned seq number and event hash

**Phase 4 — Bidding**
1. Call get_auction_details to inspect the latest highestBid
2. Call place_bid with your next amount (or sealed=true for sealed-bid auctions). On the normal path the MCP server loads AGENT_STATE_FILE and auto-generates the BID proof.
3. Use monitor_auction or get_auction_events to track competition without identity leakage

**Phase 5 — Post-auction**
1. Check settlement with check_settlement_status or get_auction_details
2. If you lost or the auction was cancelled: call claim_refund, then withdraw_funds
3. If you won: call withdraw_funds after settlement when funds are withdrawable`,
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'sealed_bid_guide',
    {
      description:
        'How sealed-bid auctions work: commit phase, reveal window, and salt management.',
    },
    async () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Sealed-bid auctions use a commit-reveal scheme to hide bid amounts until the reveal window opens.

**How it works:**

1. **Commit phase (auction status: OPEN)**: Call place_bid with sealed=true. On the normal path the MCP server auto-generates the required bid proof from AGENT_STATE_FILE; advanced callers can provide proofPayload instead. The engine records a Poseidon(bid, salt) commitment hash on the event log, so your actual bid amount stays hidden from other participants.

2. **CRITICAL — Save your revealSalt**: The place_bid response includes a "revealSalt" field. You MUST save this value. It cannot be recovered if lost. Store it in memory or persistent state immediately.

3. **Reveal window (auction status: REVEAL_WINDOW)**: When the auction closes or a timer expires, the reveal window opens. You must reveal your bid before the window closes.

4. **Reveal your bid**: Call reveal_bid with your original bid amount and the saved revealSalt. The engine verifies that Poseidon(bid, salt) matches your recorded commitment.

5. **Verification**: If the commitment matches, your bid is accepted at the revealed amount. If it does not match (wrong bid or wrong salt), the reveal is rejected.

6. **Missed reveal**: If you fail to reveal before the window closes, your bid is forfeit. You lose your bonded deposit.

**Strategy tips:**
- Commit early to establish your position — the actual amount stays hidden until reveal.
- Reveal as soon as the window opens to avoid missing the deadline.
- Never modify or lose the revealSalt between commit and reveal.
- Multiple sealed bids can be placed; each generates its own salt that must be tracked independently.`,
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'bonding_walkthrough',
    {
      description:
        'Step-by-step guide to posting a USDC bond for auction participation.',
      argsSchema: {
        auctionId: z
          .string()
          .optional()
          .describe('Auction ID to include specific deposit amount'),
      },
    },
    async ({ auctionId }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Step-by-step guide to posting a USDC bond for auction participation.${auctionId ? ` Target auction: ${auctionId}.` : ''}

**Step 1 — Check deposit requirement**
Call get_auction_details${auctionId ? ` with auctionId="${auctionId}"` : ''}. Look at the "depositAmount" field in the response. This is the required USDC amount in base units (6 decimals). For example, 50000000 = 50 USDC.

**Step 2 — Use the autonomous bond path**
Call deposit_bond${auctionId ? ` with auctionId="${auctionId}"` : ''}. The normal tool path:
- auto-loads depositAmount if you do not override it
- transfers USDC to AuctionEscrow on Base Sepolia
- submits the tx hash to the engine
- returns CONFIRMED quickly when possible, otherwise returns PENDING with next-step guidance

**Step 3 — Handle idempotent states**
If deposit_bond reports:
- CONFIRMED: proceed directly to join_auction
- PENDING: re-check with get_bond_status or retry deposit_bond after a short wait
- an existing PENDING/CONFIRMED bond: do not send another transfer

**Step 4 — Advanced/manual fallback**
Only use post_bond if you already sent the USDC transfer outside the autonomous MCP path and need to submit the tx hash manually.

**Step 5 — Join the auction**
Once bond status is CONFIRMED, call join_auction with the auctionId and bondAmount.

**Post-auction notes:**
- If you win: call withdraw_funds after settlement when funds are available.
- If you lose or the auction is cancelled: call claim_refund, then withdraw_funds.
- The bond remains in escrow until CRE settlement or refund processing completes.`,
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'troubleshooting',
    {
      description:
        'Common error codes and how to resolve them when using auction MCP tools.',
    },
    async () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Common error codes and how to resolve them when using auction MCP tools.

**Configuration errors:**

- **MISSING_CONFIG**: Required environment variables are not set. Write tools generally need AGENT_PRIVATE_KEY and AGENT_ID, while on-chain tools also need BASE_SEPOLIA_RPC. register_identity only requires signing config plus BASE_SEPOLIA_RPC.

- **AGENT_NOT_REGISTERED**: The target agentId is not registered on ERC-8004. Use register_identity first, then re-run check_identity.

- **ZK_STATE_REQUIRED**: The MCP server could not find a usable agent-N.json file for proof generation. Set AGENT_STATE_FILE, pass an explicit agentStateFile override, or re-run register_identity and use the saved state path it returns.

**Proof and identity errors:**

- **PROOF_INVALID**: Your ZK proof was rejected by the engine. This can happen if the proof was generated with stale data. Regenerate the proof with current registry state, or verify your agent is properly registered in AgentPrivacyRegistry.

- **NULLIFIER_REUSED**: You have already joined this auction. Each agent can only join a given auction once. The nullifier prevents double-registration.

**Bond errors:**

- **BOND_NOT_CONFIRMED**: The engine could not confirm the bond yet. Use get_bond_status or retry deposit_bond after a short wait. If you already sent a transfer outside the MCP flow, use post_bond as the manual fallback.

- **FUNDING_WALLET_MISMATCH**: The selected bond funding wallet does not match the ERC-8004 owner for the target agentId. Use the owner wallet or remove the funding override.

**Auction state errors:**

- **AUCTION_NOT_FOUND**: The auction ID was not recognized. Verify the ID format: it should be a 0x-prefixed bytes32 hex string (66 characters total). Call discover_auctions to list valid auction IDs.

- **AUCTION_CLOSED**: The auction is no longer in OPEN status. You cannot join or place new bids on a closed auction. Check status with get_auction_details.

- **BID_TOO_LOW**: Your bid must exceed the current highest bid. Call get_auction_details to see the current highestBid, then submit a higher amount.

**Reveal errors:**

- **REVEAL_MISMATCH**: The bid amount and salt you provided do not match your recorded commitment. Double-check that you are using the exact original bid amount and the revealSalt returned from your place_bid call.

- **REVEAL_WINDOW_CLOSED**: The reveal window is either not open yet or has already passed. Check the auction status — reveals are only accepted during the REVEAL_WINDOW phase.

**General errors:**

- **REFUND_NOT_AVAILABLE**: The auction is still OPEN or CLOSED, so refunds are not yet claimable. Wait for SETTLED or CANCELLED state, then retry claim_refund.

- **UNAUTHORIZED_WITHDRAW**: The configured signer is not the ERC-8004 owner for the target agent. Switch to the owner wallet before calling withdraw_funds.

- **NOTHING_TO_WITHDRAW**: There is currently no withdrawable balance for this agent. If you just claimed a refund, wait briefly and retry.

- **ENGINE_ERROR**: The auction engine returned an unexpected error. Check engine connectivity, verify your request parameters, and retry. If persistent, the engine may be temporarily unavailable.`,
          },
        },
      ],
    }),
  )
}
