'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { AuctionShell } from '@/components/auction/AuctionShell'
import { LoadingState } from '@/components/auction/LoadingState'
import { StatusPill } from '@/components/auction/StatusPill'
import { PixelPanel } from '@/components/landing/PixelPanel'
import { PixelButton } from '@/components/ui/PixelButton'
import { PixelCard } from '@/components/ui/PixelCard'
import { useAuctionDetail, useAuctionRoom, useAuctionState } from '@/hooks'
import { formatCountdown, formatUsdc, nftExplorerUrl, statusLabel, truncateHex } from '@/lib/format'
import { resolveImageUrl } from '@/lib/ipfs'

export default function AuctionRoomPage() {
  const params = useParams<{ id: string }>()
  const auctionId = params?.id
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setTick((x) => x + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const { detail, isLoading, error } = useAuctionDetail(auctionId)
  const { events, isConnected, isConnecting, highestBidEvent } = useAuctionRoom(auctionId)
  const onchain = useAuctionState(auctionId)

  const status = statusLabel(detail?.auction.status ?? onchain.state ?? 0)
  const deadline = detail?.snapshot.deadline ?? detail?.auction.deadline ?? onchain.deadline ?? 0

  const leaderboard = useMemo(() => {
    const map = new Map<string, { agentId: string; amount: bigint; updatedAt: number }>()
    for (const e of events) {
      if (e.actionType !== 'BID') continue
      const current = map.get(e.agentId)
      const amount = BigInt(e.amount)
      if (!current || amount > current.amount) {
        map.set(e.agentId, {
          agentId: e.agentId,
          amount,
          updatedAt: e.timestamp,
        })
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.amount === b.amount) return b.updatedAt - a.updatedAt
      return a.amount > b.amount ? -1 : 1
    })
  }, [events])

  return (
    <AuctionShell>
      <section className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#5d7ab0]">
            [ :: AUCTION_ROOM :: ]
          </p>
          <h1 className="font-mono text-xl font-bold text-[#EEEEF5] md:text-3xl">
            {auctionId ? truncateHex(auctionId, 14, 10) : 'unknown-auction'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <StatusPill status={status} />
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#9B9BB8]">
            ws: {isConnected ? 'LIVE' : isConnecting ? 'CONNECTING' : 'OFFLINE'}
          </span>
        </div>
      </section>

      {isLoading ? (
        <>
          <LoadingState label="LOADING_AUCTION_ROOM();" />
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <PixelCard title="loading.timeline" className="min-h-[220px] animate-pulse" />
            <PixelCard title="loading.stats" className="min-h-[220px] animate-pulse" />
            <PixelCard title="loading.board" className="min-h-[220px] animate-pulse" />
          </div>
        </>
      ) : null}

      {!isLoading && error ? (
        <PixelPanel accent="rose" headerLabel="errors.room" className="min-h-[140px]">
          <p className="font-mono text-xs text-[#FCA5A5]">[x] failed to load auction room</p>
          <p className="mt-2 font-mono text-xs text-[#B497A3]">{'// verify auction id and engine availability'}</p>
        </PixelPanel>
      ) : null}

      {!isLoading && !error && detail?.auction.item_image_cid ? (
        <PixelPanel accent="gold" headerLabel="item.details" className="mb-4">
          {(() => {
            const imgUrl = resolveImageUrl(detail.auction.item_image_cid)
            const explorerUrl = nftExplorerUrl(
              detail.auction.nft_chain_id,
              detail.auction.nft_contract,
              detail.auction.nft_token_id,
            )
            return (
              <>
                {imgUrl ? (
                  <img
                    src={imgUrl}
                    alt={detail.auction.title ?? 'Auction item'}
                    className="h-64 w-full rounded object-contain"
                  />
                ) : null}
                {detail.auction.title ? (
                  <p className="mt-3 font-mono text-lg font-bold text-[#EEEEF5]">{detail.auction.title}</p>
                ) : null}
                {detail.auction.description ? (
                  <p className="mt-1 font-mono text-xs text-[#9B9BB8]">{detail.auction.description}</p>
                ) : null}
                {explorerUrl ? (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block font-mono text-xs text-[#A78BFA] hover:underline"
                  >
                    {truncateHex(detail.auction.nft_contract!, 10, 6)} / #{detail.auction.nft_token_id}
                  </a>
                ) : null}
              </>
            )
          })()}
        </PixelPanel>
      ) : null}

      {!isLoading && !error ? (
        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
          <div className="space-y-4">
            <PixelPanel accent="violet" headerLabel="timeline.bids" className="min-h-[340px]" noBodyPadding>
              <div className="max-h-[340px] overflow-auto p-4">
                {events.length === 0 ? (
                  <p className="font-mono text-xs text-[#9B9BB8]">{'// waiting for first event...'}</p>
                ) : (
                  <ul className="space-y-2">
                    {[...events]
                      .sort((a, b) => b.seq - a.seq)
                      .map((e) => (
                        <li key={`evt-${e.seq}`} className="border border-[#2f415f] bg-[#101b27]/80 p-2 font-mono text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[#6EE7B7]">seq #{e.seq}</span>
                            <span className="text-[#5E5E7A]">{new Date(e.timestamp * 1000).toLocaleTimeString()}</span>
                          </div>
                          <p className="mt-1 text-[#EEEEF5]">
                            {e.actionType} | agent {e.agentId} | {formatUsdc(e.amount)}
                          </p>
                          <p className="mt-1 text-[10px] text-[#6c7ca0]">{truncateHex(e.eventHash, 12, 10)}</p>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </PixelPanel>

            <div className="flex flex-wrap gap-2">
              <Link href={`/auctions/${auctionId}/settlement`}>
                <PixelButton size="sm">[ settlement ]</PixelButton>
              </Link>
              <Link href={`/auctions/${auctionId}/replay`}>
                <PixelButton size="sm" variant="ghost">
                  [ replay ]
                </PixelButton>
              </Link>
            </div>
          </div>

          <div className="space-y-4">
            <PixelPanel accent="gold" headerLabel="current.highest">
              {highestBidEvent ? (
                <>
                  <p className="font-mono text-2xl font-bold text-[#F5C46E]">{formatUsdc(highestBidEvent.amount)}</p>
                  <p className="mt-2 font-mono text-xs text-[#EEEEF5]">agent {highestBidEvent.agentId}</p>
                </>
              ) : (
                <p className="font-mono text-xs text-[#9B9BB8]">{'// no bids yet'}</p>
              )}
            </PixelPanel>

            <PixelPanel accent="mint" headerLabel="room.status">
              <p className="font-mono text-xs text-[#9B9BB8]">countdown</p>
              <p className="mt-1 font-mono text-xl font-bold text-[#6EE7B7]">
                {deadline > 0 ? formatCountdown(deadline) : '--:--:--'}
              </p>
              <p className="mt-2 font-mono text-xs text-[#5E5E7A]">
                participants: {detail?.snapshot.participantCount ?? 0}
              </p>
            </PixelPanel>

            <PixelPanel accent="violet" headerLabel="leaderboard" noBodyPadding>
              <div className="space-y-2 p-3">
                {leaderboard.length === 0 ? (
                  <p className="font-mono text-xs text-[#9B9BB8]">{'// leaderboard pending bids'}</p>
                ) : (
                  leaderboard.map((entry, idx) => (
                    <PixelCard key={`lb-${entry.agentId}`} title={`rank.${idx + 1}`} className="border-[#3f3569]" showMarkers={false}>
                      <div className="flex items-center justify-between font-mono text-xs">
                        <span className="text-[#EEEEF5]">agent {entry.agentId}</span>
                        <span className="text-[#A78BFA]">{formatUsdc(entry.amount.toString())}</span>
                      </div>
                    </PixelCard>
                  ))
                )}
              </div>
            </PixelPanel>
          </div>
        </div>
      ) : null}
    </AuctionShell>
  )
}
