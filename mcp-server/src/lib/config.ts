/**
 * Environment configuration loading.
 *
 * All config comes from environment variables with sensible defaults.
 * The private key and agent ID are required for signing actions but
 * optional for read-only tools (discover, details, events).
 */

import type { Address, Hex } from 'viem'

export interface ServerConfig {
  /** Engine base URL (e.g. http://localhost:8787) */
  engineUrl: string
  /** Agent's 0x-prefixed private key for EIP-712 signing */
  agentPrivateKey: Hex | null
  /** Agent's numeric ERC-8004 ID */
  agentId: string | null
  /** MCP server port */
  port: number
}

export function loadConfig(): ServerConfig {
  const engineUrl = process.env.ENGINE_URL ?? 'http://localhost:8787'
  const rawKey = process.env.AGENT_PRIVATE_KEY ?? null
  const agentId = process.env.AGENT_ID ?? null
  const port = parseInt(process.env.MCP_PORT ?? '3100', 10)

  let agentPrivateKey: Hex | null = null
  if (rawKey) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(rawKey)) {
      throw new Error('AGENT_PRIVATE_KEY must be a 0x-prefixed 64-char hex string')
    }
    agentPrivateKey = rawKey as Hex
  }

  return { engineUrl, agentPrivateKey, agentId, port }
}

/**
 * Assert that the signer-required config fields are present.
 * Throws a descriptive error if AGENT_PRIVATE_KEY or AGENT_ID is missing.
 */
export function requireSignerConfig(config: ServerConfig): {
  agentPrivateKey: Hex
  agentId: string
} {
  if (!config.agentPrivateKey) {
    throw new Error('AGENT_PRIVATE_KEY is required for this action')
  }
  if (!config.agentId) {
    throw new Error('AGENT_ID is required for this action')
  }
  return {
    agentPrivateKey: config.agentPrivateKey,
    agentId: config.agentId,
  }
}
