'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { prefersReducedMotion } from './utils'

interface ComboCounterProps {
  count: number
}

const COMBO_LABELS: Record<number, string> = {
  2: '2x COMBO!',
  3: '3x COMBO!',
  4: '4x COMBO!',
  5: '5x COMBO!!',
  6: '6x COMBO!!',
  7: '7x COMBO!!!',
  8: '8x COMBO!!!',
  9: '9x MEGA COMBO!!!!',
  10: 'ARE YOU EVEN HUMAN?? (oh right, you\'re not)',
}

function comboLabel(count: number): string {
  if (count < 2) return ''
  if (count >= 10) return COMBO_LABELS[10] ?? ''
  return COMBO_LABELS[count] ?? `${count}x COMBO!`
}

/**
 * Escalating combo counter display.
 * Appears when bids arrive within 2 seconds of each other.
 */
export function ComboCounter({ count }: ComboCounterProps) {
  const reduced = prefersReducedMotion()
  const label = comboLabel(count)
  if (!label) return null

  // Escalate visual intensity with combo count
  const intensity = Math.min(count, 10)
  const fontSize = 12 + intensity * 1.5
  const glowStrength = 4 + intensity * 2

  return (
    <div
      className="absolute right-[6%] top-[8%] z-40"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={`combo-${count}`}
          className="font-mono font-black uppercase tracking-[0.15em]"
          style={{
            fontSize: `${fontSize}px`,
            background: count >= 5
              ? 'linear-gradient(90deg, #F5C46E, #FDA4AF, #A78BFA, #6EE7B7)'
              : 'linear-gradient(90deg, #F5C46E, #6EE7B7)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: `drop-shadow(0 0 ${glowStrength}px rgba(245,196,110,0.6))`,
          }}
          initial={reduced ? false : { scale: 2, opacity: 0, rotate: -5 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={reduced ? undefined : { scale: 0.5, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        >
          {label}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
