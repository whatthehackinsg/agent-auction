import path from 'node:path'
import type { Address, Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { ServerConfig } from './config.js'
import { defaultAgentStatePath } from './agent-state.js'

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

export function resolveWriteTarget(
  config: ServerConfig,
  input: AgentTargetInput = {},
): ResolvedWriteTarget {
  const agentId = input.agentId ?? config.agentId
  if (!config.agentPrivateKey) {
    throw new Error('AGENT_PRIVATE_KEY is required for this action')
  }
  if (!agentId) {
    throw new Error('AGENT_ID is required for this action')
  }
  const agentPrivateKey = config.agentPrivateKey
  const wallet = privateKeyToAccount(agentPrivateKey).address

  return {
    agentId,
    agentPrivateKey,
    wallet,
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
