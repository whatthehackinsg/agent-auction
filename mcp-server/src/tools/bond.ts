/**
 * get_bond_status + post_bond — Bond management tools.
 *
 * get_bond_status: GET /auctions/:id/bonds/:agentId
 * post_bond: POST /auctions/:id/bonds with USDC transfer proof
 *
 * Note: post_bond only submits the bond proof to the engine.
 * The actual USDC transfer must happen on-chain first (via the agent's
 * wallet sending USDC to the AuctionEscrow contract).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { EngineClient } from '../lib/engine.js'
import type { ServerConfig } from '../lib/config.js'
import { requireSignerConfig } from '../lib/config.js'
import { ActionSigner } from '../lib/signer.js'
import { toolError } from '../lib/tool-response.js'

interface BondStatusResponse {
  status: 'NONE' | 'PENDING' | 'CONFIRMED' | 'TIMEOUT'
}

export function registerBondTools(
  server: McpServer,
  engine: EngineClient,
  config: ServerConfig,
): void {
  // ── get_bond_status ─────────────────────────────────────────────────

  server.registerTool(
    'get_bond_status',
    {
      title: 'Get Bond Status',
      description:
        'Check the bond observation status for an agent in an auction. ' +
        'Returns NONE, PENDING, CONFIRMED, or TIMEOUT.',
      inputSchema: z.object({
        auctionId: z.string().describe('The 0x-prefixed bytes32 auction ID'),
        agentId: z
          .string()
          .optional()
          .describe(
            'Agent ID to check. Defaults to the configured AGENT_ID if not provided.',
          ),
      }),
    },
    async ({ auctionId, agentId: inputAgentId }) => {
      const agentId = inputAgentId ?? config.agentId
      if (!agentId) {
        return toolError(
          'MISSING_CONFIG',
          'agentId is required',
          'Provide agentId parameter or set AGENT_ID env var',
        )
      }

      let status: BondStatusResponse
      try {
        status = await engine.get<BondStatusResponse>(
          `/auctions/${auctionId}/bonds/${agentId}`,
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return toolError('ENGINE_ERROR', msg, 'Check engine connectivity and try again')
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { auctionId, agentId, bondStatus: status.status },
              null,
              2,
            ),
          },
        ],
      }
    },
  )

  // ── post_bond ───────────────────────────────────────────────────────

  server.registerTool(
    'post_bond',
    {
      title: 'Post Bond Proof',
      description:
        'Submit a USDC bond transfer proof to the engine for verification. ' +
        'The USDC transfer must have already been executed on-chain (transfer to AuctionEscrow at ' +
        '0x20944f46AB83F7eA40923D7543AF742Da829743c). ' +
        'Provide the transaction hash as proof.',
      inputSchema: z.object({
        auctionId: z.string().describe('The 0x-prefixed bytes32 auction ID'),
        amount: z
          .string()
          .describe('Bond amount in USDC base units (6 decimals). E.g. "50000000" for 50 USDC'),
        txHash: z
          .string()
          .describe('The 0x-prefixed transaction hash of the USDC transfer to escrow'),
      }),
    },
    async ({ auctionId, amount, txHash }) => {
      let agentId: string
      try {
        ;({ agentId } = requireSignerConfig(config))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return toolError('MISSING_CONFIG', msg, 'Set AGENT_PRIVATE_KEY and AGENT_ID env vars')
      }
      const signer = new ActionSigner(config.agentPrivateKey!)
      const depositor = signer.address

      let result: { status: string; txHash: string }
      try {
        result = await engine.post<{ status: string; txHash: string }>(
          `/auctions/${auctionId}/bonds`,
          {
            agentId,
            depositor,
            amount,
            txHash,
          },
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.toLowerCase().includes('bond')) {
          return toolError(
            'BOND_NOT_CONFIRMED',
            msg,
            'Verify the USDC transfer tx hash and amount are correct',
          )
        }
        return toolError('ENGINE_ERROR', msg, 'Check engine connectivity and try again')
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                auctionId,
                agentId,
                depositor,
                amount,
                bondStatus: result.status,
                txHash: result.txHash,
              },
              null,
              2,
            ),
          },
        ],
      }
    },
  )
}
