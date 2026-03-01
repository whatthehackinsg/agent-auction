/**
 * Tests for WebSocket broadcast in AuctionRoom Durable Object.
 *
 * Verifies that after ingestAction, all connected WebSocket clients
 * receive a broadcast message with the event data.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AuctionRoom } from '../src/auction-room'
import { ActionType, type ValidatedAction } from '../src/types/engine'

// ─── Mock Helpers ─────────────────────────────────────────────────────

/** In-memory storage mock */
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
    _store: store,
  }
}

/** Create a mock WebSocket with send/close tracking */
function createMockWebSocket() {
  const sent: string[] = []
  return {
    ws: {
      send: (msg: string) => sent.push(msg),
      close: vi.fn(),
    } as unknown as WebSocket,
    sent,
  }
}

/** Create a mock WebSocket that throws on send (simulates closed socket) */
function createBrokenWebSocket() {
  return {
    send: () => { throw new Error('WebSocket is closed') },
    close: vi.fn(),
  } as unknown as WebSocket
}

/** Create a mock DurableObjectState with configurable WebSockets and tag support */
function createMockState(webSockets: WebSocket[] = [], defaultTag?: string) {
  const storage = createMockStorage()
  const acceptedWebSockets: unknown[] = []
  const socketTagMap = new Map<WebSocket, string[]>()

  // Pre-register sockets with the given default tag
  for (const ws of webSockets) {
    socketTagMap.set(ws, defaultTag ? [defaultTag] : [])
  }

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
    acceptWebSocket: (ws: unknown, tags?: string[]) => {
      acceptedWebSockets.push(ws)
      socketTagMap.set(ws as WebSocket, tags ?? [])
    },
    getWebSockets: (tag?: string) => {
      if (!tag) return webSockets
      return webSockets.filter(ws => {
        const tags = socketTagMap.get(ws) ?? []
        return tags.includes(tag)
      })
    },
    waitUntil: () => {},
    _acceptedWebSockets: acceptedWebSockets,
    _storage: storage,
  }

  return state as unknown as DurableObjectState & {
    _acceptedWebSockets: unknown[]
    _storage: ReturnType<typeof createMockStorage>
  }
}

/** Track D1 inserts */
function createMockEnv() {
  const inserts: { sql: string; bindings: unknown[] }[] = []
  return {
    AUCTION_DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          run: async () => {
            inserts.push({ sql, bindings: args })
            return { success: true }
          },
          all: async () => ({ results: [] }),
        }),
      }),
    } as unknown as D1Database,
    AUCTION_ROOM: {} as DurableObjectNamespace,
    SEQUENCER_PRIVATE_KEY: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    _inserts: inserts,
  }
}

