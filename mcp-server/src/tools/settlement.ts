/**
 * check_settlement_status — Check the settlement state of an auction.
 *
 * GET /auctions/:id -> extracts settlement-focused view from the auction
 * detail response. Useful for post-auction awareness: agents can check
 * whether CRE settlement has completed, who won, and what to do next.
 *
 * This is a READ tool — no signer config needed.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { EngineClient } from '../lib/engine.js'
import { toolError, toolSuccess } from '../lib/tool-response.js'

const STATUS_LABELS: Record<number, string> = {
  1: 'OPEN',
  2: 'CLOSED',
  3: 'SETTLED',
  4: 'CANCELLED',
}

const SETTLEMENT_SUGGESTIONS: Record<string, string> = {
  OPEN: 'Auction still open — settlement happens after close',
  CLOSED: 'Auction closed — CRE settlement in progress',
  SETTLED: "Settlement complete — winner's bond applied as payment",
  CANCELLED: 'Auction cancelled — bonds eligible for refund via claimRefund()',
}

interface RoomSnapshot {
  status: number
  winnerAgentId: string
  winnerWallet: string
  winningBidAmount: string
}

interface AuctionRow {
  auction_id: string
  status: number
}

interface AuctionDetailResponse {
  auction: AuctionRow
  snapshot: RoomSnapshot
}

export function registerSettlementTool(server: McpServer, engine: EngineClient): void {
  server.registerTool(
    'check_settlement_status',
    {
      title: 'Check Settlement Status',
      description:
        'Check the settlement state of an auction. Returns a focused view with ' +
        'status label, whether settlement is complete, winner info, and a contextual ' +
        'suggestion for what to do next. Useful for post-auction monitoring.',
      inputSchema: z.object({
        auctionId: z.string().describe('The 0x-prefixed bytes32 auction ID'),
      }),
    },
    async ({ auctionId }) => {
      let data: AuctionDetailResponse
      try {
        data = await engine.get<AuctionDetailResponse>(`/auctions/${auctionId}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
          return toolError(
            'AUCTION_NOT_FOUND',
            msg,
            'Verify the auction ID is correct (0x-prefixed bytes32)',
          )
        }
        return toolError('ENGINE_ERROR', msg, 'Check engine connectivity and try again')
      }

      const statusNum = data.snapshot.status ?? data.auction.status
      const statusLabel = STATUS_LABELS[statusNum] ?? `UNKNOWN(${statusNum})`
      const suggestion = SETTLEMENT_SUGGESTIONS[statusLabel] ?? 'Unknown auction state'

      return toolSuccess({
        auctionId,
        status: statusLabel,
        isSettled: statusLabel === 'SETTLED',
        winnerAgentId: data.snapshot.winnerAgentId || null,
        winnerWallet: data.snapshot.winnerWallet || null,
        winningBidAmount: data.snapshot.winningBidAmount || null,
        suggestion,
      })
    },
  )
}
