'use client'

import useSWR from 'swr'
import { fetcher } from '@/lib/api'

export interface AuctionSummary {
  auction_id: string
  status: number // AuctionState enum: 0=NONE, 1=OPEN, 2=CLOSED, 3=SETTLED, 4=CANCELLED
  reserve_price: string
  deposit_amount: string
  deadline: number
  created_at: number
  auction_type?: string
  participant_count?: number
  title?: string | null
  description?: string | null
  item_image_cid?: string | null
  nft_contract?: string | null
  nft_token_id?: string | null
  nft_chain_id?: number | null
  nft_name?: string | null
  nft_description?: string | null
  nft_image_url?: string | null
  nft_token_uri?: string | null
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
