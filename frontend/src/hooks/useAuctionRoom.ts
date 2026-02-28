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
}

/**
 * D1 rows from GET /auctions/:id/events use snake_case column names.
 * We normalize them to the camelCase AuctionEvent shape used by WS.
 */
interface D1EventRow {
  seq: number
  event_hash: string
  action_type: string
  agent_id: string
  amount: string
  created_at: number
  [key: string]: unknown
}

function normalizeD1Event(row: D1EventRow): AuctionEvent {
  return {
    type: 'event',
    seq: Number(row.seq),
    eventHash: row.event_hash,
    actionType: row.action_type,
    agentId: row.agent_id,
    amount: row.amount,
    timestamp: Number(row.created_at ?? 0),
  }
}

export function useAuctionRoom(auctionId: string | undefined) {
  const [events, setEvents] = useState<AuctionEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldReconnectRef = useRef(true)

  const wsUrl = useMemo(() => {
    if (!auctionId) return null
    const base = API_BASE_URL.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:')
    return `${base}/auctions/${auctionId}/stream`
  }, [auctionId])

  // ── Fetch historical events from REST on mount ──────────────────
  useEffect(() => {
    if (!auctionId) {
      setHistoryLoaded(false)
      return
    }

    let cancelled = false

    async function loadHistory() {
      try {
        const res = await fetch(`${API_BASE_URL}/auctions/${auctionId}/events`)
        if (!res.ok) return
        const data = (await res.json()) as { events?: D1EventRow[] }
        if (cancelled || !data.events || data.events.length === 0) return

        const normalized = data.events.map(normalizeD1Event)
        setEvents((prev) => {
          // Merge: keep existing WS events that may have arrived while fetching,
          // add historical events that are not already present (by seq).
          const seqSet = new Set(prev.map((e) => e.seq))
          const merged = [...prev]
          for (const evt of normalized) {
            if (!seqSet.has(evt.seq)) {
              merged.push(evt)
              seqSet.add(evt.seq)
            }
          }
          return merged.sort((a, b) => a.seq - b.seq)
        })
      } catch {
        // Non-fatal: WS will still deliver live events.
      } finally {
        if (!cancelled) setHistoryLoaded(true)
      }
    }

    loadHistory()
    return () => {
      cancelled = true
    }
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
        if (message.type !== 'event') {
          return
        }
        setEvents((prev) => {
          if (prev.some((e) => e.seq === message.seq)) {
            return prev
          }
          return [...prev, message].sort((a, b) => a.seq - b.seq)
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
  }, [wsUrl])

  useEffect(() => {
    setEvents([])
    setHistoryLoaded(false)
    if (!auctionId) {
      shouldReconnectRef.current = false
      setIsConnected(false)
      setIsConnecting(false)
      return
    }

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
    historyLoaded,
    connect,
    latestEvent: events[events.length - 1] ?? null,
    highestBid: highestBidEvent ? BigInt(highestBidEvent.amount) : BigInt(0),
    highestBidEvent,
  }
}
