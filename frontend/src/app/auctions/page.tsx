'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AuctionShell } from '@/components/auction/AuctionShell'
import { LoadingState } from '@/components/auction/LoadingState'
import { StatusPill } from '@/components/auction/StatusPill'
import { PixelPanel } from '@/components/landing/PixelPanel'
import { PixelCard } from '@/components/ui/PixelCard'
import { useAuctions } from '@/hooks/useAuctions'
import { formatCountdown, formatUsdc, statusLabel, truncateHex } from '@/lib/format'
import { resolveImageUrl } from '@/lib/ipfs'

export default function AuctionsPage() {
  const { auctions, isLoading, error } = useAuctions()
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setTick((x) => x + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <AuctionShell>
      <section className="mb-6">
        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#5d7ab0]">
          [ :: LIVE_AUCTIONS :: ]
        </p>
        <h1 className="font-mono text-2xl font-bold text-[#EEEEF5] md:text-4xl">$ ./auctions --list</h1>
        <p className="mt-2 max-w-[760px] font-mono text-xs text-[#9B9BB8] md:text-sm">
          {'// real-time rooms from the edge sequencer. open a room to inspect bids, settlement, and replay proofs.'}
        </p>
      </section>

      {isLoading ? (
        <>
          <LoadingState label="LOADING_AUCTIONS();" />
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <PixelCard key={`loading-${i}`} title="loading.auction" className="min-h-[220px] animate-pulse">
                <div className="space-y-3">
                  <div className="h-3 w-1/2 bg-[#1b2538]" />
                  <div className="h-3 w-2/3 bg-[#1b2538]" />
                  <div className="h-3 w-5/6 bg-[#1b2538]" />
                  <div className="h-3 w-1/3 bg-[#1b2538]" />
                </div>
              </PixelCard>
            ))}
          </div>
        </>
      ) : null}

      {!isLoading && error ? (
        <PixelPanel accent="rose" headerLabel="errors.engine" className="min-h-[140px]">
          <p className="font-mono text-xs text-[#FCA5A5]">[x] failed to load auctions from engine</p>
          <p className="mt-2 font-mono text-xs text-[#B497A3]">
            {'// confirm NEXT_PUBLIC_ENGINE_URL and engine worker availability'}
          </p>
        </PixelPanel>
      ) : null}

      {!isLoading && !error && auctions.length === 0 ? (
        <PixelPanel accent="violet" headerLabel="auctions.empty" className="min-h-[140px]">
          <p className="font-mono text-sm text-[#EEEEF5]">No auctions yet.</p>
          <p className="mt-2 font-mono text-xs text-[#9B9BB8]">
            {'// create one via agent-client or POST /auctions on the engine'}
          </p>
        </PixelPanel>
      ) : null}

      {!isLoading && !error && auctions.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {auctions.map((auction) => {
            const state = statusLabel(auction.status)
            return (
              <Link key={auction.auction_id} href={`/auctions/${auction.auction_id}`} className="group">
                <PixelCard
                  title="auction.room"
                  className="min-h-[220px] border-[#2b3a56] transition-transform duration-200 group-hover:-translate-y-[2px] group-hover:border-[#6EE7B7]"
                >
                  {(() => {
                    const imgUrl = resolveImageUrl(auction.item_image_cid)
                    return imgUrl ? (
                      <div className="relative -mx-4 -mt-4 mb-3">
                        <img
                          src={imgUrl}
                          alt={auction.title ?? 'Auction item'}
                          className="h-32 w-full rounded-t object-cover"
                        />
                        {auction.nft_contract ? (
                          <span className="absolute right-2 top-2 rounded bg-[#F5C46E]/90 px-2 py-0.5 font-mono text-[10px] font-bold text-[#0a0f1a]">
                            NFT
                          </span>
                        ) : null}
                      </div>
                    ) : null
                  })()}
                  <div className="flex flex-col gap-3 font-mono text-xs text-[#9B9BB8]">
                    <div className="flex items-center justify-between">
                      <StatusPill status={state} />
                      <span className="text-[10px] uppercase tracking-[0.1em] text-[#5E5E7A]">
                        participants: {auction.participant_count ?? 0}
                      </span>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-[0.1em] text-[#5E5E7A]">auction id</p>
                      <p className="mt-1 text-[#EEEEF5]">
                        {auction.title ?? truncateHex(auction.auction_id, 12, 8)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-[0.1em] text-[#5E5E7A]">reserve price</p>
                      <p className="mt-1 text-[#F5C46E]">{formatUsdc(auction.reserve_price)}</p>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-[0.1em] text-[#5E5E7A]">countdown</p>
                      <p className="mt-1 text-[#6EE7B7]">{formatCountdown(auction.deadline)}</p>
                    </div>
                  </div>
                </PixelCard>
              </Link>
            )
          })}
        </div>
      ) : null}
    </AuctionShell>
  )
}
