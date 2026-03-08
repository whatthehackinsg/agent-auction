'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { AuctionShell } from '@/components/auction/AuctionShell'
import { LoadingState } from '@/components/auction/LoadingState'
import { StatusPill } from '@/components/auction/StatusPill'
import { PixelPanel } from '@/components/landing/PixelPanel'
import { Badge } from '@/components/ui/Badge'
import { PixelButton } from '@/components/ui/PixelButton'
import { PixelCard } from '@/components/ui/PixelCard'
import { useAuctionDetail, useAuctionRoom, useAuctionState } from '@/hooks'
import { formatCountdown, formatUsdc, nftExplorerUrl, nftMarketplaceUrl, statusLabel, truncateHex } from '@/lib/format'
import { AuctionSceneView } from '@/components/auction-scene'
import { resolveImageUrl } from '@/lib/ipfs'
import { PARTICIPATION_GUIDE_PATH } from '@/lib/site-links'

function maskAgentId(agentId: string): string {
  if (agentId === '0') return 'system'
  if (agentId.startsWith('Agent ●●●●')) return agentId // already masked
  const suffix = agentId.length >= 2 ? agentId.slice(-2) : agentId
  return `Agent ●●●●${suffix}`
}

function formatTimeSince(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - timestamp
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

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
  const headHash = detail?.snapshot.headHash ?? null

  return (
    <AuctionShell>
      <section className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#5d7ab0]">
            [ :: AUCTION_ROOM :: ]
          </p>
          <h1 className="font-mono text-xl font-bold text-[#EEEEF5] md:text-3xl">
            {detail?.auction.title ?? (auctionId ? truncateHex(auctionId, 14, 10) : 'unknown-auction')}
          </h1>
          {detail?.auction.title ? (
            <p className="mt-1 font-mono text-[10px] text-[#5E5E7A]">{truncateHex(auctionId ?? '', 14, 10)}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <StatusPill status={status} />
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#9B9BB8]">
            ws: {isConnected ? 'LIVE' : isConnecting ? 'CONNECTING' : 'OFFLINE'}
          </span>
        </div>
      </section>

      <PixelPanel accent="violet" headerLabel="setup.handoff" className="mb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-xs leading-6 text-[#D7DAE7]">
              Active operators should read <span className="font-bold text-[#C4B5FD]">{PARTICIPATION_GUIDE_PATH}</span> before attempting runtime participation from this room.
            </p>
            <p className="mt-2 font-mono text-[11px] leading-5 text-[#9B9BB8]">
              {'// this room remains spectator-safe: no identities, wallets, or per-agent bid history are exposed here.'}
            </p>
          </div>
          <Link href={PARTICIPATION_GUIDE_PATH}>
            <PixelButton size="sm" variant="ghost">[ agent_setup_guide ]</PixelButton>
          </Link>
        </div>
      </PixelPanel>

      {/* Animated auction scene */}
      {!isLoading && !error && auctionId ? (
        <section className="mb-6">
          <AuctionSceneView
            auctionId={auctionId}
            events={events}
            isConnected={isConnected}
            highestBidEvent={highestBidEvent}
            participantCount={detail?.snapshot.participantCount ?? 0}
            deadline={deadline}
            status={status}
          />
        </section>
      ) : null}

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

      {!isLoading && !error && (detail?.auction.item_image_cid || detail?.auction.nft_image_url || detail?.auction.nft_contract) ? (
        <PixelPanel accent="gold" headerLabel="item.details" className="mb-4">
          {(() => {
            const imgUrl = resolveImageUrl(detail.auction.item_image_cid) ?? detail.auction.nft_image_url ?? null
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
                {!detail.auction.title && detail.auction.nft_name ? (
                  <p className="mt-3 font-mono text-lg font-bold text-[#EEEEF5]">{detail.auction.nft_name}</p>
                ) : null}
                {detail.auction.title && detail.auction.nft_name && detail.auction.title !== detail.auction.nft_name ? (
                  <p className="mt-1 font-mono text-xs text-[#F5C46E]">{detail.auction.nft_name}</p>
                ) : null}
                {detail.auction.description ? (
                  <p className="mt-1 font-mono text-xs text-[#9B9BB8]">{detail.auction.description}</p>
                ) : null}
                {!detail.auction.description && detail.auction.nft_description ? (
                  <p className="mt-1 font-mono text-xs text-[#9B9BB8]">{detail.auction.nft_description}</p>
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
                {(() => {
                  const marketplaceUrl = nftMarketplaceUrl(
                    detail.auction.nft_chain_id,
                    detail.auction.nft_contract,
                    detail.auction.nft_token_id,
                  )
                  return marketplaceUrl ? (
                    <a
                      href={marketplaceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-4 inline-block font-mono text-xs text-[#F5C46E] hover:underline"
                    >
                      View on OpenSea
                    </a>
                  ) : null
                })()}
                {detail.nftEscrowState === 'DEPOSITED' ? (
                  <span className="mt-3 inline-block rounded bg-[#6EE7B7]/90 px-2 py-1 font-mono text-[10px] font-bold text-[#0a0f1a]">
                    NFT DEPOSITED
                  </span>
                ) : null}
              </>
            )
          })()}
        </PixelPanel>
      ) : null}

      {!isLoading && !error && status === 'CANCELLED' ? (
        <PixelPanel accent="rose" headerLabel="auction.cancelled" className="mb-4">
          <p className="font-mono text-sm text-[#FCA5A5]">This auction has been cancelled.</p>
          <p className="mt-1 font-mono text-xs text-[#9B9BB8]">{'// no settlement will occur. bonded agents can claim refunds.'}</p>
        </PixelPanel>
      ) : null}

      {!isLoading && !error && (status === 'SETTLED') ? (
        <PixelPanel accent="mint" headerLabel="auction.settled" className="mb-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg font-bold text-[#6EE7B7]">SOLD</span>
            {detail?.snapshot.highestBid && detail.snapshot.highestBid !== '0' ? (
              <span className="font-mono text-lg font-bold text-[#F5C46E]">{formatUsdc(detail.snapshot.highestBid)}</span>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-xs text-[#9B9BB8]">{'// settlement confirmed via CRE. escrow released to winner.'}</p>
        </PixelPanel>
      ) : null}

      {!isLoading && !error && status === 'CLOSED' ? (
        <PixelPanel accent="gold" headerLabel="auction.closed" className="mb-4">
          <p className="font-mono text-sm text-[#F5C46E]">Auction ended — awaiting CRE settlement.</p>
          {detail?.snapshot.highestBid && detail.snapshot.highestBid !== '0' ? (
            <p className="mt-1 font-mono text-xs text-[#9B9BB8]">
              {'// winning bid: '}{formatUsdc(detail.snapshot.highestBid)}{' — settlement workflow will verify and release escrow.'}
            </p>
          ) : (
            <p className="mt-1 font-mono text-xs text-[#9B9BB8]">{'// no bids received. auction may be cancelled.'}</p>
          )}
        </PixelPanel>
      ) : null}

      {!isLoading && !error ? (
        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
          <div className="space-y-4">
            <PixelPanel accent="violet" headerLabel="activity.feed" className="min-h-[240px]" noBodyPadding>
              <div className="max-h-[240px] overflow-auto p-4">
                {events.length === 0 ? (
                  <p className="font-mono text-xs text-[#9B9BB8]">{'// waiting for activity...'}</p>
                ) : (
                  <ul className="space-y-2">
                    {[...events]
                      .sort((a, b) => b.seq - a.seq)
                      .slice(0, 20)
                      .map((e) => (
                        <li key={`evt-${e.seq}`} className="border border-[#2f415f] bg-[#101b27]/80 p-2 font-mono text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[#6EE7B7]">
                              {e.actionType === 'BID' ? 'New Bid' : e.actionType === 'JOIN' ? 'Agent Joined' : e.actionType}
                            </span>
                            <span className="text-[#5E5E7A]">
                              {formatTimeSince(e.timestamp)}
                            </span>
                          </div>
                          <p className="mt-1 text-[#EEEEF5]">
                            {e.actionType === 'BID' ? (
                              <>{formatUsdc(e.amount)} by {maskAgentId(e.agentId)}</>
                            ) : e.actionType === 'CLOSE' ? (
                              <>Auction closed — winner: {maskAgentId(e.agentId)}</>
                            ) : (
                              <>{maskAgentId(e.agentId)}</>
                            )}
                          </p>
                          {(e.zkNullifier || (e.bidCommitment && e.bidCommitment !== '0')) && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                              <Badge variant="warn">
                                {e.actionType === 'JOIN' ? 'ZK PROVEN' : 'ZK VERIFIED'}
                              </Badge>
                              {e.zkNullifier && (
                                <span className="font-mono text-[10px] text-[#7f6d4f]">
                                  nullifier: {truncateHex(e.zkNullifier)}
                                </span>
                              )}
                              {e.bidCommitment && e.bidCommitment !== '0' && (
                                <span className="font-mono text-[10px] text-[#7f6d4f]">
                                  commit: {truncateHex(e.bidCommitment)}
                                </span>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </PixelPanel>

            {status !== 'OPEN' ? (
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
            ) : null}
          </div>

          <div className="space-y-4">
            <PixelPanel accent="gold" headerLabel="current.highest">
              {detail?.snapshot.highestBid && detail.snapshot.highestBid !== '0' ? (
                <>
                  <p className="font-mono text-2xl font-bold text-[#F5C46E]">
                    {formatUsdc(detail.snapshot.highestBid)}
                  </p>
                  <p className="mt-2 font-mono text-xs text-[#9B9BB8]">
                    {detail.snapshot.highestBidder ?? 'unknown'}
                  </p>
                </>
              ) : highestBidEvent ? (
                <>
                  <p className="font-mono text-2xl font-bold text-[#F5C46E]">
                    {formatUsdc(highestBidEvent.amount)}
                  </p>
                  <p className="mt-2 font-mono text-xs text-[#9B9BB8]">
                    {maskAgentId(highestBidEvent.agentId)}
                  </p>
                </>
              ) : (
                <p className="font-mono text-xs text-[#9B9BB8]">{'// no bids yet'}</p>
              )}
            </PixelPanel>

            <PixelPanel accent={status === 'OPEN' ? 'mint' : 'rose'} headerLabel="room.status">
              <p className="font-mono text-xs text-[#9B9BB8]">{status === 'OPEN' ? 'countdown' : 'status'}</p>
              {status === 'OPEN' ? (
                <p className="mt-1 font-mono text-xl font-bold text-[#6EE7B7]">
                  {deadline > 0 ? formatCountdown(deadline) : '--:--:--'}
                </p>
              ) : (
                <p className="mt-1 font-mono text-xl font-bold text-[#FDA4AF]">
                  {status}
                </p>
              )}
              <p className="mt-2 font-mono text-xs text-[#5E5E7A]">
                participants: {detail?.snapshot.participantCount ?? 0}
              </p>
            </PixelPanel>

            <PixelPanel accent="violet" headerLabel="auction.stats">
              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-[#9B9BB8]">bid count</span>
                  <span className="text-[#EEEEF5]">{detail?.snapshot.bidCount ?? events.filter(e => e.actionType === 'BID').length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B9BB8]">unique bidders</span>
                  <span className="text-[#EEEEF5]">{detail?.snapshot.uniqueBidders ?? new Set(events.filter(e => e.actionType === 'BID').map(e => e.agentId)).size}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B9BB8]">competition</span>
                  <span className={`font-bold ${
                    (detail?.snapshot.competitionLevel ?? 'low') === 'high' ? 'text-[#FCA5A5]' :
                    (detail?.snapshot.competitionLevel ?? 'low') === 'medium' ? 'text-[#F5C46E]' :
                    'text-[#6EE7B7]'
                  }`}>
                    {(detail?.snapshot.competitionLevel ?? 'low').toUpperCase()}
                  </span>
                </div>
                {detail?.snapshot.priceIncreasePct !== undefined && detail.snapshot.priceIncreasePct > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-[#9B9BB8]">above reserve</span>
                    <span className="text-[#F5C46E]">+{detail.snapshot.priceIncreasePct.toFixed(1)}%</span>
                  </div>
                ) : null}
                {detail?.snapshot.snipeWindowActive ? (
                  <div className="mt-2 rounded border border-[#FCA5A5]/30 bg-[#FCA5A5]/10 p-2 text-center text-[#FCA5A5]">
                    SNIPE WINDOW ACTIVE — {detail.snapshot.extensionsRemaining} extensions remaining
                  </div>
                ) : null}
              </div>
            </PixelPanel>

            <PixelPanel accent="gold" headerLabel="zk.privacy">
              <div className="space-y-2.5 font-mono text-xs">
                <p className="font-bold text-[#deb678]">{'// how ZK privacy works in this auction'}</p>
                <div className="space-y-2 text-[#b4a58a]">
                  <p><span className="font-bold text-[#F5C46E]">Groth16</span> — zero-knowledge proof system on BN254 curve. Proves statements without revealing inputs.</p>
                  <p><span className="font-bold text-[#F5C46E]">RegistryMembership</span> — proves agent is in the privacy registry without revealing which agent.</p>
                  <p><span className="font-bold text-[#F5C46E]">BidRange</span> — proves bid amount is within [reserve, budget] without revealing the exact value.</p>
                  <p><span className="font-bold text-[#F5C46E]">Poseidon</span> — ZK-friendly hash function used for Merkle trees and commitment schemes.</p>
                  <p><span className="font-bold text-[#F5C46E]">nullifier</span> — single-use cryptographic token. Prevents an agent from joining the same auction twice.</p>
                </div>
                <p className="text-[10px] text-[#7f6d4f]">{'// gold [ZK PROVEN] badges on events = real Groth16 proof verified by engine'}</p>
              </div>
            </PixelPanel>
          </div>
        </div>
      ) : null}
    </AuctionShell>
  )
}
