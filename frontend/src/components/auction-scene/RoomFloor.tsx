'use client'

import { cn } from '@/lib/utils'

interface RoomFloorProps {
  /** Whether a bidding war is active (intensifies effects) */
  isChaosMode: boolean
  className?: string
  children?: React.ReactNode
}

/**
 * Isometric room backdrop with checkered tiles, neon strip lighting,
 * scanline overlay, and floating pixel dust particles.
 */
export function RoomFloor({ isChaosMode, className, children }: RoomFloorProps) {
  return (
    <div
      className={cn(
        'relative w-full overflow-hidden border border-[#1a2a40] bg-[#04050a]',
        className
      )}
      style={{ aspectRatio: '16 / 9' }}
    >
      {/* Checkered floor (isometric perspective) */}
      <div
        className="absolute inset-x-0 bottom-0 h-[55%]"
        style={{
          background: `
            repeating-conic-gradient(
              #0a0f1e 0% 25%, #111827 0% 50%
            ) 0 0 / 40px 40px`,
          transform: 'perspective(600px) rotateX(55deg)',
          transformOrigin: 'center bottom',
        }}
      >
        {/* Floor neon glow pools */}
        <div
          className="absolute left-[8%] top-[20%] h-32 w-32 rounded-full opacity-30"
          style={{
            background: 'radial-gradient(circle, #6EE7B720 0%, transparent 70%)',
            filter: 'blur(20px)',
          }}
        />
        <div
          className="absolute right-[20%] top-[30%] h-24 w-24 rounded-full opacity-25"
          style={{
            background: 'radial-gradient(circle, #A78BFA20 0%, transparent 70%)',
            filter: 'blur(16px)',
          }}
        />
      </div>

      {/* Back wall */}
      <div
        className="absolute inset-x-0 top-0 h-[50%]"
        style={{
          background: 'linear-gradient(180deg, #080c18 0%, #0d1424 60%, #101b27 100%)',
        }}
      >
        {/* Wall texture — subtle brick pattern */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: `
              linear-gradient(90deg, #3a5070 1px, transparent 1px),
              linear-gradient(0deg, #3a5070 1px, transparent 1px)
            `,
            backgroundSize: '32px 16px',
          }}
        />
        {/* Neon strip light on wall */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px]"
          style={{
            background: 'linear-gradient(90deg, transparent 5%, #6EE7B740 20%, #F5C46E40 50%, #A78BFA40 80%, transparent 95%)',
            boxShadow: '0 0 12px 2px rgba(110,231,183,0.15), 0 0 24px 4px rgba(167,139,250,0.1)',
          }}
        />
      </div>

      {/* Scanline overlay */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 z-30',
          isChaosMode ? 'opacity-[0.08]' : 'opacity-[0.03]'
        )}
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.4) 2px, rgba(0,0,0,0.4) 4px)',
          transition: 'opacity 0.5s ease',
        }}
      />

      {/* Floating pixel dust particles */}
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={`dust-${i}`}
            className="absolute animate-pixel-float"
            style={{
              left: `${8 + (i * 7.3) % 84}%`,
              bottom: `${10 + (i * 13.7) % 60}%`,
              width: '2px',
              height: '2px',
              backgroundColor: i % 3 === 0 ? '#6EE7B730' : i % 3 === 1 ? '#A78BFA30' : '#F5C46E30',
              animationDelay: `${i * 0.8}s`,
              animationDuration: `${6 + (i % 4) * 2}s`,
            }}
          />
        ))}
      </div>

      {/* Chaos mode screen shake & intensified glow */}
      {isChaosMode && (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            boxShadow: 'inset 0 0 80px 20px rgba(110,231,183,0.04), inset 0 0 120px 40px rgba(245,196,110,0.03)',
            animation: 'scene-shake 0.15s linear infinite',
          }}
        />
      )}

      {/* Scene content container (agents, host, board, etc.) */}
      <div className="relative z-20 h-full w-full">
        {children}
      </div>

      {/* Inline keyframes for shake */}
      <style jsx>{`
        @keyframes scene-shake {
          0%   { transform: translate(0, 0); }
          25%  { transform: translate(-1px, 1px); }
          50%  { transform: translate(1px, -1px); }
          75%  { transform: translate(-1px, -1px); }
          100% { transform: translate(1px, 1px); }
        }
      `}</style>
    </div>
  )
}
