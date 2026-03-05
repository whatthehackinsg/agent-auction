/**
 * get_auction_events — Retrieve the privacy-masked event log for an auction.
 *
 * Gated to participants: the calling agent must have joined the auction
 * (verified via bond status or JOIN event) to access the event log.
 * Non-participants get a 403 from the engine's participant gate.
 *
 * After privacy masking (Phase 08), the engine returns events where the
 * `agent_id` field contains the zkNullifier (not the real agentId) and
 * the `wallet` field is omitted. This tool maps accordingly.
 *
 * GET /auctions/:id/events?participantToken=<agentId> -> returns privacy-masked event log
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { EngineClient } from '../lib/engine.js'
import { toolError } from '../lib/tool-response.js'

interface EventRow {
  seq: number
  auction_id: string
  action_type: string
  agent_id: string        // Contains zkNullifier when participant-masked
  wallet?: string          // Omitted in participant-masked responses
  amount: string
  event_hash: string
  prev_hash: string
  payload_hash: string
  created_at: number
  zk_nullifier?: string   // May be present in raw (admin) responses
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
        'Retrieve the privacy-masked event log for an auction. ' +
        'Events identify agents by zkNullifier only (no agentId or wallet). ' +
        'Requires the calling agent to be a participant.',
      inputSchema: z.object({
        auctionId: z.string().describe('The 0x-prefixed bytes32 auction ID'),
        agentId: z
          .string()
          .optional()
          .describe('Your agent ID to verify participant status. Required if the engine gates events to participants.'),
        limit: z
          .number()
          .optional()
          .describe('Maximum number of recent events to return. Defaults to all.'),
      }),
    },
    async ({ auctionId, agentId, limit }) => {
      // Build the events URL with participant token if agent ID provided
      const params = agentId ? `?participantToken=${encodeURIComponent(agentId)}` : ''
      let data: EventsResponse
      try {
        data = await engine.get<EventsResponse>(`/auctions/${auctionId}/events${params}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('403') || msg.toLowerCase().includes('participant')) {
          return toolError(
            'PARTICIPANT_REQUIRED',
            msg,
            'You must join the auction before accessing events — call join_auction first',
          )
        }
        return toolError('ENGINE_ERROR', msg, 'Check engine connectivity and try again')
      }
      let events = data.events

      if (limit !== undefined && limit > 0) {
        events = events.slice(-limit)
      }

      const result = events.map((e) => ({
        seq: e.seq,
        actionType: e.action_type,
        zkNullifier: e.agent_id,   // After privacy masking, agent_id IS the nullifier
        amount: e.amount,
        eventHash: e.event_hash,
        prevHash: e.prev_hash,
        createdAt: e.created_at,
        // wallet intentionally omitted — privacy masking
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
