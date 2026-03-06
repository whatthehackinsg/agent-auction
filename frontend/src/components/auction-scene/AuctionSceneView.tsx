'use client'

import { useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { formatCountdown, truncateHex } from '@/lib/format'
import type { AuctionSceneViewProps } from './types'
import { useAuctionScene } from './useAuctionScene'
import { RoomFloor } from './RoomFloor'
import { AgentRobot } from './AgentRobot'
import { HostAuctioneer } from './HostAuctioneer'
import { FlipBoard } from './FlipBoard'
import { BidBeam } from './BidBeam'
import { FloatingNumber } from './FloatingNumber'
import { ComboCounter } from './ComboCounter'
import { NewsTicker } from './NewsTicker'
import { WinnerCelebration } from './WinnerCelebration'
import { AgentEntryBanner } from './AgentEntryBanner'

/**
 * AuctionSceneView — "The Pixel Pit"
 *
 * An isometric neon arcade auction room where cute pixel robot agents
 * bid against each other. Features:
 * - Checkered floor with neon glow pools
 * - Pixel robot agents with unique colors
 * - Host/auctioneer with gavel slam
 * - Mechanical flip-digit price board
 * - Neon bid beams + floating damage numbers
 * - Combo counter for rapid bids
 * - "NEW CHALLENGER" entry banner on agent join
 * - Winner celebration with confetti on settlement
 * - News ticker at the bottom
 */
export function AuctionSceneView(props: AuctionSceneViewProps) {
  const { auctionId, events, isConnected, participantCount, deadline, status } = props
  const {
    agents,
    activeBids,
    combo,
    isChaosMode,
    isSlamming,
    isBoardFlashing,
    highestBidValue,
    highestBidAgentId,
    removeBid,
    entryBannerAgent,
    dismissEntryBanner,
  } = useAuctionScene(events)

  const handleBeamComplete = useCallback(
    () => {
      // Beam done — we keep the floating number alive separately
    },
    []
  )

  const handleNumberComplete = useCallback(
    (bidId: string) => {
      removeBid(bidId)
    },
    [removeBid]
  )

  const isSettled = status === 'SETTLED' || status === 'CLOSED'

  return (
    <div className="relative flex flex-col overflow-hidden border border-[#1a2a40] bg-[#04050a]">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-[#1a2a40] bg-[#060a14]/90 px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-[#5e4a2a]">
            [ :: PIXEL_PIT :: ]
          </span>
          <span className="font-mono text-[10px] font-bold text-[#F5C46E]">
            {truncateHex(auctionId, 8, 6)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Status */}
          <span
            className={cn(
              'font-mono text-[9px] font-bold uppercase tracking-[0.1em]',
              status === 'OPEN'
                ? 'text-[#6EE7B7]'
                : status === 'CLOSED'
                  ? 'text-[#FDA4AF]'
                  : status === 'SETTLED'
                    ? 'text-[#A78BFA]'
                    : 'text-[#5e5e7a]'
            )}
          >
            {status}
          </span>
          {/* Countdown */}
          <span className="font-mono text-[10px] font-bold tabular-nums text-[#6EE7B7]">
            {deadline > 0 ? formatCountdown(deadline) : '--:--:--'}
          </span>
          {/* Participants */}
          <span className="font-mono text-[9px] text-[#5e5e7a]">
            {participantCount} agents
          </span>
          {/* Connection */}
          <div className="flex items-center gap-1">
            <div
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                isConnected
                  ? 'bg-[#6EE7B7] shadow-[0_0_4px_#6EE7B7]'
                  : 'bg-[#F87171]'
              )}
            />
            <span className="font-mono text-[7px] font-bold uppercase tracking-[0.1em] text-[#5e5e7a]">
              {isConnected ? 'LIVE' : 'OFF'}
            </span>
          </div>
        </div>
      </div>

      {/* Main scene */}
      <RoomFloor isChaosMode={isChaosMode} className="min-h-[360px] md:min-h-[480px]">
        {/* Host / Auctioneer */}
        <HostAuctioneer isSlamming={isSlamming} isChaosMode={isChaosMode} />

        {/* Price Board */}
        <FlipBoard
          value={highestBidValue}
          isFlashing={isBoardFlashing}
          isChaosMode={isChaosMode}
        />

        {/* Combo Counter */}
        <ComboCounter count={combo.count} />

        {/* Agents */}
        <AnimatePresence>
          {agents.map((agent) => (
            <AgentRobot key={agent.agentId} agent={agent} />
          ))}
        </AnimatePresence>

        {/* Bid beams */}
        {activeBids.map((bid) => (
          <BidBeam
            key={`beam-${bid.id}`}
            bid={bid}
            onComplete={handleBeamComplete}
          />
        ))}

        {/* Floating damage numbers */}
        <AnimatePresence>
          {activeBids.map((bid) => (
            <FloatingNumber
              key={`num-${bid.id}`}
              bid={bid}
              onComplete={() => handleNumberComplete(bid.id)}
            />
          ))}
        </AnimatePresence>

        {/* "NEW CHALLENGER" entry banner */}
        <AgentEntryBanner
          agentId={entryBannerAgent}
          onComplete={dismissEntryBanner}
        />

        {/* Winner celebration overlay */}
        <WinnerCelebration
          winnerAgentId={highestBidAgentId}
          winnerAmount={highestBidValue}
          isSettled={isSettled}
        />

        {/* "No agents yet" placeholder */}
        {agents.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="font-mono text-xs text-[#5e5e7a]">{'// waiting for agents to join...'}</p>
              <p className="mt-1 font-mono text-[8px] text-[#3a3a58]">the pixel pit is empty</p>
            </div>
          </div>
        )}
      </RoomFloor>

      {/* News Ticker */}
      <NewsTicker events={events} isConnected={isConnected} />
    </div>
  )
}
