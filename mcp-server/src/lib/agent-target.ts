import path from 'node:path'
import type { Address, Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { ServerConfig } from './config.js'
import { defaultAgentStatePath } from './agent-state.js'
import { resolveWriteBackend, type ResolvedWriteBackend } from './wallet-backend.js'

export interface AgentTargetInput {
  agentId?: string | null
  agentStateFile?: string | null
}

export interface BondTargetInput extends AgentTargetInput {
  fundingPrivateKey?: Hex | null
}

export interface ResolvedWriteTarget {
  agentId: string
  agentPrivateKey: Hex
  wallet: Address
  agentStateFile: string | null
}

export interface ResolvedBondTarget extends ResolvedWriteTarget {
  fundingPrivateKey: Hex
  fundingWallet: Address
  usesFundingOverride: boolean
}

export interface ResolvedBackendTarget {
  agentId: string
  wallet: Address | null
  agentStateFile: string | null
  backend: ResolvedWriteBackend
}

export function resolveBackendWriteTarget(
  config: ServerConfig,
  input: AgentTargetInput = {},
): ResolvedBackendTarget {
  const agentId = input.agentId ?? config.agentId
  if (!agentId) {
    throw new Error('AGENT_ID is required for this action')
  }

  const backend = resolveWriteBackend(config)
  if (!backend.configured) {
    throw new Error(
      'No write backend is configured. Set the supported AgentKit/CDP env vars or explicitly opt into MCP_WALLET_BACKEND=raw-key.',
    )
  }

  return {
    agentId,
    wallet: backend.wallet,
    agentStateFile: resolveAgentStateFile(config, agentId, input.agentStateFile ?? null),
    backend,
  }
}

export function resolveWriteTarget(
  config: ServerConfig,
  input: AgentTargetInput = {},
): ResolvedWriteTarget {
  const backendTarget = resolveBackendWriteTarget(config, input)
  if (backendTarget.backend.kind !== 'raw-key' || !config.agentPrivateKey || !backendTarget.wallet) {
    throw new Error(
      `The active write backend is ${backendTarget.backend.path}. This raw-key-only code path is unavailable until the backend-aware signer/on-chain helpers are used.`,
    )
  }

  const agentId = input.agentId ?? config.agentId
  if (!agentId) {
    throw new Error('AGENT_ID is required for this action')
  }
  const agentPrivateKey = config.agentPrivateKey

  return {
    agentId,
    agentPrivateKey,
    wallet: backendTarget.wallet,
    agentStateFile: resolveAgentStateFile(config, agentId, input.agentStateFile ?? null),
  }
}

export function resolveBondTarget(
  config: ServerConfig,
  input: BondTargetInput = {},
): ResolvedBondTarget {
  const writeTarget = resolveWriteTarget(config, input)
  const fundingPrivateKey =
    input.fundingPrivateKey ?? config.bondFundingPrivateKey ?? writeTarget.agentPrivateKey
  const fundingWallet = privateKeyToAccount(fundingPrivateKey).address

  return {
    ...writeTarget,
    fundingPrivateKey,
    fundingWallet,
    usesFundingOverride: fundingPrivateKey !== writeTarget.agentPrivateKey,
  }
}

function resolveAgentStateFile(
  config: ServerConfig,
  agentId: string,
  explicitStateFile: string | null,
): string | null {
  if (explicitStateFile) {
    return path.resolve(explicitStateFile)
  }

  if (config.agentStateFile && config.agentId === agentId) {
    return path.resolve(config.agentStateFile)
  }

  const stateDir =
    config.agentStateDir ??
    (config.agentStateFile ? path.dirname(path.resolve(config.agentStateFile)) : null)

  if (!stateDir) {
    return null
  }

  return defaultAgentStatePath(agentId, stateDir)
}
