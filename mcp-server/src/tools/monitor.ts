/**
 * monitor_auction — REST-polling monitor with privacy-aware self-recognition.
 *
 * Fetches the current snapshot and recent events for an auction via the
 * engine REST API. Uses the agent's participantToken for privacy-masked
 * responses (agent_id contains zkNullifier, wallet omitted).
 *
 * Self-recognition: if AGENT_STATE_FILE is configured, computes the
 * agent's own nullifiers (JOIN + BID) and annotates each event with
 * `isOwn: true/false` so the agent can identify its own actions
 * without any identity leak.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { deriveNullifierBigInt, ActionType } from '@agent-auction/crypto'
import { loadAgentState } from '../lib/proof-generator.js'
import type { EngineClient } from '../lib/engine.js'
import type { ServerConfig } from '../lib/config.js'
import { toolError, toolSuccess } from '../lib/tool-response.js'

// ── Types ────────────────────────────────────────────────────────────────────

interface SnapshotResponse {
  auctionId: string
  status: string
  highestBid: string
  highestBidder: string
  currentSeq: number
  bidCount?: number
  uniqueBidders?: number
  lastActivitySec?: number
  competitionLevel?: string
  priceIncreasePct?: number
  snipeWindowActive?: boolean
  extensionsRemaining?: number
}

interface EventRow {
  seq: number
  action_type: string
  agent_id: string // Contains zkNullifier after privacy masking
  amount: string
  event_hash: string
  prev_hash: string
  payload_hash: string
  created_at: number
}

interface EventsResponse {
  events: EventRow[]
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerMonitorTool(
  server: McpServer,
  engine: EngineClient,
  config: ServerConfig,
): void {
  server.registerTool(
    'monitor_auction',
    {
      title: 'Monitor Auction',
      description:
        'Poll the current snapshot and recent events for an auction. ' +
        'Events are privacy-masked: agents are identified by zkNullifier only. ' +
        'If AGENT_STATE_FILE is configured, your own events are annotated with isOwn: true. ' +
        'Use sinceSeq for incremental polling (only events after that sequence number).',
      inputSchema: z.object({
        auctionId: z.string().describe('The 0x-prefixed bytes32 auction ID'),
        sinceSeq: z
          .number()
          .optional()
          .describe('Only return events after this sequence number (for incremental polling)'),
      }),
    },
    async ({ auctionId, sinceSeq }) => {
      // 1. Require agentId for participantToken
      if (!config.agentId) {
        return toolError(
          'MISSING_CONFIG',
          'AGENT_ID is required for monitoring',
          'Set AGENT_ID env var',
        )
      }

      // 2. Compute own nullifiers for self-recognition
      let ownNullifiers: Set<string> | null = null
      if (config.agentStateFile) {
        try {
          const agentState = loadAgentState(config.agentStateFile)
          const auctionIdBigInt = BigInt(auctionId)

          const [joinNullifier, bidNullifier] = await Promise.all([
            deriveNullifierBigInt(agentState.agentSecret, auctionIdBigInt, ActionType.JOIN),
            deriveNullifierBigInt(agentState.agentSecret, auctionIdBigInt, ActionType.BID),
          ])

          ownNullifiers = new Set([
            '0x' + joinNullifier.toString(16),
            '0x' + bidNullifier.toString(16),
          ])
        } catch {
          // Graceful degradation: if agent state can't be loaded, skip annotation
          ownNullifiers = null
        }
      }

      // 3. Fetch snapshot and events in parallel
      const participantParam = `participantToken=${encodeURIComponent(config.agentId)}`

      let snapshot: SnapshotResponse
      let eventsData: EventsResponse
      try {
        ;[snapshot, eventsData] = await Promise.all([
          engine.get<SnapshotResponse>(`/auctions/${auctionId}/snapshot?${participantParam}`),
          engine.get<EventsResponse>(`/auctions/${auctionId}/events?${participantParam}`),
        ])
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('403') || msg.toLowerCase().includes('participant')) {
          return toolError(
            'PARTICIPANT_REQUIRED',
            msg,
            'You must join the auction before monitoring -- call join_auction first',
          )
        }
        return toolError('ENGINE_ERROR', msg, 'Check engine connectivity and try again')
      }

      // 4. Filter by sinceSeq
      let events = eventsData.events
      if (sinceSeq !== undefined) {
        events = events.filter((e) => e.seq > sinceSeq)
      }

      // 5. Annotate events
      const annotatedEvents = events.map((e) => ({
        seq: e.seq,
        actionType: e.action_type,
        zkNullifier: e.agent_id,
        amount: e.amount,
        createdAt: e.created_at,
        ...(ownNullifiers ? { isOwn: ownNullifiers.has(e.agent_id) } : {}),
      }))

      // 6. Return structured response
      return toolSuccess({
        auctionId,
        snapshot: {
          status: snapshot.status,
          highestBid: snapshot.highestBid,
          highestBidder: snapshot.highestBidder,
          currentSeq: snapshot.currentSeq,
          bidCount: snapshot.bidCount,
          uniqueBidders: snapshot.uniqueBidders,
          lastActivitySec: snapshot.lastActivitySec,
          competitionLevel: snapshot.competitionLevel,
          priceIncreasePct: snapshot.priceIncreasePct,
          snipeWindowActive: snapshot.snipeWindowActive,
          extensionsRemaining: snapshot.extensionsRemaining,
        },
        events: annotatedEvents,
        eventCount: annotatedEvents.length,
        sinceSeq: sinceSeq ?? 0,
        latestSeq: snapshot.currentSeq,
      })
    },
  )
}
