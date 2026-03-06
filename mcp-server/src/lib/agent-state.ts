import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import type { AgentPrivateState } from '@agent-auction/crypto'

export interface PersistedAgentStateMetadata {
  [key: string]: unknown
}

export interface PersistAgentStateOptions {
  metadata?: PersistedAgentStateMetadata
  outputDir?: string
  outputPath?: string
}

export interface PersistedAgentStateRecord {
  agentId: `${string}n`
  agentSecret: `${string}n`
  capabilities: Array<{ capabilityId: `${string}n` }>
  leafHashes: Array<`${string}n`>
  capabilityMerkleRoot: `${string}n`
  [key: string]: unknown
}

export function defaultAgentStatePath(agentId: bigint | string, outputDir: string = '.'): string {
  const normalizedAgentId = normalizeAgentId(agentId)
  return path.resolve(outputDir, `agent-${normalizedAgentId}.json`)
}

export function serializeAgentState(
  state: AgentPrivateState,
  metadata: PersistedAgentStateMetadata = {},
): string {
  return JSON.stringify(buildPersistedAgentStateRecord(state, metadata), null, 2)
}

export async function persistAgentState(
  state: AgentPrivateState,
  options: PersistAgentStateOptions = {},
): Promise<{ path: string; serialized: string }> {
  const resolvedPath =
    options.outputPath ??
    defaultAgentStatePath(
      state.agentId,
      options.outputDir,
    )
  const serialized = serializeAgentState(state, options.metadata)

  await mkdir(path.dirname(resolvedPath), { recursive: true })
  await writeFile(resolvedPath, `${serialized}\n`, 'utf8')

  return { path: resolvedPath, serialized }
}

export function buildPersistedAgentStateRecord(
  state: AgentPrivateState,
  metadata: PersistedAgentStateMetadata = {},
): PersistedAgentStateRecord {
  return {
    agentId: serializeBigInt(state.agentId),
    agentSecret: serializeBigInt(state.agentSecret),
    capabilities: state.capabilities.map((capability) => ({
      capabilityId: serializeBigInt(capability.capabilityId),
    })),
    leafHashes: state.leafHashes.map(serializeBigInt),
    capabilityMerkleRoot: serializeBigInt(state.capabilityMerkleRoot),
    ...metadata,
  }
}

function normalizeAgentId(agentId: bigint | string): string {
  if (typeof agentId === 'bigint') {
    return agentId.toString()
  }

  return agentId.endsWith('n') ? agentId.slice(0, -1) : agentId
}

function serializeBigInt(value: bigint): `${string}n` {
  return `${value.toString()}n`
}
