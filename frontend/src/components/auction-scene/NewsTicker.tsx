'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { formatUsdc, truncateHex } from '@/lib/format'
import type { AuctionEvent } from './types'

interface NewsTickerProps {
  events: AuctionEvent[]
  isConnected: boolean
  className?: string
}

/** Format a single event into a ticker string. */
function formatTickerEntry(e: AuctionEvent): string {
  const agent = truncateHex(e.agentId, 6, 4)
  switch (e.actionType) {
    case 'BID':
      return `>>> ${agent} bid ${formatUsdc(e.amount)} — NEW HIGH! <<<`
    case 'JOIN':
      return `★ ${agent} HAS JOINED THE ROOM ★`
    case 'LEAVE':
      return `✖ ${agent} HAS LEFT ✖`
    default:
      return `[${e.actionType}] ${agent}`
  }
}

/**
 * CSS marquee news ticker scrolling recent events.
 * Styled as a chyron bar at the bottom of the scene.
 */
export function NewsTicker({ events, isConnected, className }: NewsTickerProps) {
  const tickerText = useMemo(() => {
    const recent = events.slice(-20).reverse()
    if (recent.length === 0) {
      return '// awaiting auction events... stand by //'
    }
    return recent.map(formatTickerEntry).join('   ●   ')
  }, [events])

  return (
    <div
      className={cn(
        'relative overflow-hidden border-t border-[#1a2a40] bg-[#060a14]/95',
        className
      )}
    >
      {/* Connection indicator */}
      <div className="absolute left-2 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1.5">
        <div
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            isConnected ? 'bg-[#6EE7B7] shadow-[0_0_4px_#6EE7B7]' : 'bg-[#F87171]'
          )}
        />
        <span className="font-mono text-[7px] font-bold uppercase tracking-[0.15em] text-[#5e5e7a]">
          {isConnected ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      {/* Scrolling text — seamless double-copy marquee */}
      <div className="h-7 overflow-hidden pl-16">
        <div
          className="ticker-scroll flex h-full items-center whitespace-nowrap font-mono text-[10px] font-bold tracking-wider text-[#93a7ba]"
          style={{
            width: 'max-content',
            animation: `ticker-slide ${Math.max(20, tickerText.length * 0.15)}s linear infinite`,
          }}
        >
          <span className="shrink-0 pr-16">{tickerText}</span>
          <span className="shrink-0 pr-16">{tickerText}</span>
        </div>
      </div>

      {/* Inline keyframes for ticker */}
      <style jsx>{`
        @keyframes ticker-slide {
          0%   { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ticker-scroll {
            animation: none !important;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        }
      `}</style>
    </div>
  )
}
