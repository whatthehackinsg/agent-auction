'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { AuctionShell } from '@/components/auction/AuctionShell'
import { LoadingState } from '@/components/auction/LoadingState'
import { PixelPanel } from '@/components/landing/PixelPanel'
import { PixelButton } from '@/components/ui/PixelButton'
import { Badge } from '@/components/ui/Badge'
import { API_BASE_URL } from '@/lib/api'
import { computeReplayEventHash, parseReplayBundle, type ReplayBundle } from '@/lib/replay'
import { useAuctionState } from '@/hooks'
import { truncateHex } from '@/lib/format'

const ZERO_HASH = ('0x' + '00'.repeat(32)) as `0x${string}`

export default function ReplayPage() {
  const params = useParams<{ id: string }>()
  const auctionId = params?.id
  const onchain = useAuctionState(auctionId)

  const [bundle, setBundle] = useState<ReplayBundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!auctionId) {
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_BASE_URL}/auctions/${auctionId}/replay`)
        if (!res.ok) {
          throw new Error(`failed to fetch replay bundle: ${res.status}`)
        }
        const text = new TextDecoder().decode(await res.arrayBuffer())
        const parsed = parseReplayBundle(text)
        if (!cancelled) {
          setBundle(parsed)
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'unknown error'
        if (!cancelled) {
          setError(message)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [auctionId])

  const verification = useMemo(() => {
    if (!bundle) {
      return {
        rows: [] as Array<{ seq: number; expected: string; recomputed: string; ok: boolean; prevOk: boolean }>,
        finalComputed: ZERO_HASH,
        allEventsVerified: false,
      }
    }

    const rows = bundle.events.map((event, idx) => {
      const recomputed = computeReplayEventHash(event.seq, event.prevHash, event.payloadHash)
      const expectedPrev = idx === 0 ? ZERO_HASH : bundle.events[idx - 1].eventHash
      const prevOk = event.prevHash.toLowerCase() === expectedPrev.toLowerCase()
      const ok = recomputed.toLowerCase() === event.eventHash.toLowerCase()
      return {
        seq: event.seq,
        expected: event.eventHash,
        recomputed,
        ok,
        prevOk,
      }
    })

    const finalComputed = bundle.events.length > 0 ? bundle.events[bundle.events.length - 1].eventHash : ZERO_HASH
    const allEventsVerified = rows.length > 0 && rows.every((r) => r.ok && r.prevOk)

    return { rows, finalComputed, allEventsVerified }
  }, [bundle])

  const finalMatch =
    onchain.finalLogHash && verification.finalComputed
      ? onchain.finalLogHash.toLowerCase() === verification.finalComputed.toLowerCase()
      : false

  return (
    <AuctionShell>
      <section className="mb-6">
        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#5d7ab0]">
          [ :: REPLAY_AUDIT :: ]
        </p>
        <h1 className="font-mono text-xl font-bold text-[#EEEEF5] md:text-3xl">
          {auctionId ? truncateHex(auctionId, 14, 10) : 'unknown-auction'}
        </h1>
      </section>

      {isLoading ? (
        <>
          <LoadingState label="LOADING_REPLAY_BUNDLE();" />
          <div className="mt-4">
            <PixelPanel accent="violet" headerLabel="loading.replay" className="min-h-[160px]" />
          </div>
        </>
      ) : null}

      {!isLoading && error ? (
        <PixelPanel accent="rose" headerLabel="errors.replay" className="min-h-[160px]">
          <p className="font-mono text-xs text-[#FCA5A5]">[x] {error}</p>
        </PixelPanel>
      ) : null}

      {!isLoading && !error && bundle ? (
        <div className="space-y-4">
          <PixelPanel accent="mint" headerLabel="summary.verdict">
            {verification.allEventsVerified && finalMatch ? (
              <Badge variant="active">ALL EVENTS VERIFIED</Badge>
            ) : (
              <Badge variant="warn">VERIFICATION INCOMPLETE</Badge>
            )}
            <p className="mt-3 font-mono text-xs text-[#9B9BB8]">bundle auction id: {truncateHex(bundle.auctionId, 14, 10)}</p>
            <p className="mt-1 font-mono text-xs text-[#9B9BB8]">on-chain final log hash: {truncateHex(onchain.finalLogHash ?? ZERO_HASH, 14, 10)}</p>
            <p className="mt-1 font-mono text-xs text-[#9B9BB8]">computed final log hash: {truncateHex(verification.finalComputed, 14, 10)}</p>
          </PixelPanel>

          <PixelPanel accent="gold" headerLabel="events.hash-check" noBodyPadding>
            <div className="max-h-[420px] overflow-auto p-3">
              {bundle.events.length === 0 ? (
                <p className="font-mono text-xs text-[#9B9BB8]">{'// empty replay bundle: no events yet'}</p>
              ) : (
                <ul className="space-y-2">
                  {bundle.events.map((event, idx) => {
                  const row = verification.rows[idx]
                  return (
                    <li key={`replay-${event.seq}`} className="border border-[#3e3d30] bg-[#201a12]/70 p-2 font-mono text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[#F5C46E]">seq #{event.seq}</span>
                        <span className={row.ok && row.prevOk ? 'text-[#6EE7B7]' : 'text-[#F87171]'}>
                          {row.ok && row.prevOk ? '[ok]' : '[x]'}
                        </span>
                      </div>
                      <p className="mt-1 text-[#9B9BB8]">expected: {truncateHex(row.expected, 14, 12)}</p>
                      <p className="mt-1 text-[#9B9BB8]">computed: {truncateHex(row.recomputed, 14, 12)}</p>
                      {!row.prevOk ? (
                        <p className="mt-1 text-[#FCA5A5]">prev hash mismatch in chain continuity</p>
                      ) : null}
                    </li>
                  )
                  })}
                </ul>
              )}
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
        <Link href={`/auctions/${auctionId}/settlement`}>
          <PixelButton size="sm" variant="ghost">
            [ settlement ]
          </PixelButton>
        </Link>
      </div>
    </AuctionShell>
  )
}
