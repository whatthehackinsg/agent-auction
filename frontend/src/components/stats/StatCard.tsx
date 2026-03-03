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
    <div className={cn('group relative', `stat-glow-${accent}`)}>
      {/* Shimmer border overlay */}
      <div
        className="animate-stat-shimmer pointer-events-none absolute inset-0 z-20 overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(90deg, transparent 0%, rgba(${tone.glowRgb}, 0.15) 50%, transparent 100%)`,
            backgroundSize: '200% 100%',
            maskImage: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            maskComposite: 'exclude',
            WebkitMaskComposite: 'xor',
            padding: '2px',
          }}
        />
      </div>

      <PixelPanel accent={accent} headerLabel={headerLabel} className="relative z-10">
        <div className="flex flex-col gap-1">
          <span className={cn('font-mono text-3xl font-bold tabular-nums leading-none md:text-4xl', tone.value)}>
            {displayValue ?? animated.toLocaleString()}
          </span>
          <span className={cn('font-mono text-[10px] font-bold uppercase tracking-[0.14em] mt-2', tone.label)}>
            {label}
          </span>
        </div>
      </PixelPanel>
    </div>
  )
}
