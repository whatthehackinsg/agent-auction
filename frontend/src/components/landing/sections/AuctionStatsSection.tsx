'use client'
import { SectionShell } from '@/components/landing/SectionShell'
import { StatCard } from '@/components/stats/StatCard'
import { UsdcStatCard } from '@/components/landing/sections/PlatformStatsSection'
import { usePlatformStats } from '@/hooks/usePlatformStats'
import { cn } from '@/lib/utils'

export function AuctionStatsSection({ className }: { className?: string }) {
  const { stats, isLoading, error } = usePlatformStats()

  if (error) return null

  return (
    <SectionShell tag="[ :: AUCTION_STATS :: ]" showBraces={false} className={cn('py-8 md:py-12', className)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
        <StatCard
          accent="mint"
          label="Total Auctions"
          value={isLoading ? 0 : (stats?.totalAuctions ?? 0)}
          headerLabel="auctions.total"
        />
        <StatCard
          accent="rose"
          label="Active Auctions"
          value={isLoading ? 0 : (stats?.activeAuctions ?? 0)}
          headerLabel="auctions.active"
        />
        <UsdcStatCard
          value={stats?.totalUsdcBonded ?? '0'}
          isLoading={isLoading}
        />
      </div>
    </SectionShell>
  )
}
