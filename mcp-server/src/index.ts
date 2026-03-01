/**
 * Auction MCP Server — Streamable HTTP transport.
 *
 * Exposes auction platform capabilities as MCP tools so AI agents
 * can autonomously discover, join, bid in, and monitor auctions
 * via the Model Context Protocol.
 *
 * Environment variables:
 *   ENGINE_URL          - Auction engine base URL (default: http://localhost:8787)
 *   AGENT_PRIVATE_KEY   - 0x-prefixed 64-char hex private key (required for signing actions)
 *   AGENT_ID            - Agent's numeric ERC-8004 ID (required for signing actions)
 *   MCP_PORT            - Server port (default: 3100)
 */

import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'

import { loadConfig } from './lib/config.js'
import { EngineClient } from './lib/engine.js'
import { registerDiscoverTool } from './tools/discover.js'
import { registerDetailsTool } from './tools/details.js'
import { registerJoinTool } from './tools/join.js'
import { registerBidTool } from './tools/bid.js'
import { registerBondTools } from './tools/bond.js'
import { registerEventsTool } from './tools/events.js'
import { registerPrompts } from './prompts.js'

// ── Configuration ────────────────────────────────────────────────────

const config = loadConfig()
const engine = new EngineClient(config.engineUrl)

/** Per-action-type nonce tracker: "JOIN:<agentId>" | "BID:<agentId>" → next nonce */
const nonceTracker = new Map<string, number>()

// ── Session storage ──────────────────────────────────────────────────

const transports: Record<string, StreamableHTTPServerTransport> = {}

// ── Server factory ───────────────────────────────────────────────────

function createServer(): McpServer {
  const server = new McpServer({
    name: 'auction-mcp-server',
    version: '0.1.0',
  })

  registerDiscoverTool(server, engine)
  registerDetailsTool(server, engine)
  registerJoinTool(server, engine, config, nonceTracker)
  registerBidTool(server, engine, config, nonceTracker)
  registerBondTools(server, engine, config)
  registerEventsTool(server, engine)

  // Register prompts
  registerPrompts(server)

  return server
}

// ── Express app ──────────────────────────────────────────────────────

const app = createMcpExpressApp()

// Handle MCP POST requests (initialize + ongoing)
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined

  try {
    let transport: StreamableHTTPServerTransport

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId]
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid: string) => {
          transports[sid] = transport
        },
      })

      transport.onclose = () => {
        const sid = transport.sessionId
        if (sid && transports[sid]) {
          delete transports[sid]
        }
      }

      const server = createServer()
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
      return
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null,
      })
      return
    }

    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    console.error('Error handling MCP request:', error)
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      })
    }
  }
})

// Handle SSE streams for server-initiated messages
app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string
  if (!sessionId || !transports[sessionId]) {
    res.status(400).json({ error: 'Invalid or missing session' })
    return
  }
  await transports[sessionId].handleRequest(req, res)
})

// Handle session termination
app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string
  if (sessionId && transports[sessionId]) {
    await transports[sessionId].handleRequest(req, res)
  } else {
    res.status(400).json({ error: 'Invalid or missing session' })
  }
})

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    server: 'auction-mcp-server',
    engineUrl: config.engineUrl,
    agentConfigured: config.agentPrivateKey !== null,
    agentId: config.agentId,
  })
})

// ── Start ────────────────────────────────────────────────────────────

app.listen(config.port, () => {
  console.log(`Auction MCP server listening on http://127.0.0.1:${config.port}/mcp`)
  console.log(`Engine URL: ${config.engineUrl}`)
  console.log(`Agent configured: ${config.agentPrivateKey !== null}`)
  if (config.agentId) {
    console.log(`Agent ID: ${config.agentId}`)
  }
})
