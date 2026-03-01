/**
 * place_bid — Sign an EIP-712 Bid message and POST to engine.
 *
 * Requires AGENT_PRIVATE_KEY and AGENT_ID environment variables.
 * Signs the Bid typed data and submits to POST /auctions/:id/action
 * with type=BID.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Hex } from 'viem'
import type { EngineClient } from '../lib/engine.js'
import { ActionSigner } from '../lib/signer.js'
import type { ServerConfig } from '../lib/config.js'
import { requireSignerConfig } from '../lib/config.js'

interface EngineActionResponse {
  seq: number
  eventHash: string
  prevHash: string
  sequencerSig?: string
}

export function registerBidTool(
  server: McpServer,
  engine: EngineClient,
  config: ServerConfig,
  nonceTracker: Map<string, number>,
): void {
  server.registerTool(
    'place_bid',
    {
      title: 'Place Bid',
      description:
        'Place a bid in an auction by signing an EIP-712 Bid message and posting it to the engine. ' +
        'The bid amount must exceed the current highest bid. Requires AGENT_PRIVATE_KEY and AGENT_ID.',
      inputSchema: z.object({
        auctionId: z.string().describe('The 0x-prefixed bytes32 auction ID to bid in'),
        amount: z
          .string()
          .describe('Bid amount in USDC base units (6 decimals). E.g. "100000000" for 100 USDC'),
      }),
    },
    async ({ auctionId, amount }) => {
      const { agentPrivateKey, agentId } = requireSignerConfig(config)
      const signer = new ActionSigner(agentPrivateKey)

      const nonceKey = `BID:${agentId}`
      const nonce = nonceTracker.get(nonceKey) ?? 0

      const payload = await signer.signBid({
        auctionId: auctionId as Hex,
        agentId,
        amount: BigInt(amount),
        nonce,
      })

      const result = await engine.post<EngineActionResponse>(
        `/auctions/${auctionId}/action`,
        payload,
      )

      // Increment nonce on success
      nonceTracker.set(nonceKey, nonce + 1)

      const response = {
        success: true,
        action: 'BID',
        auctionId,
        agentId,
        wallet: signer.address,
        amount,
        nonce,
        seq: result.seq,
        eventHash: result.eventHash,
        prevHash: result.prevHash,
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      }
    },
  )
}
