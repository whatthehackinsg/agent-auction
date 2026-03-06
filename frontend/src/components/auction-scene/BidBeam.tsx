'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import type { SceneBidAnimation } from './types'
import { SEAT_POSITIONS, BOARD_POSITION, prefersReducedMotion } from './utils'

interface BidBeamProps {
  /** Active bid animation to render a beam for. */
  bid: SceneBidAnimation
  /** Called when the beam animation completes. */
  onComplete: () => void
}

/**
 * Neon laser beam from a bidding agent to the price board.
 * Implemented as an SVG line animated with GSAP.
 */
export function BidBeam({ bid, onComplete }: BidBeamProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const lineRef = useRef<SVGLineElement>(null)
  const glowRef = useRef<SVGLineElement>(null)

  const seat = SEAT_POSITIONS[bid.seatIndex] ?? SEAT_POSITIONS[0]
  const reduced = prefersReducedMotion()

  useEffect(() => {
    if (reduced || !lineRef.current || !glowRef.current) {
      onComplete()
      return
    }

    const tl = gsap.timeline({
      onComplete,
    })

    // Animate line from agent to board
    tl.fromTo(
      lineRef.current,
      { attr: { x2: `${seat.x}%`, y2: `${seat.y}%` }, opacity: 0 },
      {
        attr: { x2: `${BOARD_POSITION.x}%`, y2: `${BOARD_POSITION.y}%` },
        opacity: 1,
        duration: 0.25,
        ease: 'power2.out',
      }
    )
      .fromTo(
        glowRef.current,
        { attr: { x2: `${seat.x}%`, y2: `${seat.y}%` }, opacity: 0 },
        {
          attr: { x2: `${BOARD_POSITION.x}%`, y2: `${BOARD_POSITION.y}%` },
          opacity: 0.6,
          duration: 0.25,
          ease: 'power2.out',
        },
        '<'
      )
      // Pulse
      .to([lineRef.current, glowRef.current], {
        opacity: 0.3,
        duration: 0.1,
        yoyo: true,
        repeat: 1,
      })
      // Fade out
      .to([lineRef.current, glowRef.current], {
        opacity: 0,
        duration: 0.3,
        ease: 'power2.in',
      })

    return () => {
      tl.kill()
    }
  }, [bid, seat, onComplete, reduced])

  if (reduced) return null

  return (
    <svg
      ref={svgRef}
      className="pointer-events-none absolute inset-0 z-30 h-full w-full"
      style={{ overflow: 'visible' }}
    >
      {/* Glow line (wide, blurred) */}
      <line
        ref={glowRef}
        x1={`${seat.x}%`}
        y1={`${seat.y}%`}
        x2={`${seat.x}%`}
        y2={`${seat.y}%`}
        stroke={bid.color}
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0"
        style={{ filter: `blur(4px)` }}
      />
      {/* Core line */}
      <line
        ref={lineRef}
        x1={`${seat.x}%`}
        y1={`${seat.y}%`}
        x2={`${seat.x}%`}
        y2={`${seat.y}%`}
        stroke={bid.color}
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0"
      />
    </svg>
  )
}
