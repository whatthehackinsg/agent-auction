'use client'
import { SectionShell } from '@/components/landing/SectionShell'
import { StatCard } from '@/components/stats/StatCard'
import { usePlatformStats } from '@/hooks/usePlatformStats'
import { useCountUp } from '@/hooks/useCountUp'
import { cn } from '@/lib/utils'

export function UsdcStatCard({ value, isLoading }: { value: string; isLoading: boolean }) {
  // Convert base units string to display number for animation
  const baseUnits = isLoading ? 0 : Number(BigInt(value || '0') / BigInt(1_000_000))
  const animated = useCountUp(baseUnits)
  const displayValue = `${animated.toLocaleString()} USDC`

  return (
    <StatCard
      accent="gold"
      label="Bond Required"
      value={baseUnits}
      displayValue={displayValue}
      headerLabel="bonds.total"
    />
  )
}

export function PlatformStatsSection({ className }: { className?: string }) {
  const { stats, isLoading, error } = usePlatformStats()

  // Don't render section at all if there's an error (graceful degradation — page still works)
  if (error) return null

  return (
    <SectionShell tag="[ :: PLATFORM_STATS :: ]" showBraces={false} className={cn('py-8 md:py-12', className)}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        {/* Row 1: Total Auctions, USDC Bonded, Total Bids */}
        <StatCard
          accent="mint"
          label="Total Auctions"
          value={isLoading ? 0 : (stats?.totalAuctions ?? 0)}
          headerLabel="auctions.total"
        />
        <UsdcStatCard
          value={stats?.totalUsdcBonded ?? '0'}
          isLoading={isLoading}
        />
        <StatCard
          accent="violet"
          label="Total Bids"
          value={isLoading ? 0 : (stats?.totalBids ?? 0)}
          headerLabel="bids.total"
        />

        {/* Row 2: Active Auctions, Settled Auctions, Unique Agents */}
        <StatCard
          accent="rose"
          label="Active Auctions"
          value={isLoading ? 0 : (stats?.activeAuctions ?? 0)}
          headerLabel="auctions.active"
        />
        <StatCard
          accent="mint"
          label="Settled Auctions"
          value={isLoading ? 0 : (stats?.settledAuctions ?? 0)}
          headerLabel="auctions.settled"
        />
        <StatCard
          accent="gold"
          label="Unique Agents"
          value={isLoading ? 0 : (stats?.uniqueAgents ?? 0)}
          headerLabel="agents.unique"
        />
      </div>
    </SectionShell>
  )
}
