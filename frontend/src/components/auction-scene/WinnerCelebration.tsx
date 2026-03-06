'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { truncateHex, formatUsdc } from '@/lib/format'
import { agentPalette, prefersReducedMotion } from './utils'

interface WinnerCelebrationProps {
  /** The winning agent's ID (null = no winner yet). */
  winnerAgentId: string | null
  /** The winning bid amount in base USDC units. */
  winnerAmount: string | null
  /** Whether the auction is settled/closed with a winner. */
  isSettled: boolean
}

/** Number of confetti particles to generate. */
const CONFETTI_COUNT = 48

/** Confetti shapes. */
const SHAPES = ['square', 'circle', 'triangle', 'diamond'] as const

interface Particle {
  id: number
  x: number      // start x %
  delay: number   // animation delay s
  duration: number // fall duration s
  size: number    // px
  color: string
  shape: typeof SHAPES[number]
  rotation: number
  drift: number   // horizontal drift %
}

/**
 * Winner celebration overlay.
 * Shows confetti particles raining down, a glowing winner banner,
 * and pulsing "SOLD!" text. Triggers when auction is settled.
 */
export function WinnerCelebration({ winnerAgentId, winnerAmount, isSettled }: WinnerCelebrationProps) {
  const reduced = prefersReducedMotion()
  const [showBanner, setShowBanner] = useState(false)
  const triggered = useRef(false)

  const palette = useMemo(() => {
    if (!winnerAgentId) return null
    return agentPalette(winnerAgentId)
  }, [winnerAgentId])

  // Stagger the banner entrance
  useEffect(() => {
    if (isSettled && winnerAgentId && !triggered.current) {
      triggered.current = true
      const t = setTimeout(() => setShowBanner(true), 600)
      return () => clearTimeout(t)
    }
  }, [isSettled, winnerAgentId])

  // Generate confetti particles (deterministic from winnerAgentId)
  const particles: Particle[] = useMemo(() => {
    if (!isSettled || !winnerAgentId) return []
    const colors = ['#6EE7B7', '#F5C46E', '#A78BFA', '#FDA4AF', '#67E8F9', '#FDBA74', '#C084FC', '#BEF264']
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      x: (i * 17.3 + 5) % 100,
      delay: (i * 0.07) % 2.5,
      duration: 2.5 + (i % 5) * 0.6,
      size: 4 + (i % 4) * 2,
      color: colors[i % colors.length],
      shape: SHAPES[i % SHAPES.length],
      rotation: (i * 73) % 360,
      drift: ((i * 11) % 30) - 15,
    }))
  }, [isSettled, winnerAgentId])

  if (!isSettled || !winnerAgentId || reduced) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      {/* Confetti rain */}
      {particles.map((p) => (
        <ConfettiParticle key={p.id} particle={p} />
      ))}

      {/* Flash overlay */}
      <motion.div
        className="absolute inset-0"
        style={{ backgroundColor: palette?.color ?? '#F5C46E' }}
        initial={{ opacity: 0.5 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />

      {/* Winner banner */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            className="absolute left-1/2 top-[40%] z-50 -translate-x-1/2 -translate-y-1/2"
            initial={{ opacity: 0, scale: 0, rotate: -10 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 12 }}
          >
            {/* Glow backdrop */}
            <div
              className="absolute -inset-8 rounded-full opacity-40"
              style={{
                background: `radial-gradient(circle, ${palette?.color ?? '#F5C46E'}40 0%, transparent 70%)`,
                filter: 'blur(30px)',
              }}
            />

            <div
              className="relative border-2 px-6 py-4 text-center"
              style={{
                backgroundColor: '#060a14F0',
                borderColor: palette?.color ?? '#F5C46E',
                boxShadow: `0 0 40px 10px ${palette?.color ?? '#F5C46E'}30, inset 0 0 20px ${palette?.color ?? '#F5C46E'}10`,
              }}
            >
              {/* SOLD label */}
              <motion.div
                className="mb-2 font-mono text-[10px] font-black uppercase tracking-[0.4em]"
                style={{ color: palette?.color ?? '#F5C46E' }}
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 0.6, repeat: Infinity }}
              >
                SOLD!
              </motion.div>

              {/* Winner line */}
              <div className="font-mono text-xs font-bold text-[#EEEEF5]">
                winner: <span style={{ color: palette?.color ?? '#F5C46E' }}>{truncateHex(winnerAgentId, 8, 6)}</span>
              </div>

              {/* Amount */}
              {winnerAmount && (
                <div
                  className="mt-2 font-mono text-2xl font-black"
                  style={{
                    color: palette?.color ?? '#F5C46E',
                    textShadow: `0 0 12px ${palette?.color ?? '#F5C46E'}80`,
                  }}
                >
                  {formatUsdc(winnerAmount)} USDC
                </div>
              )}

              {/* Sparkle decorators */}
              <motion.span
                className="absolute -left-3 -top-3 text-lg"
                animate={{ rotate: [0, 180, 360], scale: [1, 1.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                ✦
              </motion.span>
              <motion.span
                className="absolute -bottom-3 -right-3 text-lg"
                style={{ color: palette?.color ?? '#F5C46E' }}
                animate={{ rotate: [360, 180, 0], scale: [1, 1.3, 1] }}
                transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
              >
                ✦
              </motion.span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline keyframes for confetti */}
      <style jsx>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(500px) rotate(720deg); opacity: 0; }
        }
        @keyframes confetti-drift {
          0%, 100% { margin-left: 0; }
          50%      { margin-left: var(--drift); }
        }
      `}</style>
    </div>
  )
}

/** Individual confetti particle. */
function ConfettiParticle({ particle }: { particle: Particle }) {
  const shapeStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${particle.x}%`,
    top: '-10px',
    width: `${particle.size}px`,
    height: `${particle.size}px`,
    backgroundColor: particle.color,
    opacity: 0,
    animation: `confetti-fall ${particle.duration}s ease-in ${particle.delay}s forwards`,
    transform: `rotate(${particle.rotation}deg)`,
    // @ts-expect-error CSS custom property for drift
    '--drift': `${particle.drift}px`,
  }

  switch (particle.shape) {
    case 'circle':
      return <div style={{ ...shapeStyle, borderRadius: '50%' }} />
    case 'diamond':
      return <div style={{ ...shapeStyle, transform: `rotate(${particle.rotation + 45}deg)` }} />
    case 'triangle':
      return (
        <div
          style={{
            ...shapeStyle,
            width: 0,
            height: 0,
            backgroundColor: 'transparent',
            borderLeft: `${particle.size / 2}px solid transparent`,
            borderRight: `${particle.size / 2}px solid transparent`,
            borderBottom: `${particle.size}px solid ${particle.color}`,
          }}
        />
      )
    default: // square
      return <div style={shapeStyle} />
  }
}
