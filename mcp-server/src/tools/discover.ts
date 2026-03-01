/**
 * discover_auctions — List all auctions from the engine.
 *
 * GET /auctions -> returns list with id, title, status, reserve price,
 * deadline, and participant count (from snapshot).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { EngineClient } from '../lib/engine.js'

interface AuctionRow {
  auction_id: string
  title: string | null
  description: string | null
  status: number
  reserve_price: string
  deposit_amount: string
  deadline: number
  auction_type: string
  max_bid: string | null
  created_at: number
}

interface AuctionsResponse {
  auctions: AuctionRow[]
}

const STATUS_LABELS: Record<number, string> = {
  1: 'OPEN',
  2: 'CLOSED',
  3: 'SETTLED',
  4: 'CANCELLED',
}

export function registerDiscoverTool(server: McpServer, engine: EngineClient): void {
  server.registerTool(
    'discover_auctions',
    {
      title: 'Discover Auctions',
      description:
        'List all auctions from the engine. Returns id, title, status, reserve price, deadline, and auction type for each auction.',
      inputSchema: z.object({
        statusFilter: z
          .enum(['ALL', 'OPEN', 'CLOSED', 'SETTLED', 'CANCELLED'])
          .optional()
          .describe('Filter auctions by status. Defaults to ALL.'),
      }),
    },
    async ({ statusFilter }) => {
      const data = await engine.get<AuctionsResponse>('/auctions')
      let auctions = data.auctions

      if (statusFilter && statusFilter !== 'ALL') {
        const targetStatus = Object.entries(STATUS_LABELS).find(
          ([, label]) => label === statusFilter,
        )
        if (targetStatus) {
          const statusNum = parseInt(targetStatus[0], 10)
          auctions = auctions.filter((a) => a.status === statusNum)
        }
      }

      const now = Math.floor(Date.now() / 1000)
      const result = auctions.map((a) => ({
        auctionId: a.auction_id,
        title: a.title ?? '(untitled)',
        status: STATUS_LABELS[a.status] ?? `UNKNOWN(${a.status})`,
        auctionType: a.auction_type,
        reservePrice: a.reserve_price,
        depositAmount: a.deposit_amount,
        deadline: a.deadline,
        timeRemainingSec: Math.max(a.deadline - now, 0),
        maxBid: a.max_bid,
        createdAt: a.created_at,
      }))

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ auctions: result, count: result.length }, null, 2),
          },
        ],
      }
    },
  )
}
