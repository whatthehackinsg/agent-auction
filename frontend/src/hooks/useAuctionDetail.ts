'use client'

import useSWR from 'swr'
import { fetcher } from '@/lib/api'
import type { AuctionSummary } from './useAuctions'

export interface AuctionDetailResponse {
  auction: AuctionSummary
  snapshot: {
    auctionId: string
    currentSeq: number
    headHash: string
    participantCount: number
    highestBid: string
    highestBidder: string
    startedAt: number
    deadline: number
    bidCount?: number
    uniqueBidders?: number
    competitionLevel?: 'low' | 'medium' | 'high'
    priceIncreasePct?: number
    snipeWindowActive?: boolean
    extensionsRemaining?: number
  }
  nftEscrowState?: string | null
}

export function useAuctionDetail(auctionId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<AuctionDetailResponse>(
    auctionId ? `/auctions/${auctionId}` : null,
    fetcher,
    { refreshInterval: 5000 },
  )

  return {
    detail: data ?? null,
    isLoading,
    error,
    mutate,
  }
}
