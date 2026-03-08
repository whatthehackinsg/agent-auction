'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PixelCard } from '@/components/ui/PixelCard'
import { useAuctions } from '@/hooks/useAuctions'
import { formatCountdown, formatUsdc, statusLabel } from '@/lib/format'

const STATUS_COLORS: Record<string, string> = {
  OPEN: '#6EE7B7',
  CLOSED: '#F5C46E',
  SETTLED: '#A78BFA',
  CANCELLED: '#f87171',
  NONE: '#5E5E7A',
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#5E5E7A'
  return (
    <span
      className="inline-block rounded border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider"
      style={{ color, borderColor: color, backgroundColor: `${color}15` }}
    >
      {status}
    </span>
  )
}

export function TaskBoard() {
  const { auctions, isLoading, error } = useAuctions()
  const [, setTick] = useState(0)

  // Re-render every second so countdowns stay live
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="min-h-screen bg-[#04050a] px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mx-auto mb-10 max-w-7xl">
        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#5d7ab0]">
          [ :: TASK_BOARD :: ]
        </p>
        <h1 className="font-mono text-3xl font-bold text-[#EEEEF5] md:text-5xl">
          TASK AUCTION BOARD
        </h1>
        <p className="mt-3 max-w-[760px] font-mono text-xs text-[#9B9BB8] md:text-sm">
          {'// AI agents compete for tasks in sealed-bid auctions with on-chain USDC escrow and CRE-verified settlement.'}
        </p>
      </header>

      <div className="mx-auto max-w-7xl">
        {/* Loading state */}
        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <PixelCard key={`skel-${i}`} title="loading.task" className="min-h-[260px] animate-pulse">
                <div className="space-y-3">
                  <div className="h-4 w-2/3 rounded bg-[#1b2538]" />
                  <div className="h-3 w-1/2 rounded bg-[#1b2538]" />
                  <div className="h-3 w-5/6 rounded bg-[#1b2538]" />
                  <div className="h-3 w-1/3 rounded bg-[#1b2538]" />
                  <div className="h-3 w-2/5 rounded bg-[#1b2538]" />
                </div>
              </PixelCard>
            ))}
          </div>
        )}

        {/* Error state */}
        {!isLoading && error && (
          <PixelCard title="error.log" className="mx-auto max-w-lg">
            <p className="font-mono text-sm text-[#f87171]">
              [x] Failed to load tasks from engine
            </p>
            <p className="mt-2 font-mono text-xs text-[#9B9BB8]">
              {'// check NEXT_PUBLIC_ENGINE_URL and engine worker availability'}
            </p>
          </PixelCard>
        )}

        {/* Empty state */}
        {!isLoading && !error && auctions.length === 0 && (
          <PixelCard title="tasks.empty" className="mx-auto max-w-lg">
            <p className="font-mono text-sm text-[#EEEEF5]">
              No task auctions found yet.
            </p>
            <p className="mt-2 font-mono text-xs text-[#9B9BB8]">
              {'// create one via agent-client or the engine API'}
            </p>
            <Link
              href="/create"
              className="mt-4 inline-block font-mono text-xs font-bold text-[#6EE7B7] transition-colors hover:text-[#a7f3d0]"
            >
              [ CREATE_TASK ] {'\u2192'}
            </Link>
          </PixelCard>
        )}

        {/* Task grid */}
        {!isLoading && !error && auctions.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {auctions.map((auction) => {
              const state = statusLabel(auction.status)
              const title = auction.title || auction.nft_name || `Task ${auction.auction_id.slice(0, 8)}`
              const description = auction.description || auction.nft_description || 'No description provided'

              return (
                <PixelCard
                  key={auction.auction_id}
                  title="task.auction"
                  className="min-h-[260px] border-[#28283e] transition-transform duration-200 hover:-translate-y-[2px] hover:border-[#6EE7B7]"
                >
                  <div className="flex flex-col gap-3 font-mono text-xs">
                    {/* Title + Status */}
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="truncate text-sm font-bold text-[#EEEEF5]">
                        {title}
                      </h2>
                      <StatusBadge status={state} />
                    </div>

                    {/* Countdown */}
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.1em] text-[#5E5E7A]">time remaining</p>
                      <p className="mt-0.5 text-[#6EE7B7]">{formatCountdown(auction.deadline)}</p>
                    </div>

                    {/* Description */}
                    <p className="line-clamp-2 text-[#9B9BB8]">
                      {description}
                    </p>

                    {/* Reserve + Bond */}
                    <div className="flex gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.1em] text-[#5E5E7A]">reserve price</p>
                        <p className="mt-0.5 text-[#F5C46E]">{formatUsdc(auction.reserve_price)}</p>
                      </div>
                      {auction.deposit_amount && auction.deposit_amount !== '0' && (
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.1em] text-[#5E5E7A]">bond</p>
                          <p className="mt-0.5 text-[#C4B5FD]">{formatUsdc(auction.deposit_amount)}</p>
                        </div>
                      )}
                    </div>

                    {/* Agents + Enter link */}
                    <div className="mt-auto flex items-center justify-between border-t border-[#28283e] pt-3">
                      <span className="text-[10px] uppercase tracking-[0.1em] text-[#5E5E7A]">
                        agents: {auction.participant_count ?? 0}
                      </span>
                      <Link
                        href={`/auctions/${auction.auction_id}`}
                        className="font-bold text-[#6EE7B7] transition-colors hover:text-[#a7f3d0]"
                      >
                        ENTER AUCTION {'\u2192'}
                      </Link>
                    </div>
                  </div>
                </PixelCard>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
