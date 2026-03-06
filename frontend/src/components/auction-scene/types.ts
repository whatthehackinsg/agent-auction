/** Shared types for the auction scene animation layer. */

export interface AuctionEvent {
  type: string
  seq: number
  eventHash: string
  actionType: string
  agentId: string
  amount: string
  timestamp: number
}

export interface AuctionSceneViewProps {
  auctionId: string
  events: AuctionEvent[]
  isConnected: boolean
  highestBidEvent: AuctionEvent | null
  participantCount: number
  deadline: number
  status: string
}

/** Internal scene state derived from events. */
export interface SceneAgent {
  agentId: string
  /** Position index (0-7) on the seating grid */
  seatIndex: number
  /** Derived accent color hue */
  hue: number
  /** CSS color string */
  color: string
  /** Secondary CSS color */
  colorDim: string
  /** Shape variant for robot head */
  headShape: 'square' | 'round' | 'hex' | 'triangle'
  /** Timestamp of last bid */
  lastBidAt: number
  /** Whether currently animating a bid */
  isBidding: boolean
  /** Total number of bids placed */
  bidCount: number
}

export interface SceneBidAnimation {
  id: string
  agentId: string
  amount: string
  seatIndex: number
  color: string
  timestamp: number
}

export interface SceneComboState {
  count: number
  lastBidTimestamp: number
}
