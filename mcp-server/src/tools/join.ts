/**
 * join_auction — Sign an EIP-712 Join message and POST to engine.
 *
 * Requires AGENT_PRIVATE_KEY and AGENT_ID environment variables.
 * Signs the Join typed data with the correct nullifier derivation,
 * then submits to POST /auctions/:id/action with type=JOIN.
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

export function registerJoinTool(
  server: McpServer,
  engine: EngineClient,
  config: ServerConfig,
  nonceTracker: Map<string, number>,
): void {
  server.registerTool(
    'join_auction',
    {
      title: 'Join Auction',
      description:
        'Join an auction by signing an EIP-712 Join message and posting it to the engine. ' +
        'Requires AGENT_PRIVATE_KEY and AGENT_ID. The agent must have posted a bond before joining.',
      inputSchema: z.object({
        auctionId: z.string().describe('The 0x-prefixed bytes32 auction ID to join'),
        bondAmount: z
          .string()
          .describe('Bond amount in USDC base units (6 decimals). E.g. "50000000" for 50 USDC'),
      }),
    },
    async ({ auctionId, bondAmount }) => {
      const { agentPrivateKey, agentId } = requireSignerConfig(config)
      const signer = new ActionSigner(agentPrivateKey)

      const nonceKey = `JOIN:${agentId}`
      const nonce = nonceTracker.get(nonceKey) ?? 0

      const payload = await signer.signJoin({
        auctionId: auctionId as Hex,
        agentId,
        bondAmount: BigInt(bondAmount),
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
        action: 'JOIN',
        auctionId,
        agentId,
        wallet: signer.address,
        bondAmount,
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
