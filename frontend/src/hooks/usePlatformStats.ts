'use client'
import useSWR from 'swr'
import { fetcher } from '@/lib/api'

export interface PlatformStats {
  totalAuctions: number
  activeAuctions: number
  settledAuctions: number
  totalUsdcBonded: string
  totalBids: number
  uniqueAgents: number
}

export function usePlatformStats() {
  const { data, error, isLoading } = useSWR<PlatformStats>(
    '/stats',
    fetcher,
    { refreshInterval: 15_000 }  // 15s — matches 10s cache TTL with buffer
  )
  return {
    stats: data ?? null,
    isLoading,
    error,
  }
}
