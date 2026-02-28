'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/api'
import type { AuctionSummary } from './useAuctions'

// ── D1 event row shape (snake_case from SELECT * on events table) ────
export interface EventRow {
  id: number
  auction_id: string
  seq: number
  prev_hash: string
  event_hash: string
  payload_hash: string
  action_type: string
  agent_id: string
  wallet: string
  amount: string
  created_at: number
}

// ── Bond status from GET /auctions/:id/bonds/:agentId ────────────────
export type BondStatusKind = 'NONE' | 'PENDING' | 'CONFIRMED' | 'TIMEOUT'

export interface BondStatusResult {
  status: BondStatusKind
  auctionId: string
  agentId: string
  depositor?: string
  amount?: string
  requestedAt?: number
  confirmedAt?: number
  observedTxHash?: string
  observedLogIndex?: number
}

// ── Aggregated participation entry ───────────────────────────────────
export interface AuctionParticipation {
  auction: AuctionSummary
  events: EventRow[]
  bidCount: number
  highestBid: bigint
  firstSeen: number
  lastSeen: number
  bond: BondStatusResult | null
}

// ── Agent profile stats ──────────────────────────────────────────────
export interface AgentProfileStats {
  totalAuctions: number
  totalBids: number
  highestBidEver: bigint
  wins: number
  wallets: string[]
}

// ── Hook return type ─────────────────────────────────────────────────
export interface AgentProfileData {
  agentId: string
  participations: AuctionParticipation[]
  stats: AgentProfileStats
  isLoading: boolean
  error: Error | undefined
}

/**
 * Aggregates an agent-centric view across all auctions.
 *
 * Fetching strategy (to avoid N+1):
 * 1. Fetch the auctions list
 * 2. For each auction, fetch its events in parallel
 * 3. Filter events where agent_id matches
 * 4. For auctions with participation, fetch bond status in parallel
 */
export function useAgentProfile(agentId: string | undefined): AgentProfileData {
  // Step 1: Fetch all auctions
  const {
    data: auctionsData,
    error: auctionsError,
    isLoading: auctionsLoading,
  } = useSWR<{ auctions: AuctionSummary[] }>(
    agentId ? '/auctions' : null,
    fetcher,
    { refreshInterval: 10_000 },
  )

  const auctions = auctionsData?.auctions ?? []

  // Step 2: Fetch events for all auctions in a single SWR key
  // This batches all event fetches into one cache entry to avoid N individual SWR hooks
  const {
    data: allEventsMap,
    error: eventsError,
    isLoading: eventsLoading,
  } = useSWR<Record<string, EventRow[]>>(
    agentId && auctions.length > 0
      ? ['agent-events', agentId, auctions.map((a) => a.auction_id).join(',')]
      : null,
    async () => {
      const results = await Promise.all(
        auctions.map(async (auction) => {
          try {
            const data = await fetcher<{ events: EventRow[] }>(
              `/auctions/${auction.auction_id}/events`,
            )
            return { auctionId: auction.auction_id, events: data.events ?? [] }
          } catch {
            return { auctionId: auction.auction_id, events: [] }
          }
        }),
      )
      const map: Record<string, EventRow[]> = {}
      for (const r of results) {
        map[r.auctionId] = r.events
      }
      return map
    },
    { refreshInterval: 15_000 },
  )

  // Step 3: Determine which auctions this agent participated in
  const participatedAuctionIds = useMemo(() => {
    if (!allEventsMap || !agentId) return []
    return Object.entries(allEventsMap)
      .filter(([, events]) => events.some((e) => e.agent_id === agentId))
      .map(([auctionId]) => auctionId)
  }, [allEventsMap, agentId])

  // Step 4: Fetch bond status for participated auctions
  const {
    data: bondsMap,
    error: bondsError,
    isLoading: bondsLoading,
  } = useSWR<Record<string, BondStatusResult>>(
    agentId && participatedAuctionIds.length > 0
      ? ['agent-bonds', agentId, participatedAuctionIds.join(',')]
      : null,
    async () => {
      const results = await Promise.all(
        participatedAuctionIds.map(async (auctionId) => {
          try {
            const data = await fetcher<BondStatusResult>(
              `/auctions/${auctionId}/bonds/${agentId}`,
            )
            return { auctionId, bond: data }
          } catch {
            return { auctionId, bond: null }
          }
        }),
      )
      const map: Record<string, BondStatusResult> = {}
      for (const r of results) {
        if (r.bond) {
          map[r.auctionId] = r.bond
        }
      }
      return map
    },
    { refreshInterval: 30_000 },
  )

  // Step 5: Aggregate into participations and stats
  const { participations, stats } = useMemo(() => {
    if (!allEventsMap || !agentId) {
      return {
        participations: [] as AuctionParticipation[],
        stats: {
          totalAuctions: 0,
          totalBids: 0,
          highestBidEver: BigInt(0),
          wins: 0,
          wallets: [],
        } as AgentProfileStats,
      }
    }

    const walletsSet = new Set<string>()
    let totalBids = 0
    let highestBidEver = BigInt(0)
    let wins = 0

    const parts: AuctionParticipation[] = []

    for (const auction of auctions) {
      const events = allEventsMap[auction.auction_id] ?? []
      const agentEvents = events.filter((e) => e.agent_id === agentId)

      if (agentEvents.length === 0) continue

      const bidEvents = agentEvents.filter((e) => e.action_type === 'BID')
      let highestBid = BigInt(0)
      let firstSeen = Infinity
      let lastSeen = 0

      for (const e of agentEvents) {
        // Collect wallets
        if (e.wallet) walletsSet.add(e.wallet)

        // Track timestamps
        if (e.created_at < firstSeen) firstSeen = e.created_at
        if (e.created_at > lastSeen) lastSeen = e.created_at

        // Track bids
        if (e.action_type === 'BID') {
          const amount = BigInt(e.amount)
          if (amount > highestBid) highestBid = amount
          if (amount > highestBidEver) highestBidEver = amount
        }
      }

      totalBids += bidEvents.length

      // Check if this agent won: look for CLOSE events or check all bids
      // The winner is the agent with the highest bid across ALL agents in the auction
      const allBids = events.filter((e) => e.action_type === 'BID')
      if (allBids.length > 0) {
        const topBid = allBids.reduce((max, e) => {
          const amount = BigInt(e.amount)
          return amount > BigInt(max.amount) ? e : max
        }, allBids[0])
        if (topBid.agent_id === agentId) {
          wins++
        }
      }

      parts.push({
        auction,
        events: agentEvents,
        bidCount: bidEvents.length,
        highestBid,
        firstSeen: firstSeen === Infinity ? 0 : firstSeen,
        lastSeen,
        bond: bondsMap?.[auction.auction_id] ?? null,
      })
    }

    // Sort by most recent participation first
    parts.sort((a, b) => b.lastSeen - a.lastSeen)

    return {
      participations: parts,
      stats: {
        totalAuctions: parts.length,
        totalBids,
        highestBidEver,
        wins,
        wallets: [...walletsSet],
      },
    }
  }, [allEventsMap, bondsMap, auctions, agentId])

  const isLoading = auctionsLoading || eventsLoading || bondsLoading
  const error = auctionsError ?? eventsError ?? bondsError

  return {
    agentId: agentId ?? '',
    participations,
    stats,
    isLoading,
    error,
  }
}
