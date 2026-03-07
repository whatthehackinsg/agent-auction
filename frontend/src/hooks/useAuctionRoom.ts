'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE_URL } from '@/lib/api'

export interface AuctionEvent {
  type: string
  seq: number
  eventHash: string
  actionType: string
  agentId: string
  amount: string
  timestamp: number
  wallet?: string // may be present from WS, stripped for display
  zkNullifier?: string    // Poseidon nullifier from RegistryMembership proof (JOIN events)
  bidCommitment?: string  // Bid commitment hash from BidRange proof (BID events)
}

const MAX_CACHED_EVENTS = 50
const auctionRoomEventCache = new Map<string, AuctionEvent[]>()

function storageKey(auctionId: string): string {
  return `auction-room-events:${auctionId}`
}

function normalizeEvents(events: AuctionEvent[]): AuctionEvent[] {
  return [...events]
    .sort((a, b) => a.seq - b.seq)
    .slice(-MAX_CACHED_EVENTS)
}

function persistEvents(auctionId: string, events: AuctionEvent[]): AuctionEvent[] {
  const normalized = normalizeEvents(events)
  auctionRoomEventCache.set(auctionId, normalized)

  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(storageKey(auctionId), JSON.stringify(normalized))
    } catch {
      // Ignore sessionStorage failures and keep the in-memory cache.
    }
  }

  return normalized
}

function loadCachedEvents(auctionId: string | undefined): AuctionEvent[] {
  if (!auctionId) return []

  const memoryCached = auctionRoomEventCache.get(auctionId)
  if (memoryCached) {
    return memoryCached
  }

  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.sessionStorage.getItem(storageKey(auctionId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as AuctionEvent[]
    if (!Array.isArray(parsed)) return []
    return persistEvents(auctionId, parsed)
  } catch {
    return []
  }
}

function mergeEvent(events: AuctionEvent[], incoming: AuctionEvent): AuctionEvent[] {
  if (events.some((event) => event.seq === incoming.seq)) {
    return events
  }
  return normalizeEvents([...events, incoming])
}

function maskAgentId(agentId: string): string {
  if (agentId === '0') return '0'
  if (agentId.startsWith('Agent ●●●●')) return agentId
  const suffix = agentId.length >= 2 ? agentId.slice(-2) : agentId
  return `Agent ●●●●${suffix}`
}

export function useAuctionRoom(auctionId: string | undefined) {
  const [events, setEvents] = useState<AuctionEvent[]>(() => loadCachedEvents(auctionId))
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldReconnectRef = useRef(true)

  const wsUrl = useMemo(() => {
    if (!auctionId) return null
    const base = API_BASE_URL.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:')
    return `${base}/auctions/${auctionId}/stream`
  }, [auctionId])

  // ── WebSocket connection ────────────────────────────────────────
  const connect = useCallback(() => {
    if (!wsUrl) return
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return

    setIsConnecting(true)
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      setIsConnecting(false)
    }

    ws.onmessage = (ev) => {
      try {
        const message = JSON.parse(ev.data as string) as AuctionEvent
        if (message.type !== 'event') return

        // Mask agent identity for public display
        const maskedMessage: AuctionEvent = {
          ...message,
          agentId: maskAgentId(message.agentId),
          wallet: undefined, // strip wallet for display
        }

        setEvents((prev) => {
          const next = mergeEvent(prev, maskedMessage)
          if (next === prev || !auctionId) return next
          return persistEvents(auctionId, next)
        })
      } catch {
        // Ignore malformed messages.
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      setIsConnecting(false)
      if (!shouldReconnectRef.current) {
        return
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      reconnectTimerRef.current = setTimeout(() => {
        connect()
      }, 1500)
    }

    ws.onerror = () => {
      setIsConnected(false)
      setIsConnecting(false)
    }
  }, [auctionId, wsUrl])

  useEffect(() => {
    if (!auctionId) {
      setEvents([])
      shouldReconnectRef.current = false
      setIsConnected(false)
      setIsConnecting(false)
      return
    }

    setEvents(loadCachedEvents(auctionId))
    shouldReconnectRef.current = true
    connect()

    return () => {
      shouldReconnectRef.current = false
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
        wsRef.current.close()
      }
      wsRef.current = null
    }
  }, [auctionId, connect])

  const highestBidEvent = useMemo(() => {
    const bids = events.filter((e) => e.actionType === 'BID')
    if (bids.length === 0) return null
    return bids.reduce((max, e) => {
      const amount = BigInt(e.amount)
      return amount > BigInt(max.amount) ? e : max
    }, bids[0])
  }, [events])

  return {
    events,
    isConnected,
    isConnecting,
    connect,
    latestEvent: events[events.length - 1] ?? null,
    highestBid: highestBidEvent ? BigInt(highestBidEvent.amount) : BigInt(0),
    highestBidEvent,
  }
}
