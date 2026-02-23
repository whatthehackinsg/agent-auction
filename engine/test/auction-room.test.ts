/**
 * Tests for AuctionRoom Durable Object skeleton.
 *
 * Uses mock DurableObjectState/Env to test the class directly
 * (not via Miniflare DO binding) since vitest 4.x is incompatible
 * with @cloudflare/vitest-pool-workers.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { AuctionRoom } from '../src/auction-room'

const ZERO_HASH_HEX = '0x' + '00'.repeat(32)

// ─── Mock Helpers ─────────────────────────────────────────────────────

/** In-memory storage mock implementing the subset of DurableObjectStorage we use */
function createMockStorage() {
  const store = new Map<string, unknown>()
  return {
    get: async <T = unknown>(key: string): Promise<T | undefined> => {
      return store.get(key) as T | undefined
    },
    put: async (key: string, value: unknown): Promise<void> => {
      store.set(key, value)
    },
    delete: async (key: string): Promise<boolean> => {
      return store.delete(key)
    },
    list: async (): Promise<Map<string, unknown>> => {
      return new Map(store)
    },
    // Expose store for test assertions
    _store: store,
  }
}

/** Create a mock DurableObjectState */
function createMockState() {
  const storage = createMockStorage()
  const acceptedWebSockets: unknown[] = []

  const state = {
    storage,
    id: {
      toString: () => 'test-do-id',
      equals: (other: { toString: () => string }) => other.toString() === 'test-do-id',
      name: 'test-auction',
    },
    blockConcurrencyWhile: async <T>(callback: () => Promise<T>): Promise<T> => {
      return callback()
    },
    acceptWebSocket: (ws: unknown, _tags?: string[]) => {
      acceptedWebSockets.push(ws)
    },
    getWebSockets: (_tag?: string) => [] as unknown[],
    waitUntil: (_promise: Promise<unknown>) => {},
    // Expose for assertions
    _acceptedWebSockets: acceptedWebSockets,
    _storage: storage,
  }

  return state as unknown as DurableObjectState & {
    _acceptedWebSockets: unknown[]
    _storage: ReturnType<typeof createMockStorage>
  }
}

/** Create a mock Env */
function createMockEnv() {
  return {
    AUCTION_DB: {} as D1Database,
    AUCTION_ROOM: {} as DurableObjectNamespace,
    SEQUENCER_PRIVATE_KEY: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  }
}

