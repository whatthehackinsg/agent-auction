'use client'

import useSWR from 'swr'
import { fetcher } from '@/lib/api'

export interface AuctionSummary {
  auction_id: string
  status: number // AuctionState enum: 0=NONE, 1=OPEN, 2=CLOSED, 3=SETTLED, 4=CANCELLED
  reserve_price: string
  deadline: number
  created_at: number
  participant_count?: number
}

export function useAuctions() {
  const { data, error, isLoading, mutate } = useSWR<{ auctions: AuctionSummary[] }>(
    '/auctions',
    fetcher,
    { refreshInterval: 5000 } // Poll every 5s
  )
  return {
    auctions: data?.auctions ?? [],
    isLoading,
    error,
    mutate,
  }
}
