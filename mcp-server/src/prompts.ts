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

1. **Bonding**: Before joining an auction, you must deposit USDC into the AuctionEscrow contract. The required amount is shown as "depositAmount" in auction details. Use the post_bond tool after making the on-chain transfer.

2. **Joining**: Once bonded, sign and submit a JOIN action. This registers you as a participant and is verified via EIP-712 signature.

3. **Bidding**: Place bids by signing BID actions. Each bid must exceed the current highest bid. Bids are ordered by the engine's monotonic sequencer.

4. **Anti-snipe**: If a bid arrives in the final snipe window (typically 60s), the deadline extends to prevent last-second sniping. Check "snipeWindowSec" and "extensionSec" in auction details.

5. **Settlement**: When the auction closes, the engine records the result on-chain, and Chainlink CRE verifies and settles via the escrow contract. The winner's bond covers payment; losers get refunds.

6. **Event log**: Every action is recorded in a hash-chained event log. Use get_auction_events to audit the full history.

Always check bond status before joining, and monitor time remaining to avoid missing deadlines.`,
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

**Phase 1 — Discovery**
1. Call discover_auctions with statusFilter="OPEN"
2. For each interesting auction, call get_auction_details
3. Evaluate: reserve price, deposit amount, time remaining, participant count

**Phase 2 — Preparation**
1. Transfer USDC to AuctionEscrow (on-chain, outside MCP)
2. Call post_bond with the transaction hash
3. Call get_bond_status to confirm CONFIRMED status

**Phase 3 — Entry**
1. Call join_auction with the auction ID and bond amount
2. Verify success via the returned seq number and event hash

**Phase 4 — Bidding**
1. Call get_auction_details to see current highest bid
2. Call place_bid with your bid amount (must exceed highest)
3. Monitor: periodically re-check details for competing bids
4. Respond to being outbid by placing a higher bid (within budget)

**Phase 5 — Monitoring**
1. Watch timeRemainingSec approaching zero
2. Track extensionCount for anti-snipe extensions
3. Call get_auction_events for full bid history

**Phase 6 — Post-auction**
1. Check auction status transitions: OPEN → CLOSED → SETTLED
2. Settlement happens automatically via Chainlink CRE
3. Winner's bond is applied as payment; losers receive refunds`,
          },
        },
      ],
    }),
  )
}
