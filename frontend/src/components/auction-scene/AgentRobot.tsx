'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { truncateHex } from '@/lib/format'
import type { SceneAgent } from './types'
import { SEAT_POSITIONS, prefersReducedMotion } from './utils'

interface AgentRobotProps {
  agent: SceneAgent
}

/**
 * Cute pixel robot agent.
 * CSS/SVG geometric shapes with unique colors from agentId hash.
 * Floating name tag above, idle bob animation, and bid reaction.
 */
export function AgentRobot({ agent }: AgentRobotProps) {
  const seat = SEAT_POSITIONS[agent.seatIndex] ?? SEAT_POSITIONS[0]
  const reduced = prefersReducedMotion()

  return (
    <motion.div
      className="absolute z-10"
      style={{
        left: `${seat.x}%`,
        top: `${seat.y}%`,
        transform: 'translate(-50%, -100%)',
      }}
      initial={{ opacity: 0, scale: 0, y: 20 }}
      animate={{
        opacity: 1,
        scale: agent.isBidding ? 1.2 : 1,
        y: 0,
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 20,
      }}
    >
      {/* Bidding glow ring */}
      {agent.isBidding && (
        <motion.div
          className="absolute -inset-3 z-0 rounded-full"
          style={{
            background: `radial-gradient(circle, ${agent.color}40 0%, transparent 70%)`,
            boxShadow: `0 0 20px 4px ${agent.color}30`,
          }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1.4 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        />
      )}

      {/* Name tag */}
      <div
        className="absolute -top-6 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-wider"
        style={{
          backgroundColor: '#0a0f1eE0',
          borderColor: agent.color + '60',
          color: agent.color,
          textShadow: `0 0 6px ${agent.color}50`,
        }}
      >
        {truncateHex(agent.agentId, 6, 4)}
      </div>

      {/* Robot body */}
      <svg
        width="48"
        height="58"
        viewBox="0 0 36 44"
        className={cn('relative z-10', !reduced && 'animate-pixel-float')}
        style={{
          animationDuration: `${3 + (agent.seatIndex % 3)}s`,
          filter: agent.isBidding ? `drop-shadow(0 0 6px ${agent.color})` : 'none',
          imageRendering: 'pixelated',
        }}
      >
        {/* Antenna */}
        <rect x="17" y="0" width="2" height="6" fill={agent.color} rx="1" />
        <circle cx="18" cy="1" r="2" fill={agent.color} opacity="0.8" />

        {/* Head */}
        <RobotHead shape={agent.headShape} color={agent.color} dim={agent.colorDim} />

        {/* Eyes */}
        <rect x="11" y="12" width="4" height="4" fill="#04050a" rx="1" />
        <rect x="21" y="12" width="4" height="4" fill="#04050a" rx="1" />
        {/* Eye glow */}
        <rect x="12" y="13" width="2" height="2" fill={agent.color} opacity="0.9" />
        <rect x="22" y="13" width="2" height="2" fill={agent.color} opacity="0.9" />

        {/* Mouth */}
        <rect x="14" y="18" width="8" height="2" fill={agent.colorDim} rx="0.5" />

        {/* Body */}
        <rect x="8" y="24" width="20" height="14" fill={agent.colorDim} rx="2" />
        <rect x="10" y="26" width="16" height="10" fill="#04050a" rx="1" opacity="0.4" />
        {/* Body accent line */}
        <rect x="14" y="27" width="8" height="1" fill={agent.color} opacity="0.6" />
        <rect x="14" y="30" width="8" height="1" fill={agent.color} opacity="0.4" />

        {/* Bidding arm raised */}
        {agent.isBidding && (
          <>
            <rect x="28" y="18" width="4" height="10" fill={agent.colorDim} rx="1" />
            <rect x="27" y="14" width="6" height="6" fill={agent.color} rx="1" />
            <text x="29" y="19" fontSize="6" fill="#04050a" fontWeight="bold" textAnchor="middle">!</text>
          </>
        )}

        {/* Legs */}
        <rect x="11" y="38" width="5" height="6" fill={agent.colorDim} rx="1" />
        <rect x="20" y="38" width="5" height="6" fill={agent.colorDim} rx="1" />
      </svg>

      {/* Exclamation mark on bid */}
      {agent.isBidding && (
        <motion.div
          className="absolute -right-2 -top-4 z-30 font-mono text-sm font-black"
          style={{ color: agent.color, textShadow: `0 0 8px ${agent.color}` }}
          initial={{ opacity: 0, scale: 0, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
        >
          !
        </motion.div>
      )}
    </motion.div>
  )
}

/** Robot head shape variants. */
function RobotHead({ shape, color, dim }: { shape: string; color: string; dim: string }) {
  switch (shape) {
    case 'round':
      return (
        <>
          <circle cx="18" cy="13" r="10" fill={dim} />
          <circle cx="18" cy="13" r="10" fill="none" stroke={color} strokeWidth="1.5" opacity="0.6" />
        </>
      )
    case 'hex':
      return (
        <>
          <polygon points="18,3 28,8 28,18 18,23 8,18 8,8" fill={dim} />
          <polygon points="18,3 28,8 28,18 18,23 8,18 8,8" fill="none" stroke={color} strokeWidth="1.5" opacity="0.6" />
        </>
      )
    case 'triangle':
      return (
        <>
          <polygon points="18,3 30,23 6,23" fill={dim} />
          <polygon points="18,3 30,23 6,23" fill="none" stroke={color} strokeWidth="1.5" opacity="0.6" />
        </>
      )
    default: // square
      return (
        <>
          <rect x="6" y="5" width="24" height="18" fill={dim} rx="2" />
          <rect x="6" y="5" width="24" height="18" fill="none" stroke={color} strokeWidth="1.5" rx="2" opacity="0.6" />
        </>
      )
  }
}
