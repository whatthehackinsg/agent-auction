'use client'

import { useState, useMemo } from 'react'
import {
  useDynamicContext,
  useWalletOptions,
  useIsLoggedIn,
} from '@dynamic-labs/sdk-react-core'
import { PixelButton } from '@/components/ui/PixelButton'

export function WalletButton() {
  const { primaryWallet, handleLogOut, sdkHasLoaded } = useDynamicContext()
  const isLoggedIn = useIsLoggedIn()
  const { selectWalletOption, walletOptions } = useWalletOptions()

  const [open, setOpen] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  if (!sdkHasLoaded) {
    return (
      <span className="font-mono text-[10px] tracking-wide text-[#5E5E7A]">
        loading...
      </span>
    )
  }

  // Connected state
  if (isLoggedIn && primaryWallet) {
    const addr = primaryWallet.address
    const truncated = `${addr.slice(0, 6)}...${addr.slice(-4)}`

    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 border border-[#1E1E32] bg-[#0C0C1D] px-2.5 py-1.5 font-mono text-[10px] tracking-wide text-[#6EE7B7] transition-colors hover:border-[#6EE7B7]"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#6EE7B7]" />
          {truncated}
        </button>

        {open && (
          <Modal onClose={() => setOpen(false)}>
            <div className="border-b border-[#1E1E32] px-5 py-3">
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#5E5E7A]">
                {"// connected"}
              </p>
              <p className="mt-1 font-mono text-xs text-[#EEEEF5] break-all">
                {addr}
              </p>
            </div>
            <button
              onClick={() => { handleLogOut(); setOpen(false) }}
              className="w-full px-5 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-[#F87171] transition-colors hover:bg-[#1E1E32]"
            >
              {'>'} disconnect
            </button>
          </Modal>
        )}
      </>
    )
  }

  // Disconnected — wallet picker modal
  return (
    <>
      <PixelButton size="sm" onClick={() => { setOpen(true); setSearch('') }}>
        [ connect_wallet ]
      </PixelButton>

      {open && (
        <WalletPickerModal
          walletOptions={walletOptions}
          search={search}
          setSearch={setSearch}
          connecting={connecting}
          onConnect={async (key) => {
            setConnecting(key)
            try {
              await selectWalletOption(key)
            } catch {
              // User rejected or wallet error
            } finally {
              setConnecting(null)
              setOpen(false)
            }
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

// ── Centered modal overlay ────────────────────────────────────────────

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-[380px] mx-4 border border-[#1E1E32] bg-[#0A0B14] shadow-[4px_4px_0_0_rgba(58,58,88,0.6)]">
        {/* Title bar */}
        <div className="flex items-center justify-between border-b border-[#1E1E32] bg-[#06070f] px-4 py-2.5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#5E5E7A]">
            {"// wallet"}
          </span>
          <button
            onClick={onClose}
            className="font-mono text-[10px] text-[#5E5E7A] transition-colors hover:text-[#F87171]"
          >
            [X]
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Wallet picker with search ─────────────────────────────────────────

type WalletOption = { key: string; name: string; isInstalledOnBrowser: boolean }

function WalletPickerModal({
  walletOptions,
  search,
  setSearch,
  connecting,
  onConnect,
  onClose,
}: {
  walletOptions: WalletOption[]
  search: string
  setSearch: (v: string) => void
  connecting: string | null
  onConnect: (key: string) => void
  onClose: () => void
}) {
  const query = search.toLowerCase().trim()

  const filtered = useMemo(
    () => walletOptions.filter((w) => w.name.toLowerCase().includes(query)),
    [walletOptions, query],
  )

  const installed = filtered.filter((w) => w.isInstalledOnBrowser)
  const others = filtered.filter((w) => !w.isInstalledOnBrowser)

  return (
    <Modal onClose={onClose}>
      {/* Search */}
      <div className="border-b border-[#1E1E32] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-[#6EE7B7]">{'>'}</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search wallets..."
            autoFocus
            className="flex-1 bg-transparent font-mono text-xs text-[#EEEEF5] placeholder:text-[#3A3A58] focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="font-mono text-[10px] text-[#5E5E7A] hover:text-[#EEEEF5]"
            >
              [c]
            </button>
          )}
        </div>
      </div>

      {/* Wallet list */}
      <div className="max-h-[320px] overflow-y-auto">
        {installed.length > 0 && (
          <>
            <p className="px-4 pt-3 pb-1 font-mono text-[8px] uppercase tracking-widest text-[#6EE7B7]">
              detected
            </p>
            {installed.map((w) => (
              <WalletRow
                key={w.key}
                name={w.name}
                connecting={connecting === w.key}
                installed
                onClick={() => onConnect(w.key)}
              />
            ))}
          </>
        )}

        {others.length > 0 && (
          <>
            <p className="px-4 pt-3 pb-1 font-mono text-[8px] uppercase tracking-widest text-[#5E5E7A]">
              available
            </p>
            {others.map((w) => (
              <WalletRow
                key={w.key}
                name={w.name}
                connecting={connecting === w.key}
                installed={false}
                onClick={() => onConnect(w.key)}
              />
            ))}
          </>
        )}

        {filtered.length === 0 && (
          <p className="px-4 py-6 text-center font-mono text-[10px] text-[#5E5E7A]">
            {walletOptions.length === 0
              ? 'no wallets configured'
              : `no wallets matching "${search}"`}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-[#1E1E32] px-4 py-2">
        <p className="font-mono text-[8px] text-[#3A3A58]">
          {walletOptions.length} wallet{walletOptions.length !== 1 ? 's' : ''} available
        </p>
      </div>
    </Modal>
  )
}

// ── Single wallet row ─────────────────────────────────────────────────

function WalletRow({
  name,
  connecting,
  installed,
  onClick,
}: {
  name: string
  connecting: boolean
  installed: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={connecting}
      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left font-mono text-[11px] text-[#EEEEF5] transition-colors hover:bg-[#1E1E32] disabled:opacity-50"
    >
      <span className="text-[#C4B5FD]">{'>'}</span>
      <span className="flex-1 tracking-wide">{name}</span>
      {installed && (
        <span className="rounded bg-[#6EE7B7]/10 px-1.5 py-0.5 text-[8px] uppercase tracking-widest text-[#6EE7B7]">
          installed
        </span>
      )}
      {connecting && (
        <span className="animate-pulse text-[#F5C46E]">...</span>
      )}
    </button>
  )
}
