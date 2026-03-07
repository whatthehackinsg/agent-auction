/**
 * reveal_bid — Reveal a sealed bid during the reveal window.
 *
 * In sealed-bid auctions, agents commit to Poseidon(bid, salt) during the OPEN phase
 * (via BID_COMMIT). When the reveal window opens, they call this tool with the
 * plaintext bid and salt to prove they committed to that value.
 *
 * Requires AGENT_PRIVATE_KEY and AGENT_ID environment variables.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Hex } from 'viem'
import type { EngineClient } from '../lib/engine.js'
import { ActionSigner } from '../lib/signer.js'
import type { ServerConfig } from '../lib/config.js'
import { resolveBackendWriteTarget } from '../lib/agent-target.js'
import { toolError } from '../lib/tool-response.js'
import { getEvmWalletProvider } from '../lib/wallet-backend.js'

interface EngineActionResponse {
  seq: number
  eventHash: string
  prevHash: string
  sequencerSig?: string
}

export function registerRevealTool(
  server: McpServer,
  engine: EngineClient,
  config: ServerConfig,
  nonceTracker: Map<string, number>,
): void {
  server.registerTool(
    'reveal_bid',
    {
      title: 'Reveal Bid',
      description:
        'Reveal a sealed bid during the reveal window of a sealed-bid auction. ' +
        'The bid and salt must match the commitment submitted via place_bid (sealed mode). ' +
        'The engine verifies that Poseidon(bid, salt) equals the stored commitment. ' +
        'Requires a configured write backend and AGENT_ID. Supported path: AgentKit + CDP Server Wallet. ' +
        'Advanced bridge: MCP_WALLET_BACKEND=raw-key with AGENT_PRIVATE_KEY.',
      inputSchema: z.object({
        auctionId: z.string().describe('The 0x-prefixed bytes32 auction ID'),
        bid: z
          .string()
          .describe('Plaintext bid amount in USDC base units (must match the sealed commitment)'),
        salt: z
          .string()
          .describe('The reveal salt returned when you placed the sealed bid (decimal bigint string)'),
      }),
    },
    async ({ auctionId, bid, salt }) => {
      let target
      let signer: ActionSigner
      let agentId: string
      try {
        target = resolveBackendWriteTarget(config)
        agentId = target.agentId
        const walletProvider = await getEvmWalletProvider(config)
        signer = new ActionSigner({
          address: walletProvider.wallet,
          signTypedData: (typedData) => walletProvider.signTypedData(typedData),
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return toolError(
          'MISSING_CONFIG',
          msg,
          'Complete the supported AgentKit + CDP Server Wallet setup, or explicitly opt into MCP_WALLET_BACKEND=raw-key for the advanced bridge.',
        )
      }

      const nonceKey = `REVEAL:${agentId}`
      const nonce = nonceTracker.get(nonceKey) ?? 0

      const payload = await signer.signReveal({
        auctionId: auctionId as Hex,
        agentId,
        bid: BigInt(bid),
        salt: BigInt(salt),
        nonce,
      })

      let result: EngineActionResponse
      try {
        result = await engine.post<EngineActionResponse>(
          `/auctions/${auctionId}/action`,
          payload,
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('commitment mismatch')) {
          return toolError(
            'REVEAL_MISMATCH',
            msg,
            'The bid and salt do not match your stored commitment — verify you saved the correct revealSalt from place_bid',
          )
        }
        if (msg.includes('reveal window')) {
          return toolError(
            'REVEAL_WINDOW_CLOSED',
            msg,
            'The reveal window is not currently open — check auction status with get_auction_details',
          )
        }
        return toolError('ENGINE_ERROR', msg, 'Check auction status and your bid/salt values')
      }

      nonceTracker.set(nonceKey, nonce + 1)

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              action: 'REVEAL',
              walletBackend: target.backend.path,
              auctionId,
              agentId,
              wallet: signer.address,
              bid,
              nonce,
              seq: result.seq,
              eventHash: result.eventHash,
              prevHash: result.prevHash,
            }, null, 2),
          },
        ],
      }
    },
  )
}
