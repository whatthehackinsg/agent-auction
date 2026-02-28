'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { keccak256, encodePacked } from 'viem'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { AuctionShell } from '@/components/auction/AuctionShell'
import { WalletButton } from '@/components/wallet/WalletButton'
import { PixelCard } from '@/components/ui/PixelCard'
import { PixelButton } from '@/components/ui/PixelButton'
import { PixelDatePicker, type DatePickerValue } from '@/components/ui/PixelDatePicker'
import { adminFetcher } from '@/lib/api'

type AuctionType = 'english' | 'sealed-bid'

export default function CreateAuctionPage() {
  const router = useRouter()
  const { primaryWallet } = useDynamicContext()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [reservePrice, setReservePrice] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [deadlineValue, setDeadlineValue] = useState<DatePickerValue | null>(null)
  const [deadlineUnix, setDeadlineUnix] = useState<number | null>(null)
  const [auctionType, setAuctionType] = useState<AuctionType>('english')
  const [maxBid, setMaxBid] = useState('')
  const [snipeWindow, setSnipeWindow] = useState('60')
  const [extension, setExtension] = useState('30')
  const [maxExtensions, setMaxExtensions] = useState('5')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) { setError('Title is required'); return }
    if (!reservePrice.trim()) { setError('Reserve price is required'); return }
    if (!deadlineUnix) { setError('Deadline is required'); return }

    const reserveBaseUnits = (parseFloat(reservePrice) * 1e6).toFixed(0)
    const depositBaseUnits = depositAmount ? (parseFloat(depositAmount) * 1e6).toFixed(0) : '0'

    if (deadlineUnix <= Math.floor(Date.now() / 1000)) {
      setError('Deadline must be in the future')
      return
    }

    const manifestHash = keccak256(
      encodePacked(
        ['string', 'string', 'uint256'],
        [title, reserveBaseUnits, BigInt(deadlineUnix)],
      ),
    )

    setSubmitting(true)
    try {
      const result = await adminFetcher<{ auctionId: string }>('/auctions', {
        method: 'POST',
        body: JSON.stringify({
          manifestHash,
          reservePrice: reserveBaseUnits,
          depositAmount: depositBaseUnits,
          deadline: deadlineUnix,
          title: title.trim(),
          description: description.trim() || undefined,
          auctionType,
          maxBid: maxBid ? (parseFloat(maxBid) * 1e6).toFixed(0) : undefined,
          snipeWindowSec: parseInt(snipeWindow, 10) || 60,
          extensionSec: parseInt(extension, 10) || 30,
          maxExtensions: parseInt(maxExtensions, 10) || 5,
        }),
      })
      router.push(`/auctions/${result.auctionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create auction')
    } finally {
      setSubmitting(false)
    }
  }

  if (!primaryWallet) {
    return (
      <AuctionShell>
        <div className="flex flex-col items-center justify-center gap-6 py-20">
          <p className="font-mono text-sm text-[#5E5E7A]">
            {'>'} wallet required to create auctions
          </p>
          <WalletButton />
        </div>
      </AuctionShell>
    )
  }

  return (
    <AuctionShell>
      <div className="mx-auto max-w-2xl">
        <PixelCard title="create_auction.sh">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Title */}
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#6EE7B7]">
                {'>'} title *
              </span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Rare NFT Auction #42"
                className="border border-[#1E1E32] bg-[#0C0C1D] px-3 py-2 font-mono text-sm text-[#EEEEF5] placeholder:text-[#3A3A58] focus:border-[#6EE7B7] focus:outline-none"
              />
            </label>

            {/* Description */}
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#5E5E7A]">
                {'>'} description
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={3}
                className="resize-none border border-[#1E1E32] bg-[#0C0C1D] px-3 py-2 font-mono text-sm text-[#EEEEF5] placeholder:text-[#3A3A58] focus:border-[#6EE7B7] focus:outline-none"
              />
            </label>

            {/* Reserve Price + Deposit */}
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[#6EE7B7]">
                  {'>'} reserve price (USDC) *
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={reservePrice}
                  onChange={(e) => setReservePrice(e.target.value)}
                  placeholder="10.00"
                  className="border border-[#1E1E32] bg-[#0C0C1D] px-3 py-2 font-mono text-sm text-[#EEEEF5] placeholder:text-[#3A3A58] focus:border-[#6EE7B7] focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[#5E5E7A]">
                  {'>'} deposit (USDC)
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.00"
                  className="border border-[#1E1E32] bg-[#0C0C1D] px-3 py-2 font-mono text-sm text-[#EEEEF5] placeholder:text-[#3A3A58] focus:border-[#6EE7B7] focus:outline-none"
                />
              </label>
            </div>

            {/* Deadline + Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[#6EE7B7]">
                  {'>'} deadline (UTC) *
                </span>
                <PixelDatePicker
                  value={deadlineValue}
                  onChange={(v, unix) => { setDeadlineValue(v); setDeadlineUnix(unix) }}
                />
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[#6EE7B7]">
                  {'>'} auction type *
                </span>
                <select
                  value={auctionType}
                  onChange={(e) => setAuctionType(e.target.value as AuctionType)}
                  className="border border-[#1E1E32] bg-[#0C0C1D] px-3 py-2 font-mono text-sm text-[#EEEEF5] focus:border-[#6EE7B7] focus:outline-none"
                >
                  <option value="english">english</option>
                  <option value="sealed-bid">sealed-bid</option>
                </select>
              </label>
            </div>

            {/* Advanced toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="self-start font-mono text-[10px] uppercase tracking-widest text-[#C4B5FD] hover:text-[#ddd0ff] transition-colors"
            >
              [{showAdvanced ? '-' : '+'}] advanced settings
            </button>

            {showAdvanced && (
              <div className="flex flex-col gap-4 border-l-2 border-[#1E1E32] pl-4">
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-[#5E5E7A]">
                    {'>'} max bid (USDC)
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={maxBid}
                    onChange={(e) => setMaxBid(e.target.value)}
                    placeholder="No limit"
                    className="border border-[#1E1E32] bg-[#0C0C1D] px-3 py-2 font-mono text-sm text-[#EEEEF5] placeholder:text-[#3A3A58] focus:border-[#6EE7B7] focus:outline-none"
                  />
                </label>
                <div className="grid grid-cols-3 gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-[#5E5E7A]">
                      {'>'} snipe window (s)
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={snipeWindow}
                      onChange={(e) => setSnipeWindow(e.target.value)}
                      className="border border-[#1E1E32] bg-[#0C0C1D] px-3 py-2 font-mono text-sm text-[#EEEEF5] focus:border-[#6EE7B7] focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-[#5E5E7A]">
                      {'>'} extension (s)
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={extension}
                      onChange={(e) => setExtension(e.target.value)}
                      className="border border-[#1E1E32] bg-[#0C0C1D] px-3 py-2 font-mono text-sm text-[#EEEEF5] focus:border-[#6EE7B7] focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-[#5E5E7A]">
                      {'>'} max ext.
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={maxExtensions}
                      onChange={(e) => setMaxExtensions(e.target.value)}
                      className="border border-[#1E1E32] bg-[#0C0C1D] px-3 py-2 font-mono text-sm text-[#EEEEF5] focus:border-[#6EE7B7] focus:outline-none"
                    />
                  </label>
                </div>
              </div>
            )}

            {error && (
              <p className="font-mono text-xs text-[#F87171]">
                {'>'} error: {error}
              </p>
            )}

            <PixelButton type="submit" disabled={submitting} className="mt-2">
              {submitting ? '[ creating... ]' : '[ create_auction ]'}
            </PixelButton>
          </form>
        </PixelCard>
      </div>
    </AuctionShell>
  )
}
