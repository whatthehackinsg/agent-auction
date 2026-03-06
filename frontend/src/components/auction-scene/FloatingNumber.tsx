'use client'

import { motion } from 'framer-motion'
import { formatUsdc } from '@/lib/format'
import type { SceneBidAnimation } from './types'
import { SEAT_POSITIONS, prefersReducedMotion } from './utils'

interface FloatingNumberProps {
  bid: SceneBidAnimation
  onComplete: () => void
}

/**
 * Fighting-game style floating damage number: "+250 USDC"
 * Rises from the agent position and fades out.
 */
export function FloatingNumber({ bid, onComplete }: FloatingNumberProps) {
  const seat = SEAT_POSITIONS[bid.seatIndex] ?? SEAT_POSITIONS[0]
  const reduced = prefersReducedMotion()

  if (reduced) return null

  return (
    <motion.div
      className="pointer-events-none absolute z-40 font-mono text-sm font-black"
      style={{
        left: `${seat.x}%`,
        top: `${seat.y - 10}%`,
        transform: 'translate(-50%, -100%)',
        color: bid.color,
        textShadow: `0 0 10px ${bid.color}, 0 2px 4px rgba(0,0,0,0.8)`,
        WebkitTextStroke: '0.5px rgba(0,0,0,0.5)',
      }}
      initial={{ opacity: 1, y: 0, scale: 0.5 }}
      animate={{ opacity: 0, y: -60, scale: 1.3 }}
      transition={{ duration: 1.2, ease: 'easeOut' }}
      onAnimationComplete={onComplete}
    >
      +{formatUsdc(bid.amount)}
    </motion.div>
  )
}
