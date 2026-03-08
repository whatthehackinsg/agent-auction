/**
 * Environment configuration loading.
 *
 * All config comes from environment variables with sensible defaults.
 * The private key and agent ID are required for signing actions but
 * optional for read-only tools (discover, details, events).
 */

import fs from 'node:fs'
import path from 'node:path'
import type { Address, Hex } from 'viem'

export type WalletBackendMode = 'auto' | 'agentkit' | 'raw-key'
export type EngineReadMode = 'x402-buyer' | 'admin-bypass'

export interface CdpWalletBackendConfig {
  apiKeyId: string | null
  apiKeySecret: string | null
  walletSecret: string | null
  walletAddress: Address | null
  networkId: string
}

export interface ServerConfig {
  /** Engine base URL (e.g. http://localhost:8787) */
  engineUrl: string
  /** Wallet backend selection mode */
  walletBackendMode: WalletBackendMode
  /** Agent's 0x-prefixed private key for EIP-712 signing */
  agentPrivateKey: Hex | null
  /** Supported AgentKit/CDP wallet backend config */
  cdp: CdpWalletBackendConfig
  /** Agent's numeric ERC-8004 ID */
  agentId: string | null
  /** MCP server port */
  port: number
  /** Engine admin key — bypasses x402 gates on engine calls */
  engineAdminKey: string | null
  /** Engine GET authentication mode for discovery/detail reads */
  engineReadMode: EngineReadMode
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

export function loadDefaultEnvFileForStartup(options?: {
  cwd?: string
  filename?: string
}): string | null {
  const cwd = options?.cwd ?? process.cwd()
  const filename = options?.filename ?? process.env.MCP_ENV_FILE ?? '.env.agentkit.local'
  const resolved = path.resolve(cwd, filename)

  if (!fs.existsSync(resolved)) {
    return null
  }

  const source = fs.readFileSync(resolved, 'utf8')
  for (const line of source.split(/\r?\n/)) {
    const parsed = parseEnvLine(line)
    if (!parsed) continue

    const [key, value] = parsed
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  return resolved
}

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) {
    return null
  }

  const normalized = trimmed.startsWith('export ') ? trimmed.slice(7).trimStart() : trimmed
  const separatorIndex = normalized.indexOf('=')
  if (separatorIndex <= 0) {
    return null
  }

  const key = normalized.slice(0, separatorIndex).trim()
  if (!key) {
    return null
  }

  let value = normalized.slice(separatorIndex + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  } else {
    const commentIndex = value.search(/\s+#/)
    if (commentIndex >= 0) {
      value = value.slice(0, commentIndex).trimEnd()
    }
  }

  return [key, value]
}

export function loadConfig(): ServerConfig {
  const engineUrl = process.env.ENGINE_URL ?? 'http://localhost:8787'
  const rawWalletBackendMode = process.env.MCP_WALLET_BACKEND ?? 'auto'
  const rawKey = process.env.AGENT_PRIVATE_KEY ?? null
  const rawCdpWalletAddress = process.env.CDP_WALLET_ADDRESS ?? null
  const agentId = process.env.AGENT_ID ?? null
  const port = parseInt(process.env.MCP_PORT ?? '3100', 10)
  const engineAdminKey = process.env.ENGINE_ADMIN_KEY ?? null
  const rawEngineReadMode = process.env.MCP_ENGINE_READ_MODE ?? 'x402-buyer'
  const rawBondFundingKey = process.env.BOND_FUNDING_PRIVATE_KEY ?? null
  const agentStateFile = process.env.AGENT_STATE_FILE ?? null
  const configuredStateDir = process.env.AGENT_STATE_DIR ?? null
  const baseSepoliaRpc = process.env.BASE_SEPOLIA_RPC ?? null
  const cdpApiKeyId = process.env.CDP_API_KEY_ID ?? null
  const cdpApiKeySecret = process.env.CDP_API_KEY_SECRET ?? null
  const cdpWalletSecret = process.env.CDP_WALLET_SECRET ?? null
  const cdpNetworkId = process.env.CDP_NETWORK_ID ?? 'base-sepolia'

  let agentPrivateKey: Hex | null = null
  let bondFundingPrivateKey: Hex | null = null
  let walletBackendMode: WalletBackendMode
  let engineReadMode: EngineReadMode
  let cdpWalletAddress: Address | null = null

  if (
    rawWalletBackendMode !== 'auto'
    && rawWalletBackendMode !== 'agentkit'
    && rawWalletBackendMode !== 'raw-key'
  ) {
    throw new Error('MCP_WALLET_BACKEND must be one of: auto, agentkit, raw-key')
  }
  walletBackendMode = rawWalletBackendMode

  if (rawEngineReadMode !== 'x402-buyer' && rawEngineReadMode !== 'admin-bypass') {
    throw new Error('MCP_ENGINE_READ_MODE must be one of: x402-buyer, admin-bypass')
  }
  engineReadMode = rawEngineReadMode

  if (engineReadMode === 'admin-bypass' && !engineAdminKey) {
    throw new Error('ENGINE_ADMIN_KEY is required when MCP_ENGINE_READ_MODE=admin-bypass')
  }

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
  if (rawCdpWalletAddress) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(rawCdpWalletAddress)) {
      throw new Error('CDP_WALLET_ADDRESS must be a 0x-prefixed 40-char hex address')
    }
    cdpWalletAddress = rawCdpWalletAddress as Address
  }
  if (cdpNetworkId !== 'base-sepolia') {
    throw new Error('CDP_NETWORK_ID must be base-sepolia for the supported participant path')
  }

  const agentStateDir =
    configuredStateDir ?? (agentStateFile ? path.dirname(agentStateFile) : null)

  return {
    engineUrl,
    walletBackendMode,
    agentPrivateKey,
    cdp: {
      apiKeyId: cdpApiKeyId,
      apiKeySecret: cdpApiKeySecret,
      walletSecret: cdpWalletSecret,
      walletAddress: cdpWalletAddress,
      networkId: cdpNetworkId,
    },
    agentId,
    port,
    engineAdminKey,
    engineReadMode,
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
