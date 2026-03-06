'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { BOARD_POSITION, prefersReducedMotion } from './utils'

interface FlipBoardProps {
  /** Current highest bid in base units (string). */
  value: string
  /** Whether the board should flash on update. */
  isFlashing: boolean
  /** Whether chaos mode (bidding war) is active. */
  isChaosMode: boolean
}

/**
 * Mechanical flip-digit price board.
 * Airport departure board style: each digit cell flips with a Y transform.
 * Shows USDC formatted value in gold on dark background.
 */
export function FlipBoard({ value, isFlashing, isChaosMode }: FlipBoardProps) {
  const reduced = prefersReducedMotion()
  const displayValue = formatBoardValue(value)

  return (
    <div
      className="absolute z-20"
      style={{
        left: `${BOARD_POSITION.x}%`,
        top: `${BOARD_POSITION.y}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Board frame */}
      <div
        className={cn(
          'relative border-2 px-3 py-2',
          isFlashing ? 'border-[#F5C46E]' : 'border-[#2a3548]'
        )}
        style={{
          background: 'linear-gradient(180deg, #0a0f1e 0%, #060a14 100%)',
          boxShadow: isFlashing
            ? '0 0 30px 8px rgba(245,196,110,0.25), inset 0 0 20px rgba(245,196,110,0.1)'
            : '0 0 20px 4px rgba(0,0,0,0.5), inset 0 0 10px rgba(0,0,0,0.3)',
          transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
        }}
      >
        {/* CRT flicker on board */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(245,196,110,0.1) 1px, rgba(245,196,110,0.1) 2px)',
          }}
        />

        {/* HIGHEST BID label */}
        <div className="mb-1 text-center font-mono text-[7px] font-bold uppercase tracking-[0.2em] text-[#5e4a2a]">
          highest bid
        </div>

        {/* Digit cells */}
        <div className="flex items-center gap-[2px]">
          {displayValue.split('').map((char, idx) => (
            <FlipDigit key={`digit-${idx}`} value={char} index={idx} reduced={reduced} isChaosMode={isChaosMode} />
          ))}
          <span className="ml-1.5 font-mono text-[10px] font-bold text-[#8B6914]">USDC</span>
        </div>

        {/* Bidding war label */}
        {isChaosMode && (
          <motion.div
            className="mt-1 text-center font-mono text-[8px] font-black uppercase tracking-[0.3em]"
            style={{
              background: 'linear-gradient(90deg, #6EE7B7, #F5C46E)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 0.4, repeat: Infinity }}
          >
            ⚡ bidding war ⚡
          </motion.div>
        )}
      </div>
    </div>
  )
}

/** Individual flip digit cell. */
function FlipDigit({
  value,
  index,
  reduced,
  isChaosMode,
}: {
  value: string
  index: number
  reduced: boolean
  isChaosMode: boolean
}) {
  const isDigit = /\d/.test(value)
  const isSeparator = value === '.' || value === ','

  if (isSeparator) {
    return (
      <span className="font-mono text-lg font-bold text-[#F5C46E] opacity-60">
        {value}
      </span>
    )
  }

  return (
    <div
      className="relative overflow-hidden border border-[#1a2a3d]"
      style={{
        width: isDigit ? '20px' : '14px',
        height: '28px',
        background: 'linear-gradient(180deg, #0c1220 0%, #060a14 49%, #0a0e1c 50%, #080c18 100%)',
      }}
    >
      {/* Split line in the middle (flip board aesthetic) */}
      <div className="absolute inset-x-0 top-1/2 h-[1px] bg-[#000] opacity-40" />

      <AnimatePresence mode="popLayout">
        <motion.span
          key={`${index}-${value}`}
          className={cn(
            'absolute inset-0 flex items-center justify-center font-mono text-lg font-black',
            isDigit ? 'text-[#F5C46E]' : 'text-[#8B6914]'
          )}
          style={{
            textShadow: isDigit ? '0 0 8px rgba(245,196,110,0.5)' : 'none',
          }}
          initial={reduced ? false : { rotateX: -90, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          exit={reduced ? undefined : { rotateX: 90, opacity: 0 }}
          transition={{
            duration: isChaosMode ? 0.15 : 0.3,
            delay: index * 0.03,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  )
}

/** Format a USDC base units string into a display string for the board. */
function formatBoardValue(amountBaseUnits: string): string {
  try {
    const amount = BigInt(amountBaseUnits || '0')
    const whole = amount / BigInt(1_000_000)
    const frac = amount % BigInt(1_000_000)

    const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

    if (frac === BigInt(0)) return wholeStr
    // Show up to 6 decimals but drop trailing zeros; keep at least 2
    const fracFull = frac.toString().padStart(6, '0').replace(/0+$/, '')
    const fracStr = fracFull.length < 2 ? fracFull.padEnd(2, '0') : fracFull
    return `${wholeStr}.${fracStr}`
  } catch {
    return '0'
  }
}
