'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AuctionShell } from '@/components/auction/AuctionShell'
import { LoadingState } from '@/components/auction/LoadingState'
import { StatusPill } from '@/components/auction/StatusPill'
import { PixelPanel } from '@/components/landing/PixelPanel'
import { PixelButton } from '@/components/ui/PixelButton'
import { useAuctionState } from '@/hooks'
import { formatUsdc, truncateHex } from '@/lib/format'

const BASESCAN = 'https://sepolia.basescan.org'
const AUCTION_ESCROW = '0x5a1af9fDD97162c184496519E40afCf864061329'

export default function SettlementPage() {
  const params = useParams<{ id: string }>()
  const auctionId = params?.id
  const { stateLabel, winner, isLoading, error } = useAuctionState(auctionId)

  return (
    <AuctionShell>
      <section className="mb-6">
        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#5d7ab0]">
          [ :: SETTLEMENT :: ]
        </p>
        <h1 className="font-mono text-xl font-bold text-[#EEEEF5] md:text-3xl">
          {auctionId ? truncateHex(auctionId, 14, 10) : 'unknown-auction'}
        </h1>
      </section>

      {isLoading ? (
        <>
          <LoadingState label="LOADING_SETTLEMENT_STATE();" />
          <div className="mt-4">
            <PixelPanel accent="violet" headerLabel="loading.settlement" className="min-h-[160px]" />
          </div>
        </>
      ) : null}

      {!isLoading && error ? (
        <PixelPanel accent="rose" headerLabel="errors.chain" className="min-h-[160px]">
          <p className="font-mono text-xs text-[#FCA5A5]">[x] failed to read on-chain settlement state</p>
        </PixelPanel>
      ) : null}

      {!isLoading && !error ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <PixelPanel accent="mint" headerLabel="auction.state">
            <div className="flex items-center gap-3">
              <StatusPill status={(stateLabel as 'NONE' | 'OPEN' | 'CLOSED' | 'SETTLED' | 'CANCELLED') ?? 'NONE'} />
              <span className="font-mono text-xs text-[#9B9BB8]">on-chain registry verdict</span>
            </div>

            {stateLabel !== 'SETTLED' ? (
              <p className="mt-4 font-mono text-sm text-[#9B9BB8]">Auction not yet settled.</p>
            ) : (
              <div className="mt-4 space-y-2 font-mono text-xs">
                <p className="text-[#9B9BB8]">winner agent</p>
                <p className="text-[#EEEEF5]">{winner?.agentId ?? '0'}</p>
                <p className="text-[#9B9BB8]">winner wallet</p>
                <p className="text-[#A78BFA]">{winner ? truncateHex(winner.wallet, 12, 10) : '-'}</p>
                <p className="text-[#9B9BB8]">winning amount</p>
                <p className="text-[#F5C46E]">{winner ? formatUsdc(winner.amount) : '-'}</p>
              </div>
            )}
          </PixelPanel>

          <PixelPanel accent="gold" headerLabel="cre.workflow">
            <p className="font-mono text-xs text-[#9B9BB8]">
              {'// settlement path: AuctionEnded -> CRE workflow -> AuctionEscrow.onReport'}
            </p>
            <p className="mt-3 font-mono text-xs text-[#9B9BB8]">escrow contract</p>
            <p className="font-mono text-xs text-[#EEEEF5]">{truncateHex(AUCTION_ESCROW, 14, 10)}</p>
            <div className="mt-4">
              <a href={`${BASESCAN}/address/${AUCTION_ESCROW}`} target="_blank" rel="noreferrer noopener">
                <PixelButton size="sm">[ verify_on_basescan ]</PixelButton>
              </a>
            </div>
          </PixelPanel>
        </div>
      ) : null}

      <div className="mt-5 flex gap-2">
        <Link href={`/auctions/${auctionId}`}>
          <PixelButton size="sm" variant="ghost">
            [ room ]
          </PixelButton>
        </Link>
        <Link href={`/auctions/${auctionId}/replay`}>
          <PixelButton size="sm" variant="ghost">
            [ replay ]
          </PixelButton>
        </Link>
      </div>
    </AuctionShell>
  )
}
