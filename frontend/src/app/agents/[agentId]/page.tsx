'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AuctionShell } from '@/components/auction/AuctionShell'
import { LoadingState } from '@/components/auction/LoadingState'
import { StatusPill } from '@/components/auction/StatusPill'
import { PixelPanel } from '@/components/landing/PixelPanel'
import { PixelCard } from '@/components/ui/PixelCard'
import { PixelButton } from '@/components/ui/PixelButton'
import { Badge } from '@/components/ui/Badge'
import { useAgentProfile } from '@/hooks/useAgentProfile'
import type { AuctionParticipation, BondStatusResult } from '@/hooks/useAgentProfile'
import { formatUsdc, statusLabel, truncateHex } from '@/lib/format'

// ── Bond status badge variant mapping ────────────────────────────────
function bondBadgeVariant(status: BondStatusResult['status']): 'live' | 'warn' | 'active' | 'default' {
  switch (status) {
    case 'CONFIRMED':
      return 'active'
    case 'PENDING':
      return 'warn'
    case 'TIMEOUT':
      return 'live'
    default:
      return 'default'
  }
}

// ── Stat card ────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="border border-[#2e3f60] bg-[#101b27]/80 p-4">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#5E5E7A]">
        {label}
      </p>
      <p className={`mt-2 font-mono text-xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

// ── Participation row ────────────────────────────────────────────────
function ParticipationRow({ entry }: { entry: AuctionParticipation }) {
  const state = statusLabel(entry.auction.status)
  const lastActive = entry.lastSeen > 0
    ? new Date(entry.lastSeen * 1000).toLocaleDateString()
    : '--'

  return (
    <Link href={`/auctions/${entry.auction.auction_id}`} className="group block">
      <div className="flex flex-col gap-3 border border-[#2e3f60] bg-[#101b27]/60 p-4 transition-colors group-hover:border-[#6EE7B7]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StatusPill status={state} />
            <span className="font-mono text-xs text-[#EEEEF5]">
              {entry.auction.title ?? truncateHex(entry.auction.auction_id, 12, 8)}
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#5E5E7A]">
            {lastActive}
          </span>
        </div>

        <div className="flex flex-wrap gap-4 font-mono text-xs">
          <div>
            <span className="text-[#5E5E7A]">bids: </span>
            <span className="text-[#A78BFA]">{entry.bidCount}</span>
          </div>
          <div>
            <span className="text-[#5E5E7A]">highest: </span>
            <span className="text-[#F5C46E]">
              {entry.highestBid > BigInt(0)
                ? formatUsdc(entry.highestBid.toString())
                : '--'}
            </span>
          </div>
          <div>
            <span className="text-[#5E5E7A]">events: </span>
            <span className="text-[#9B9BB8]">{entry.events.length}</span>
          </div>
          {entry.bond ? (
            <div>
              <span className="text-[#5E5E7A]">bond: </span>
              <Badge variant={bondBadgeVariant(entry.bond.status)}>{entry.bond.status}</Badge>
            </div>
          ) : null}
        </div>

        {entry.bond?.depositor ? (
          <p className="font-mono text-[10px] text-[#6c7ca0]">
            depositor: {truncateHex(entry.bond.depositor, 10, 6)}
            {entry.bond.amount ? ` | ${formatUsdc(entry.bond.amount)}` : ''}
          </p>
        ) : null}
      </div>
    </Link>
  )
}

// ── Main page ────────────────────────────────────────────────────────
export default function AgentProfilePage() {
  const params = useParams<{ agentId: string }>()
  const agentId = params?.agentId

  const { participations, stats, isLoading, error } = useAgentProfile(agentId)

  return (
    <AuctionShell>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <section className="mb-6">
        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#5d7ab0]">
          [ :: AGENT_PROFILE :: ]
        </p>
        <h1 className="font-mono text-xl font-bold text-[#EEEEF5] md:text-3xl">
          $ ./agent --inspect {agentId ?? 'unknown'}
        </h1>
        <p className="mt-2 max-w-[760px] font-mono text-xs text-[#9B9BB8] md:text-sm">
          {'// aggregated view from on-chain events, bond status, and auction participation.'}
        </p>
      </section>

      {/* ── Loading ────────────────────────────────────────────────── */}
      {isLoading ? (
        <>
          <LoadingState label="LOADING_AGENT_PROFILE();" />
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <PixelCard key={`loading-stat-${i}`} title="loading.stat" className="min-h-[100px] animate-pulse">
                <div className="space-y-3">
                  <div className="h-3 w-1/2 bg-[#1b2538]" />
                  <div className="h-3 w-2/3 bg-[#1b2538]" />
                </div>
              </PixelCard>
            ))}
          </div>
        </>
      ) : null}

      {/* ── Error ──────────────────────────────────────────────────── */}
      {!isLoading && error ? (
        <PixelPanel accent="rose" headerLabel="errors.agent" className="min-h-[140px]">
          <p className="font-mono text-xs text-[#FCA5A5]">[x] failed to load agent profile</p>
          <p className="mt-2 font-mono text-xs text-[#B497A3]">
            {'// confirm engine availability and agent id format'}
          </p>
        </PixelPanel>
      ) : null}

      {/* ── Profile content ────────────────────────────────────────── */}
      {!isLoading && !error ? (
        <div className="space-y-6">
          {/* ── Agent identity card ──────────────────────────────── */}
          <PixelPanel accent="mint" headerLabel="agent.identity">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-lg font-bold text-[#6EE7B7]">
                  agent#{agentId}
                </span>
                <Badge variant="active">ON-CHAIN</Badge>
              </div>

              {stats.wallets.length > 0 ? (
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#5E5E7A]">
                    observed wallets
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {stats.wallets.map((w) => (
                      <span
                        key={w}
                        className="border border-[#2e3f60] bg-[#0a1018] px-2 py-1 font-mono text-[10px] text-[#9B9BB8]"
                      >
                        {truncateHex(w, 10, 6)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="font-mono text-xs text-[#5E5E7A]">
                  {'// no wallet addresses observed yet'}
                </p>
              )}

              {/* Placeholders for identity details — awaiting backend implementation */}
              <div className="mt-3 border-t border-[#2e3f60] pt-3">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#5E5E7A]">
                  identity details
                </p>
                <p className="mt-1 font-mono text-xs text-[#5E5E7A]">
                  {'// EIP-4337 account, root controller, runtime key — awaiting backend endpoint'}
                </p>
              </div>
            </div>
          </PixelPanel>

          {/* ── Stats grid ───────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="auctions joined"
              value={stats.totalAuctions.toString()}
              color="text-[#6EE7B7]"
            />
            <StatCard
              label="total bids"
              value={stats.totalBids.toString()}
              color="text-[#A78BFA]"
            />
            <StatCard
              label="highest bid"
              value={
                stats.highestBidEver > BigInt(0)
                  ? formatUsdc(stats.highestBidEver.toString())
                  : '--'
              }
              color="text-[#F5C46E]"
            />
            <StatCard
              label="wins (top bidder)"
              value={stats.wins.toString()}
              color="text-[#FDA4AF]"
            />
          </div>

          {/* ── Reputation / ZK placeholders ──────────────────────── */}
          <div className="grid gap-4 md:grid-cols-2">
            <PixelPanel accent="violet" headerLabel="reputation.score">
              <div className="space-y-2">
                <p className="font-mono text-2xl font-bold text-[#A78BFA]">--</p>
                <p className="font-mono text-xs text-[#5E5E7A]">
                  {'// reputation scoring system not yet implemented'}
                </p>
                <p className="font-mono text-[10px] text-[#6c6296]">
                  {'// will aggregate: bid frequency, settlement rate, bond reliability'}
                </p>
              </div>
            </PixelPanel>

            <PixelPanel accent="gold" headerLabel="zk.membership">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="default">UNVERIFIED</Badge>
                </div>
                <p className="font-mono text-xs text-[#5E5E7A]">
                  {'// ZK membership proof status — awaiting AgentPrivacyRegistry integration'}
                </p>
                <p className="font-mono text-[10px] text-[#7f6d4f]">
                  {'// will show: Merkle root, nullifier status, proof verification timestamp'}
                </p>
              </div>
            </PixelPanel>
          </div>

          {/* ── Auction participation list ─────────────────────────── */}
          <PixelPanel
            accent="mint"
            headerLabel="participation.history"
            headerMeta={`[${participations.length}]`}
            noBodyPadding
          >
            <div className="max-h-[600px] space-y-2 overflow-auto p-4">
              {participations.length === 0 ? (
                <p className="font-mono text-xs text-[#9B9BB8]">
                  {'// no auction participation found for this agent'}
                </p>
              ) : (
                participations.map((entry) => (
                  <ParticipationRow
                    key={entry.auction.auction_id}
                    entry={entry}
                  />
                ))
              )}
            </div>
          </PixelPanel>

          {/* ── Bid history (recent bids across all auctions) ──────── */}
          <PixelPanel accent="violet" headerLabel="bid.history" noBodyPadding>
            <div className="max-h-[400px] overflow-auto p-4">
              {(() => {
                const allBids = participations
                  .flatMap((p) =>
                    p.events
                      .filter((e) => e.action_type === 'BID')
                      .map((e) => ({ ...e, auctionTitle: p.auction.title })),
                  )
                  .sort((a, b) => b.created_at - a.created_at)

                if (allBids.length === 0) {
                  return (
                    <p className="font-mono text-xs text-[#9B9BB8]">
                      {'// no bid events recorded'}
                    </p>
                  )
                }

                return (
                  <ul className="space-y-2">
                    {allBids.slice(0, 50).map((bid) => (
                      <li
                        key={`bid-${bid.auction_id}-${bid.seq}`}
                        className="border border-[#2f415f] bg-[#101b27]/80 p-2 font-mono text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[#6EE7B7]">seq #{bid.seq}</span>
                          <span className="text-[#5E5E7A]">
                            {bid.created_at > 0
                              ? new Date(bid.created_at * 1000).toLocaleString()
                              : '--'}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-[#F5C46E]">{formatUsdc(bid.amount)}</span>
                          <span className="text-[#5E5E7A]">in</span>
                          <Link
                            href={`/auctions/${bid.auction_id}`}
                            className="text-[#A78BFA] hover:underline"
                          >
                            {bid.auctionTitle ?? truncateHex(bid.auction_id, 10, 6)}
                          </Link>
                        </div>
                        <p className="mt-1 text-[10px] text-[#6c7ca0]">
                          {truncateHex(bid.event_hash, 12, 10)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )
              })()}
            </div>
          </PixelPanel>

          {/* ── Navigation ─────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-2">
            <Link href="/auctions">
              <PixelButton size="sm" variant="ghost">
                [ back to auctions ]
              </PixelButton>
            </Link>
          </div>
        </div>
      ) : null}
    </AuctionShell>
  )
}