/** Create a valid test action */
function makeAction(overrides?: Partial<ValidatedAction>): ValidatedAction {
  return {
    type: ActionType.BID,
    agentId: '12345',
    wallet: '0x1234567890abcdef1234567890abcdef12345678',
    amount: '1000000',
    nonce: 1,
    signature: '0x00',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('WebSocket Broadcast', () => {
  // ─── 1. broadcastEvent sends to all connected WebSockets ──────────

  it('broadcasts event to all connected WebSocket clients after ingestAction', async () => {
    const ws1 = createMockWebSocket()
    const ws2 = createMockWebSocket()
    const ws3 = createMockWebSocket()

    const state = createMockState([ws1.ws, ws2.ws, ws3.ws], 'participant')
    const env = createMockEnv()
    await state._storage.put('auctionId', '0x' + 'aa'.repeat(32))

    const room = new AuctionRoom(state, env)
    await new Promise((r) => setTimeout(r, 0))

    await room.ingestAction(makeAction())

    // All 3 clients should receive exactly 1 message each
    expect(ws1.sent).toHaveLength(1)
    expect(ws2.sent).toHaveLength(1)
    expect(ws3.sent).toHaveLength(1)
  })

  // ─── 2. broadcastEvent handles closed sockets gracefully ──────────

  it('handles closed/errored sockets gracefully without throwing', async () => {
    const brokenWs = createBrokenWebSocket()
    const goodWs = createMockWebSocket()

    const state = createMockState([brokenWs, goodWs.ws], 'participant')
    const env = createMockEnv()
    await state._storage.put('auctionId', '0x' + 'aa'.repeat(32))

    const room = new AuctionRoom(state, env)
    await new Promise((r) => setTimeout(r, 0))

    // Should not throw despite broken socket
    await expect(room.ingestAction(makeAction())).resolves.toBeDefined()

    // Good socket still received the message
    expect(goodWs.sent).toHaveLength(1)
  })

  // ─── 3. Broadcast message has correct format ─────────────────────

  it('broadcast message has correct format with type, seq, eventHash, etc.', async () => {
    const ws = createMockWebSocket()

    const state = createMockState([ws.ws], 'participant')
    const env = createMockEnv()
    await state._storage.put('auctionId', '0x' + 'aa'.repeat(32))

    const room = new AuctionRoom(state, env)
    await new Promise((r) => setTimeout(r, 0))

    const result = await room.ingestAction(makeAction({
      type: ActionType.BID,
      agentId: '99999',
      amount: '5000000',
    }))

    expect(ws.sent).toHaveLength(1)
    const msg = JSON.parse(ws.sent[0])

    // Verify message shape
    expect(msg.type).toBe('event')
    expect(msg.seq).toBe(result.seq)
    expect(msg.eventHash).toBe(result.eventHash)
    expect(msg.actionType).toBe('BID')
    expect(msg.agentId).toBe('99999')
    expect(msg.amount).toBe('5000000')
    expect(typeof msg.timestamp).toBe('number')
    expect(msg.timestamp).toBeGreaterThan(0)
  })

  // ─── 4. webSocketMessage sends ack response ──────────────────────

  it('webSocketMessage sends ack response to client', async () => {
    const state = createMockState()
    const env = createMockEnv()

    const room = new AuctionRoom(state, env)
    await new Promise((r) => setTimeout(r, 0))

    const sent: string[] = []
    const mockWs = { send: (msg: string) => sent.push(msg) } as unknown as WebSocket

    await room.webSocketMessage(mockWs, 'any message')
    await room.webSocketMessage(mockWs, JSON.stringify({ action: 'ping' }))

    expect(sent).toHaveLength(2)
    expect(JSON.parse(sent[0])).toEqual({ type: 'ack' })
    expect(JSON.parse(sent[1])).toEqual({ type: 'ack' })
  })

  // ─── 5. Multiple clients all receive the same broadcast ──────────

  it('multiple clients all receive identical broadcast messages', async () => {
    const clients = Array.from({ length: 5 }, () => createMockWebSocket())

    const state = createMockState(clients.map(c => c.ws), 'participant')
    const env = createMockEnv()
    await state._storage.put('auctionId', '0x' + 'aa'.repeat(32))

    const room = new AuctionRoom(state, env)
    await new Promise((r) => setTimeout(r, 0))

    await room.ingestAction(makeAction())

    // All 5 clients received exactly 1 message
    for (const client of clients) {
      expect(client.sent).toHaveLength(1)
    }

    // All messages are identical
    const firstMsg = clients[0].sent[0]
    for (const client of clients) {
      expect(client.sent[0]).toBe(firstMsg)
    }
  })

  // ─── 6. No broadcast when no WebSocket clients connected ─────────

  it('ingestAction succeeds with no connected WebSocket clients', async () => {
    const state = createMockState([]) // no sockets
    const env = createMockEnv()
    await state._storage.put('auctionId', '0x' + 'aa'.repeat(32))

    const room = new AuctionRoom(state, env)
    await new Promise((r) => setTimeout(r, 0))

    const result = await room.ingestAction(makeAction())
    expect(result.seq).toBe(1)
    expect(result.eventHash).toMatch(/^0x[0-9a-f]{64}$/)
  })

  // ─── 7. Sequential actions broadcast sequential events ────────────

  it('sequential ingestAction calls broadcast sequential events', async () => {
    const ws = createMockWebSocket()

    const state = createMockState([ws.ws], 'participant')
    const env = createMockEnv()
    await state._storage.put('auctionId', '0x' + 'aa'.repeat(32))

    const room = new AuctionRoom(state, env)
    await new Promise((r) => setTimeout(r, 0))

    await room.ingestAction(makeAction({ nonce: 1, amount: '1000000' }))
    await room.ingestAction(makeAction({ nonce: 2, amount: '2000000' }))
    await room.ingestAction(makeAction({ nonce: 3, amount: '3000000' }))

    expect(ws.sent).toHaveLength(3)

    const msg1 = JSON.parse(ws.sent[0])
    const msg2 = JSON.parse(ws.sent[1])
    const msg3 = JSON.parse(ws.sent[2])

    expect(msg1.seq).toBe(1)
    expect(msg2.seq).toBe(2)
    expect(msg3.seq).toBe(3)

    expect(msg1.amount).toBe('1000000')
    expect(msg2.amount).toBe('2000000')
    expect(msg3.amount).toBe('3000000')
  })

  // ─── 8. webSocketMessage handles broken send gracefully ───────────

  it('webSocketMessage does not throw if ws.send fails', async () => {
    const state = createMockState()
    const env = createMockEnv()

    const room = new AuctionRoom(state, env)
    await new Promise((r) => setTimeout(r, 0))

    const brokenWs = createBrokenWebSocket()

    // Should not throw
    await expect(room.webSocketMessage(brokenWs, 'test')).resolves.toBeUndefined()
  })
})