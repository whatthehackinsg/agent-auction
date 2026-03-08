'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { PixelMenu, type PixelMenuItem } from '@/components/ui/PixelMenu'
import { DoodleXBadge } from '@/components/ui/DoodleXBadge'

const WalletButton = dynamic(
  () => import('@/components/wallet/WalletButton').then((m) => m.WalletButton),
  { ssr: false },
)

const menuItems: PixelMenuItem[] = [
  { label: 'HOME', href: '/' },
  { label: 'AUCTIONS', href: '/auctions' },
  { label: 'CREATE', href: '/auctions/create' },
  { label: 'TASK BOARD', href: '/tasks' },
]

export function AuctionShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#04050a] text-[#EEEEF5]">
      <main className="relative w-full overflow-hidden">
        <div className="relative z-10 mx-auto w-full max-w-[1760px] border-x border-[#121d34]">
          <header className="flex items-center justify-between bg-[#05060e]/95 px-5 py-4 md:px-8">
            <Link
              href="/"
              className="flex items-center gap-2 font-mono text-sm font-bold tracking-[0.08em] text-[#EEEEF5]"
            >
              <span className="text-[#6EE7B7]">{'>'}</span>
              <span>AUCTION</span>
            </Link>

            <div className="flex items-center gap-3 md:gap-5">
              <PixelMenu items={menuItems} accentColor="#6EE7B7" />
              <WalletButton />
            </div>
          </header>

          <div className="px-6 py-8 md:px-[52px] md:py-10">{children}</div>

          <footer className="relative z-10 flex flex-col gap-2 bg-[#090a16] px-6 py-6 text-xs md:flex-row md:items-center md:justify-between md:px-8">
            <p className="font-mono text-[#5E5E7A]">{'> AUCTION // live spectator terminal'}</p>
            <DoodleXBadge username="@whatthehackinsg" />
          </footer>
        </div>
      </main>
    </div>
  )
}
