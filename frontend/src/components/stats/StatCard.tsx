'use client'
import { PixelPanel } from '@/components/landing/PixelPanel'
import { type AccentTone, accentStyles } from '@/components/landing/accent'
import { useCountUp } from '@/hooks/useCountUp'
import { cn } from '@/lib/utils'

interface StatCardProps {
  accent: AccentTone
  label: string
  value: number
  displayValue?: string   // override for formatted values (e.g. USDC)
  headerLabel: string
}

export function StatCard({ accent, label, value, displayValue, headerLabel }: StatCardProps) {
  const animated = useCountUp(value)
  const tone = accentStyles[accent]

  return (
    <PixelPanel accent={accent} headerLabel={headerLabel}>
      <div className="flex flex-col gap-1">
        <span className={cn('font-mono text-3xl font-bold tabular-nums leading-none md:text-4xl', tone.value)}>
          {displayValue ?? animated.toLocaleString()}
        </span>
        <span className={cn('font-mono text-[10px] font-bold uppercase tracking-[0.14em] mt-2', tone.label)}>
          {label}
        </span>
      </div>
    </PixelPanel>
  )
}
