'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { truncateHex } from '@/lib/format'
import { agentPalette, prefersReducedMotion } from './utils'

interface AgentEntryBannerProps {
  /** Agent ID that just joined, or null if none. */
  agentId: string | null
  /** Called when the entry animation completes. */
  onComplete: () => void
}

/**
 * "NEW CHALLENGER" fighting-game-style entry banner.
 * Flashes across the scene when a new agent joins the auction room.
 * Renders as a horizontal bar that slashes in from the left,
 * holds briefly, then exits right.
 */
export function AgentEntryBanner({ agentId, onComplete }: AgentEntryBannerProps) {
  const reduced = prefersReducedMotion()

  if (reduced || !agentId) return null

  const palette = agentPalette(agentId)

  return (
    <AnimatePresence>
      <motion.div
        key={`entry-${agentId}`}
        className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1 }}
        onAnimationComplete={onComplete}
      >
        {/* Diagonal slash line (top) */}
        <motion.div
          className="absolute left-0 right-0 h-[2px]"
          style={{
            top: 'calc(50% - 32px)',
            background: `linear-gradient(90deg, transparent 0%, ${palette.color}80 20%, ${palette.color} 50%, ${palette.color}80 80%, transparent 100%)`,
            boxShadow: `0 0 12px 2px ${palette.color}40`,
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        />

        {/* Main banner bar */}
        <motion.div
          className="absolute left-0 right-0 flex items-center justify-center py-3"
          style={{
            top: 'calc(50% - 30px)',
            height: '60px',
            background: `linear-gradient(90deg, transparent 0%, #060a14E0 15%, #060a14F8 50%, #060a14E0 85%, transparent 100%)`,
          }}
          initial={{ clipPath: 'inset(0 100% 0 0)' }}
          animate={{ clipPath: 'inset(0 0% 0 0)' }}
          exit={{ clipPath: 'inset(0 0 0 100%)' }}
          transition={{
            duration: 0.3,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <div className="flex items-center gap-4">
            {/* Lightning bolt left */}
            <motion.span
              className="text-sm"
              style={{ color: palette.color }}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 0.3, repeat: 4 }}
            >
              ⚡
            </motion.span>

            {/* NEW CHALLENGER text */}
            <div className="text-center">
              <motion.div
                className="font-mono text-[8px] font-black uppercase tracking-[0.4em] text-[#5e5e7a]"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                new challenger
              </motion.div>
              <motion.div
                className="font-mono text-lg font-black uppercase tracking-[0.15em]"
                style={{
                  color: palette.color,
                  textShadow: `0 0 16px ${palette.color}80, 0 0 32px ${palette.color}40`,
                }}
                initial={{ opacity: 0, scale: 1.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 15 }}
              >
                {truncateHex(agentId, 8, 6)}
              </motion.div>
            </div>

            {/* Lightning bolt right */}
            <motion.span
              className="text-sm"
              style={{ color: palette.color }}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 0.3, repeat: 4, delay: 0.1 }}
            >
              ⚡
            </motion.span>
          </div>
        </motion.div>

        {/* Diagonal slash line (bottom) */}
        <motion.div
          className="absolute left-0 right-0 h-[2px]"
          style={{
            top: 'calc(50% + 32px)',
            background: `linear-gradient(90deg, transparent 0%, ${palette.color}80 20%, ${palette.color} 50%, ${palette.color}80 80%, transparent 100%)`,
            boxShadow: `0 0 12px 2px ${palette.color}40`,
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut', delay: 0.05 }}
        />

        {/* Auto-dismiss after 2s */}
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ delay: 1.8, duration: 0.3 }}
          onAnimationComplete={onComplete}
        />
      </motion.div>
    </AnimatePresence>
  )
}
