'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AuctionEvent, SceneAgent, SceneBidAnimation, SceneComboState } from './types'
import { agentPalette, agentHeadShape } from './utils'

/** How long an agent's "bidding" state lasts (ms). */
const BID_HIGHLIGHT_DURATION = 800

/** Combo window — bids within this many ms count as a combo. */
const COMBO_WINDOW_MS = 2000

/** Combo decay — reset after this many ms of no bids. */
const COMBO_DECAY_MS = 3000

/** Slam/flash duration (ms). */
const SLAM_DURATION = 400
const FLASH_DURATION = 500

/** How long the "NEW CHALLENGER" entry banner shows (ms). */
const ENTRY_BANNER_DURATION = 2200

interface DerivedState {
  agents: Map<string, SceneAgent>
  highestBidValue: string
  highestBidAgentId: string | null
  seatMap: Map<string, number>
}

/**
 * Hook that processes AuctionEvent[] into animated scene state.
 * Tracks agents, bid animations, combo counter, chaos mode,
 * entry banners, and winner state.
 */
export function useAuctionScene(events: AuctionEvent[]) {
  // --- Transient animation state (not derived from events) ---
  const [activeBids, setActiveBids] = useState<SceneBidAnimation[]>([])
  const [biddingAgents, setBiddingAgents] = useState<Set<string>>(new Set())
  const [combo, setCombo] = useState<SceneComboState>({ count: 0, lastBidTimestamp: 0 })
  const [isSlamming, setIsSlamming] = useState(false)
  const [isBoardFlashing, setIsBoardFlashing] = useState(false)

  // Entry banner queue — shows one agent at a time
  const [entryBannerAgent, setEntryBannerAgent] = useState<string | null>(null)
  const entryQueueRef = useRef<string[]>([])
  const entryTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  const processedSeqRef = useRef<Set<number>>(new Set())
  const knownAgentsRef = useRef<Set<string>>(new Set())
  const bidTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const slamTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const comboDecayRef = useRef<ReturnType<typeof setTimeout>>(null)
  const seatCounterRef = useRef(0)
  const seatMapRef = useRef<Map<string, number>>(new Map())

  // --- Derived state from events (pure computation, no side effects) ---
  const derived: DerivedState = useMemo(() => {
    const agentsMap = new Map<string, SceneAgent>()
    let highestBid = BigInt(0)
    let highestBidStr = '0'
    let highestBidAgent: string | null = null
    const seatMap = seatMapRef.current

    for (const e of events) {
      if (!seatMap.has(e.agentId)) {
        seatMap.set(e.agentId, seatCounterRef.current % 8)
        seatCounterRef.current += 1
      }

      const palette = agentPalette(e.agentId)
      const headShape = agentHeadShape(e.agentId)
      const seatIndex = seatMap.get(e.agentId) ?? 0

      if (e.actionType === 'JOIN' || e.actionType === 'BID') {
        if (!agentsMap.has(e.agentId)) {
          agentsMap.set(e.agentId, {
            agentId: e.agentId,
            seatIndex,
            hue: palette.hue,
            color: palette.color,
            colorDim: palette.dim,
            headShape,
            lastBidAt: 0,
            isBidding: false,
            bidCount: 0,
          })
        }
      }

      if (e.actionType === 'LEAVE') {
        agentsMap.delete(e.agentId)
      }

      if (e.actionType === 'BID') {
        const agent = agentsMap.get(e.agentId)
        if (agent) {
          agent.lastBidAt = e.timestamp
          agent.bidCount += 1
        }
        const amount = BigInt(e.amount)
        if (amount > highestBid) {
          highestBid = amount
          highestBidStr = e.amount
          highestBidAgent = e.agentId
        }
      }
    }

    seatMapRef.current = seatMap
    return { agents: agentsMap, highestBidValue: highestBidStr, highestBidAgentId: highestBidAgent, seatMap }
  }, [events])

  // --- Process new events for animations ---
  const prevEventsLenRef = useRef(0)

  useEffect(() => {
    const prevLen = prevEventsLenRef.current
    const currentLen = events.length
    prevEventsLenRef.current = currentLen

    if (currentLen <= prevLen) return

    const newEvents = events.slice(prevLen)
    const newBids: SceneBidAnimation[] = []
    const newJoins: string[] = []
    let latestBidTimestamp = 0

    for (const e of newEvents) {
      // Track new agent joins for entry banner
      if (e.actionType === 'JOIN' && !knownAgentsRef.current.has(e.agentId)) {
        knownAgentsRef.current.add(e.agentId)
        newJoins.push(e.agentId)
      }

      if (e.actionType !== 'BID') continue
      if (processedSeqRef.current.has(e.seq)) continue
      processedSeqRef.current.add(e.seq)

      // Also mark as known if we see a BID before JOIN
      knownAgentsRef.current.add(e.agentId)

      const palette = agentPalette(e.agentId)
      const seatIndex = derived.seatMap.get(e.agentId) ?? 0

      newBids.push({
        id: `bid-${e.seq}-${e.agentId}`,
        agentId: e.agentId,
        amount: e.amount,
        seatIndex,
        color: palette.color,
        timestamp: e.timestamp,
      })
      latestBidTimestamp = e.timestamp

      // Mark agent as bidding temporarily
      const existingTimer = bidTimersRef.current.get(e.agentId)
      if (existingTimer) clearTimeout(existingTimer)

      const agentId = e.agentId
      queueMicrotask(() => {
        setBiddingAgents((prev) => new Set(prev).add(agentId))
      })
      const timer = setTimeout(() => {
        setBiddingAgents((prev) => {
          const next = new Set(prev)
          next.delete(agentId)
          return next
        })
        bidTimersRef.current.delete(agentId)
      }, BID_HIGHLIGHT_DURATION)
      bidTimersRef.current.set(agentId, timer)
    }

    // Queue entry banners for new joins
    if (newJoins.length > 0) {
      entryQueueRef.current.push(...newJoins)
      showNextEntryBannerRef.current()
    }

    if (newBids.length === 0) return

    // Fire animations via microtask to satisfy React 19 lint
    queueMicrotask(() => {
      setActiveBids((prev) => [...prev, ...newBids])
      setIsSlamming(true)
      setIsBoardFlashing(true)

      setCombo((prev) => {
        const timeSinceLastBid = (latestBidTimestamp - prev.lastBidTimestamp) * 1000
        if (prev.lastBidTimestamp > 0 && timeSinceLastBid < COMBO_WINDOW_MS) {
          return { count: prev.count + newBids.length, lastBidTimestamp: latestBidTimestamp }
        }
        return { count: newBids.length > 1 ? newBids.length : 1, lastBidTimestamp: latestBidTimestamp }
      })
    })

    // Reset slam after delay
    if (slamTimerRef.current) clearTimeout(slamTimerRef.current)
    slamTimerRef.current = setTimeout(() => setIsSlamming(false), SLAM_DURATION)

    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setIsBoardFlashing(false), FLASH_DURATION)

    // Combo decay
    if (comboDecayRef.current) clearTimeout(comboDecayRef.current)
    comboDecayRef.current = setTimeout(() => {
      setCombo((prev) => ({ count: 0, lastBidTimestamp: prev.lastBidTimestamp }))
    }, COMBO_DECAY_MS)
  }, [events, derived.seatMap])

  // --- Entry banner queue processor ---
  const showNextEntryBannerRef = useRef<() => void>(() => {})
  showNextEntryBannerRef.current = () => {
    if (entryTimerRef.current) return // already showing one
    const next = entryQueueRef.current.shift()
    if (!next) return
    setEntryBannerAgent(next)
    entryTimerRef.current = setTimeout(() => {
      setEntryBannerAgent(null)
      entryTimerRef.current = null
      // Show next in queue if any
      showNextEntryBannerRef.current()
    }, ENTRY_BANNER_DURATION)
  }

  const dismissEntryBanner = useCallback(() => {
    setEntryBannerAgent(null)
    if (entryTimerRef.current) {
      clearTimeout(entryTimerRef.current)
      entryTimerRef.current = null
    }
    // Show next in queue
    const next = entryQueueRef.current.shift()
    if (next) {
      setEntryBannerAgent(next)
      entryTimerRef.current = setTimeout(() => {
        setEntryBannerAgent(null)
        entryTimerRef.current = null
        showNextEntryBannerRef.current()
      }, ENTRY_BANNER_DURATION)
    }
  }, [])

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = bidTimersRef.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
      if (slamTimerRef.current) clearTimeout(slamTimerRef.current)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      if (comboDecayRef.current) clearTimeout(comboDecayRef.current)
      if (entryTimerRef.current) clearTimeout(entryTimerRef.current)
    }
  }, [])

  // Remove a bid animation by id
  const removeBid = useCallback((bidId: string) => {
    setActiveBids((prev) => prev.filter((b) => b.id !== bidId))
  }, [])

  // Merge bidding state into agents
  const agents = useMemo(() => {
    return Array.from(derived.agents.values()).map((agent) => ({
      ...agent,
      isBidding: biddingAgents.has(agent.agentId),
    }))
  }, [derived.agents, biddingAgents])

  const isChaosMode = combo.count >= 3

  return {
    agents,
    activeBids,
    combo,
    isChaosMode,
    isSlamming,
    isBoardFlashing,
    highestBidValue: derived.highestBidValue,
    highestBidAgentId: derived.highestBidAgentId,
    removeBid,
    entryBannerAgent,
    dismissEntryBanner,
  }
}