/** Helper to build a Request to the DO */
function makeRequest(path: string, options?: RequestInit): Request {
  return new Request(`https://fake-host${path}`, options)
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('AuctionRoom DO', () => {
  let state: ReturnType<typeof createMockState>
  let env: ReturnType<typeof createMockEnv>
  let room: AuctionRoom

  beforeEach(async () => {
    state = createMockState()
    env = createMockEnv()
    room = new AuctionRoom(state, env)
    // Wait for blockConcurrencyWhile to complete (it's async in constructor)
    // Since our mock is synchronous-ish, the room is ready immediately,
    // but let's flush microtasks
    await new Promise((r) => setTimeout(r, 0))
  })

  // ─── State Initialization ─────────────────────────────────────────

  describe('state initialization', () => {
    it('seqCounter defaults to 0', () => {
      expect(room.getSeqCounter()).toBe(0)
    })

    it('chainHead defaults to zero hash', () => {
      expect(room.getChainHead()).toBe(ZERO_HASH_HEX)
    })

    it('loads persisted seqCounter from storage', async () => {
      const preloadedState = createMockState()
      await preloadedState.storage.put('seqCounter', 42)
      await preloadedState.storage.put('chainHead', '0xabcd' + '00'.repeat(30))

      const loadedRoom = new AuctionRoom(preloadedState, env)
      await new Promise((r) => setTimeout(r, 0))

      expect(loadedRoom.getSeqCounter()).toBe(42)
      expect(loadedRoom.getChainHead()).toBe('0xabcd' + '00'.repeat(30))
    })
  })

  // ─── POST /action ─────────────────────────────────────────────────

  describe('POST /action', () => {
    it('returns 400 for invalid action body', async () => {
      const res = await room.fetch(
        makeRequest('/action', { method: 'POST', body: '{}' }),
      )
      expect(res.status).toBe(400)
    })
    it('returns 405 for non-POST methods', async () => {
      const res = await room.fetch(makeRequest('/action', { method: 'GET' }))
      expect(res.status).toBe(405)
    })
  })

  // ─── GET /events ──────────────────────────────────────────────────

  describe('GET /events', () => {
    it('returns 200 with empty array', async () => {
      const res = await room.fetch(makeRequest('/events'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual([])
    })
  })

  // ─── GET /snapshot ────────────────────────────────────────────────

  describe('GET /snapshot', () => {
    it('returns 200 with valid RoomSnapshot shape', async () => {
      const res = await room.fetch(makeRequest('/snapshot'))
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>

      // Verify all RoomSnapshot fields exist
      expect(body).toHaveProperty('auctionId')
      expect(body).toHaveProperty('currentSeq', 0)
      expect(body).toHaveProperty('headHash', ZERO_HASH_HEX)
      expect(body).toHaveProperty('participantCount', 0)
      expect(body).toHaveProperty('highestBid', '0')
      expect(body).toHaveProperty('highestBidder', '0')
      expect(body).toHaveProperty('startedAt', 0)
      expect(body).toHaveProperty('deadline', 0)
    })

    it('reflects auctionId from query param', async () => {
      const auctionId = '0x' + 'aa'.repeat(32)
      await room.fetch(makeRequest(`/snapshot?auctionId=${auctionId}`))
      const res = await room.fetch(makeRequest('/snapshot'))
      const body = (await res.json()) as Record<string, unknown>
      expect(body.auctionId).toBe(auctionId)
    })
  })

  // ─── Unknown Routes ───────────────────────────────────────────────

  describe('unknown routes', () => {
    it('returns 404 for unknown paths', async () => {
      const res = await room.fetch(makeRequest('/nonexistent'))
      expect(res.status).toBe(404)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.error).toBe('not found')
    })
  })

  // ─── Auction ID Persistence ───────────────────────────────────────

  describe('auctionId persistence', () => {
    it('stores auctionId in DO storage on first request', async () => {
      const auctionId = '0x' + 'bb'.repeat(32)
      await room.fetch(makeRequest(`/snapshot?auctionId=${auctionId}`))

      const stored = await state._storage.get<string>('auctionId')
      expect(stored).toBe(auctionId)
    })

    it('does not overwrite existing auctionId', async () => {
      const first = '0x' + 'aa'.repeat(32)
      const second = '0x' + 'bb'.repeat(32)
      await room.fetch(makeRequest(`/snapshot?auctionId=${first}`))
      await room.fetch(makeRequest(`/snapshot?auctionId=${second}`))

      const res = await room.fetch(makeRequest('/snapshot'))
      const body = (await res.json()) as Record<string, unknown>
      expect(body.auctionId).toBe(first)
    })
  })

  // ─── Alarm Handler ────────────────────────────────────────────────

  describe('alarm', () => {
    it('exists and can be called without error', async () => {
      await expect(room.alarm()).resolves.toBeUndefined()
    })
  })

  // ─── WebSocket Handlers ───────────────────────────────────────────

  describe('websocket handlers', () => {
    it('webSocketMessage sends ack response', async () => {
      const sent: string[] = []
      const mockWs = { send: (msg: string) => sent.push(msg) } as unknown as WebSocket
      await room.webSocketMessage(mockWs, 'hello')
      expect(sent).toHaveLength(1)
      expect(JSON.parse(sent[0])).toEqual({ type: 'ack' })
    })

    it('webSocketError is a no-op stub', async () => {
      const mockWs = { close: () => {} } as unknown as WebSocket
      await expect(
        room.webSocketError(mockWs, new Error('test')),
      ).resolves.toBeUndefined()
    })
  })

  // ─── GET /stream (WebSocket upgrade) ──────────────────────────────

  describe('GET /stream', () => {
    it('returns 426 when Upgrade header is missing', async () => {
      const res = await room.fetch(makeRequest('/stream'))
      expect(res.status).toBe(426)
    })
  })
})
