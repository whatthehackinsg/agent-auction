/** Utility functions for the auction scene. */

const PALETTE = [
  { hue: 160, color: '#6EE7B7', dim: '#2a5e4a' },  // mint
  { hue: 40,  color: '#F5C46E', dim: '#5e4a2a' },   // gold
  { hue: 260, color: '#A78BFA', dim: '#3d2e6b' },   // violet
  { hue: 350, color: '#FDA4AF', dim: '#5e2a35' },    // rose
  { hue: 190, color: '#67E8F9', dim: '#2a4d5e' },    // cyan
  { hue: 30,  color: '#FDBA74', dim: '#5e3d2a' },    // orange
  { hue: 280, color: '#C084FC', dim: '#4a2a6b' },    // purple
  { hue: 80,  color: '#BEF264', dim: '#3d5e2a' },    // lime
] as const

const HEAD_SHAPES = ['square', 'round', 'hex', 'triangle'] as const

/**
 * Simple hash from agentId string to a deterministic number.
 * Uses djb2 algorithm.
 */
function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/** Get a deterministic color palette entry for an agent. */
export function agentPalette(agentId: string) {
  const h = hashString(agentId)
  return PALETTE[h % PALETTE.length]
}

/** Get a deterministic head shape for an agent. */
export function agentHeadShape(agentId: string): typeof HEAD_SHAPES[number] {
  const h = hashString(agentId)
  return HEAD_SHAPES[(h >> 4) % HEAD_SHAPES.length]
}

/** Seat positions (x%, y%) within the room scene for up to 8 agents. */
export const SEAT_POSITIONS: Array<{ x: number; y: number }> = [
  { x: 30, y: 62 },
  { x: 45, y: 58 },
  { x: 60, y: 62 },
  { x: 75, y: 58 },
  { x: 25, y: 74 },
  { x: 40, y: 70 },
  { x: 55, y: 74 },
  { x: 70, y: 70 },
]

/** The price board position in the scene. */
export const BOARD_POSITION = { x: 50, y: 18 }

/** The host/podium position. */
export const HOST_POSITION = { x: 12, y: 50 }

/** Check if prefers-reduced-motion is active. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
