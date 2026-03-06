/**
 * Environment configuration loading.
 *
 * All config comes from environment variables with sensible defaults.
 * The private key and agent ID are required for signing actions but
 * optional for read-only tools (discover, details, events).
 */

import path from 'node:path'
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
  /** Engine admin key — bypasses x402 gates on engine calls */
  engineAdminKey: string | null
  /** Optional alternate signer for bond funding flows */
  bondFundingPrivateKey: Hex | null
  /** Path to agent-N.json for server-side ZK proof generation */
  agentStateFile: string | null
  /** Default directory for per-agent state files */
  agentStateDir: string | null
  /** Base Sepolia RPC URL for on-chain registry root reads */
  baseSepoliaRpc: string | null
}

export interface ToolIdentityOverrides {
  agentId?: string | null
  agentPrivateKey?: Hex | null
  bondFundingPrivateKey?: Hex | null
  agentStateFile?: string | null
  agentStateDir?: string | null
  baseSepoliaRpc?: string | null
}

export function loadConfig(): ServerConfig {
  const engineUrl = process.env.ENGINE_URL ?? 'http://localhost:8787'
  const rawKey = process.env.AGENT_PRIVATE_KEY ?? null
  const agentId = process.env.AGENT_ID ?? null
  const port = parseInt(process.env.MCP_PORT ?? '3100', 10)
  const engineAdminKey = process.env.ENGINE_ADMIN_KEY ?? null
  const rawBondFundingKey = process.env.BOND_FUNDING_PRIVATE_KEY ?? null
  const agentStateFile = process.env.AGENT_STATE_FILE ?? null
  const configuredStateDir = process.env.AGENT_STATE_DIR ?? null
  const baseSepoliaRpc = process.env.BASE_SEPOLIA_RPC ?? null

  let agentPrivateKey: Hex | null = null
  let bondFundingPrivateKey: Hex | null = null
  if (rawKey) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(rawKey)) {
      throw new Error('AGENT_PRIVATE_KEY must be a 0x-prefixed 64-char hex string')
    }
    agentPrivateKey = rawKey as Hex
  }
  if (rawBondFundingKey) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(rawBondFundingKey)) {
      throw new Error('BOND_FUNDING_PRIVATE_KEY must be a 0x-prefixed 64-char hex string')
    }
    bondFundingPrivateKey = rawBondFundingKey as Hex
  }

  const agentStateDir =
    configuredStateDir ?? (agentStateFile ? path.dirname(agentStateFile) : null)

  return {
    engineUrl,
    agentPrivateKey,
    agentId,
    port,
    engineAdminKey,
    bondFundingPrivateKey,
    agentStateFile,
    agentStateDir,
    baseSepoliaRpc,
  }
}

function resolveIdentityConfig(
  config: ServerConfig,
  overrides: ToolIdentityOverrides = {},
): Required<ToolIdentityOverrides> {
  return {
    agentId: overrides.agentId ?? config.agentId,
    agentPrivateKey: overrides.agentPrivateKey ?? config.agentPrivateKey,
    bondFundingPrivateKey: overrides.bondFundingPrivateKey ?? config.bondFundingPrivateKey,
    agentStateFile: overrides.agentStateFile ?? config.agentStateFile,
    agentStateDir: overrides.agentStateDir ?? config.agentStateDir,
    baseSepoliaRpc: overrides.baseSepoliaRpc ?? config.baseSepoliaRpc,
  }
}

/**
 * Assert that the signer-required config fields are present.
 * Throws a descriptive error if AGENT_PRIVATE_KEY or AGENT_ID is missing.
 */
export function requireSignerConfig(config: ServerConfig): {
  agentPrivateKey: Hex
  agentId: string
}
export function requireSignerConfig(
  config: ServerConfig,
  overrides?: ToolIdentityOverrides,
): {
  agentPrivateKey: Hex
  agentId: string
} {
  const resolved = resolveIdentityConfig(config, overrides)

  if (!resolved.agentPrivateKey) {
    throw new Error('AGENT_PRIVATE_KEY is required for this action')
  }
  if (!resolved.agentId) {
    throw new Error('AGENT_ID is required for this action')
  }
  return {
    agentPrivateKey: resolved.agentPrivateKey,
    agentId: resolved.agentId,
  }
}

/**
 * Assert that on-chain registration prerequisites are present.
 *
 * Unlike requireSignerConfig(), this keeps AGENT_* env vars as defaults while
 * allowing future tools to target an explicit identity without mutating env.
 */
export function requireRegistrationConfig(
  config: ServerConfig,
  overrides: ToolIdentityOverrides = {},
): {
  agentPrivateKey: Hex
  agentId: string | null
  agentStateDir: string
  agentStateFile: string | null
  baseSepoliaRpc: string
} {
  const resolved = resolveIdentityConfig(config, overrides)

  if (!resolved.agentPrivateKey) {
    throw new Error('AGENT_PRIVATE_KEY is required for on-chain registration')
  }
  if (!resolved.baseSepoliaRpc) {
    throw new Error('BASE_SEPOLIA_RPC is required for on-chain registration')
  }

  const agentStateDir = path.resolve(
    resolved.agentStateDir ?? (resolved.agentStateFile ? path.dirname(resolved.agentStateFile) : '.'),
  )

  return {
    agentPrivateKey: resolved.agentPrivateKey,
    agentId: resolved.agentId,
    agentStateDir,
    agentStateFile: resolved.agentStateFile ? path.resolve(resolved.agentStateFile) : null,
    baseSepoliaRpc: resolved.baseSepoliaRpc,
  }
}
