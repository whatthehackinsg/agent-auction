/**
 * get_auction_events — Retrieve the event log for an auction.
 *
 * GET /auctions/:id/events -> returns the append-only event log
 * with seq numbers, action types, agent IDs, amounts, and hashes.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { EngineClient } from '../lib/engine.js'

interface EventRow {
  seq: number
  auction_id: string
  action_type: string
  agent_id: string
  wallet: string
  amount: string
  event_hash: string
  prev_hash: string
  payload_hash: string
  created_at: number
}

interface EventsResponse {
  events: EventRow[]
}

export function registerEventsTool(server: McpServer, engine: EngineClient): void {
  server.registerTool(
    'get_auction_events',
    {
      title: 'Get Auction Events',
      description:
        'Retrieve the append-only event log for an auction. Events are ordered by sequence number ' +
        'and include action type (JOIN/BID/DELIVER), agent ID, wallet, amount, and hash chain data.',
      inputSchema: z.object({
        auctionId: z.string().describe('The 0x-prefixed bytes32 auction ID'),
        limit: z
          .number()
          .optional()
          .describe('Maximum number of recent events to return. Defaults to all.'),
      }),
    },
    async ({ auctionId, limit }) => {
      const data = await engine.get<EventsResponse>(`/auctions/${auctionId}/events`)
      let events = data.events

      if (limit !== undefined && limit > 0) {
        events = events.slice(-limit)
      }

      const result = events.map((e) => ({
        seq: e.seq,
        actionType: e.action_type,
        agentId: e.agent_id,
        wallet: e.wallet,
        amount: e.amount,
        eventHash: e.event_hash,
        prevHash: e.prev_hash,
        createdAt: e.created_at,
      }))

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { auctionId, events: result, count: result.length },
              null,
              2,
            ),
          },
        ],
      }
    },
  )
}
