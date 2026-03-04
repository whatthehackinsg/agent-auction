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

1. **Commit phase (auction status: OPEN)**: Call place_bid with sealed=true. The engine generates a Poseidon(bid, salt) commitment hash that is recorded on the event log. Your actual bid amount is hidden from other participants.

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

**Step 2 — Transfer USDC on-chain**
Send USDC to the AuctionEscrow contract on Base Sepolia (chain ID 84532):
- AuctionEscrow address: 0x20944f46AB83F7eA40923D7543AF742Da829743c
- USDC contract (MockUSDC): 0xfEE786495d165b16dc8e68B6F8281193e041737d
- Transfer the exact depositAmount to the AuctionEscrow address
- Save the transaction hash from the transfer

**Step 3 — Submit bond proof**
Call post_bond with:
- auctionId: the target auction ID
- amount: the deposit amount (must match what you transferred)
- txHash: the on-chain transaction hash from Step 2

**Step 4 — Poll for confirmation**
Call get_bond_status with the auctionId. The bond transitions through states:
- NONE: No bond observed yet
- PENDING: Transfer detected, awaiting block confirmations
- CONFIRMED: Bond verified on-chain (usually within 1-2 blocks)
- TIMEOUT: Observation window expired without confirmation

Keep polling until status is "CONFIRMED". This typically takes a few seconds.

**Step 5 — Join the auction**
Once bond status is CONFIRMED, call join_auction with the auctionId and bondAmount.

**Post-auction notes:**
- If you win: your bond is applied as payment during CRE settlement.
- If you lose: call claimRefund() directly on the AuctionEscrow contract on-chain after settlement to reclaim your deposit.
- Bond is always safe — it is held in escrow and only released through CRE settlement or refund claims.`,
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

- **MISSING_CONFIG**: Required environment variables are not set. Ensure AGENT_PRIVATE_KEY (hex-encoded secp256k1 private key) and AGENT_ID (numeric agent ID from ERC-8004 registry) are configured.

- **AGENT_NOT_REGISTERED**: ZK proof generation requires agent state. Set AGENT_STATE_FILE to the path of your agent's ZK state file containing registration proof data.

- **STALE_ROOT**: The cached privacy registry Merkle root is outdated. Set BASE_SEPOLIA_RPC to a valid Base Sepolia RPC endpoint so the MCP server can fetch the current on-chain root from AgentPrivacyRegistry.

**Proof and identity errors:**

- **PROOF_INVALID**: Your ZK proof was rejected by the engine. This can happen if the proof was generated with stale data. Regenerate the proof with current registry state, or verify your agent is properly registered in AgentPrivacyRegistry.

- **NULLIFIER_REUSED**: You have already joined this auction. Each agent can only join a given auction once. The nullifier prevents double-registration.

**Bond errors:**

- **BOND_NOT_CONFIRMED**: Your bond has not been confirmed yet. Either you have not posted a bond, or it is still PENDING. Call get_bond_status to check. If PENDING, wait for block confirmation. If NONE, you need to transfer USDC and call post_bond first.

**Auction state errors:**

- **AUCTION_NOT_FOUND**: The auction ID was not recognized. Verify the ID format: it should be a 0x-prefixed bytes32 hex string (66 characters total). Call discover_auctions to list valid auction IDs.

- **AUCTION_CLOSED**: The auction is no longer in OPEN status. You cannot join or place new bids on a closed auction. Check status with get_auction_details.

- **BID_TOO_LOW**: Your bid must exceed the current highest bid. Call get_auction_details to see the current highestBid, then submit a higher amount.

**Reveal errors:**

- **REVEAL_MISMATCH**: The bid amount and salt you provided do not match your recorded commitment. Double-check that you are using the exact original bid amount and the revealSalt returned from your place_bid call.

- **REVEAL_WINDOW_CLOSED**: The reveal window is either not open yet or has already passed. Check the auction status — reveals are only accepted during the REVEAL_WINDOW phase.

**General errors:**

- **ENGINE_ERROR**: The auction engine returned an unexpected error. Check engine connectivity, verify your request parameters, and retry. If persistent, the engine may be temporarily unavailable.`,
          },
        },
      ],
    }),
  )
}
