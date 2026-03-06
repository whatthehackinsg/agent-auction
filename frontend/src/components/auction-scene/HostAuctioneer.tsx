'use client'

import { cn } from '@/lib/utils'
import { HOST_POSITION, prefersReducedMotion } from './utils'

interface HostAuctioneerProps {
  /** Whether a new bid just arrived (triggers gavel slam). */
  isSlamming: boolean
  /** Whether a bidding war is in progress. */
  isChaosMode: boolean
}

/**
 * The host/auctioneer: a taller pixel character at a podium
 * with a gavel that slams on each bid.
 */
export function HostAuctioneer({ isSlamming, isChaosMode }: HostAuctioneerProps) {
  const reduced = prefersReducedMotion()

  // Derive gavel angle directly from props — no refs needed
  const gavelAngle = isSlamming && !reduced ? -45 : 0


  return (
    <div
      className="absolute z-10"
      style={{
        left: `${HOST_POSITION.x}%`,
        top: `${HOST_POSITION.y}%`,
        transform: 'translate(-50%, -100%)',
      }}
    >
      {/* Shockwave ring on slam */}
      {isSlamming && !reduced && (
        <div
          className="absolute left-1/2 top-[80%] -translate-x-1/2 -translate-y-1/2"
          style={{
            width: '80px',
            height: '30px',
            borderRadius: '50%',
            border: '2px solid #F5C46E40',
            animation: 'shockwave-expand 0.5s ease-out forwards',
          }}
        />
      )}

      <svg
        width="52"
        height="68"
        viewBox="0 0 52 68"
        className={cn(
          'relative',
          !reduced && !isChaosMode && 'animate-pixel-float'
        )}
        style={{
          imageRendering: 'pixelated',
          animationDuration: '4s',
          filter: isChaosMode ? 'drop-shadow(0 0 8px #F5C46E60)' : 'none',
        }}
      >
        {/* Top hat / antenna hat */}
        <rect x="16" y="0" width="20" height="4" fill="#F5C46E" rx="1" />
        <rect x="18" y="0" width="16" height="14" fill="#2a1f0a" rx="1" />
        <rect x="18" y="0" width="16" height="14" fill="none" stroke="#F5C46E" strokeWidth="1" opacity="0.5" rx="1" />
        {/* Antenna nub on top */}
        <rect x="25" y="-3" width="2" height="4" fill="#F5C46E" />
        <circle cx="26" cy="-4" r="2" fill="#F5C46E" opacity="0.7" />

        {/* Head (larger than agents) */}
        <rect x="12" y="14" width="28" height="22" fill="#1a2a3d" rx="3" />
        <rect x="12" y="14" width="28" height="22" fill="none" stroke="#F5C46E" strokeWidth="1.5" rx="3" opacity="0.5" />

        {/* Monocle (right eye) */}
        <circle cx="33" cy="24" r="5" fill="none" stroke="#F5C46E" strokeWidth="1" opacity="0.7" />
        <rect x="37" y="24" width="6" height="1" fill="#F5C46E" opacity="0.3" />

        {/* Eyes */}
        <rect x="17" y="22" width="5" height="5" fill="#04050a" rx="1" />
        <rect x="30" y="22" width="5" height="5" fill="#04050a" rx="1" />
        {/* Eye glow */}
        <rect x="18" y="23" width="3" height="3" fill="#F5C46E" opacity="0.8" />
        <rect x="31" y="23" width="3" height="3" fill="#F5C46E" opacity="0.8" />

        {/* Mouth — changes with chaos mode */}
        {isChaosMode ? (
          <ellipse cx="26" cy="32" rx="5" ry="3" fill="#04050a" />
        ) : (
          <rect x="21" y="31" width="10" height="2" fill="#5e4a2a" rx="0.5" />
        )}

        {/* Body */}
        <rect x="14" y="36" width="24" height="20" fill="#1a2a3d" rx="2" />
        {/* Jacket accent */}
        <rect x="14" y="36" width="24" height="20" fill="none" stroke="#F5C46E" strokeWidth="1" rx="2" opacity="0.3" />
        <rect x="25" y="38" width="2" height="16" fill="#F5C46E" opacity="0.3" />

        {/* Gavel arm */}
        <g
          style={{
            transformOrigin: '44px 40px',
            transform: `rotate(${gavelAngle}deg)`,
            transition: reduced ? 'none' : 'transform 0.15s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {/* Arm */}
          <rect x="38" y="38" width="4" height="12" fill="#1a2a3d" rx="1" />
          {/* Gavel handle */}
          <rect x="36" y="32" width="2" height="14" fill="#8B6914" rx="0.5" />
          {/* Gavel head */}
          <rect x="32" y="28" width="10" height="6" fill="#F5C46E" rx="1" />
          <rect x="32" y="28" width="10" height="6" fill="none" stroke="#8B6914" strokeWidth="0.5" rx="1" />
        </g>

        {/* Left arm (idle) */}
        <rect x="10" y="38" width="4" height="12" fill="#1a2a3d" rx="1" />

        {/* Podium */}
        <rect x="4" y="56" width="44" height="12" fill="#151b2e" rx="2" />
        <rect x="4" y="56" width="44" height="12" fill="none" stroke="#F5C46E" strokeWidth="1" rx="2" opacity="0.3" />
        <rect x="8" y="58" width="36" height="2" fill="#F5C46E" opacity="0.15" />
      </svg>

      {/* Inline keyframes */}
      <style jsx>{`
        @keyframes shockwave-expand {
          0%   { transform: translate(-50%, -50%) scale(0.3); opacity: 0.8; }
          100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
