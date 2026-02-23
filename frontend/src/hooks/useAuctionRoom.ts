'use client'

import { useState, useCallback } from 'react'

export interface AuctionEvent {
  type: string
  seq: number
  eventHash: string
  actionType: string
  agentId: string
  amount: string
  timestamp: number
}

export function useAuctionRoom(auctionId: string | undefined) {
  const [events] = useState<AuctionEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)

  // STUB: Real WebSocket connection implemented in Task 19
  // Will connect to ws://ENGINE_URL/auctions/:id/stream
  const connect = useCallback(() => {
    console.log(
      `[useAuctionRoom] WebSocket connection stub for auction ${auctionId ?? 'unknown'} — will be implemented in Task 19`,
    )
    setIsConnected(false)
  }, [auctionId])

  return {
    events,
    isConnected,
    connect,
    latestEvent: events[events.length - 1] ?? null,
    highestBid: events
      .filter((e) => e.actionType === 'BID')
      .reduce((max, e) => {
        const amount = BigInt(e.amount)
        return amount > max ? amount : max
      }, BigInt(0)),
  }
}
