import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { prepareOnboarding } from '@agent-auction/crypto'
import type { Hex } from 'viem'
import type { EngineClient } from '../lib/engine.js'
import type { ServerConfig } from '../lib/config.js'
import { defaultAgentStatePath, persistAgentState } from '../lib/agent-state.js'
import { assessCompatibleZkState, type ZkStateAssessment } from '../lib/identity-check.js'
import {
  createBackendAwareBaseSepoliaClients,
  registerAgentIdentity,
  registerPrivacyMembership,
  type BaseSepoliaClients,
  type IdentityRegistrationResult,
  type PrivacyRegistrationResult,
} from '../lib/onchain.js'
import { toolError, toolSuccess } from '../lib/tool-response.js'
import { resolveBackendWriteTarget } from '../lib/agent-target.js'
import { resolveWriteBackend } from '../lib/wallet-backend.js'

interface VerifyIdentityResponse {
  verified: boolean
  resolvedWallet: string | null
  privacyRegistered: boolean
  poseidonRoot: string | null
}

interface ReadinessSnapshot {
  walletConfigured: boolean
  erc8004Registered: boolean
  privacyRegistryRegistered: boolean
  readyToParticipate: boolean
  missingSteps: string[]
  poseidonRoot: string | null
}

interface RegistrationSuccessData extends Record<string, unknown> {
  agentId: string
  wallet: string
  walletBackend: string
  resolvedWallet: string
  agentURI: string | null
  erc8004TxHash: Hex | null
  privacyTxHash: Hex | null
  stateFilePath: string | null
  readiness: ReadinessSnapshot
  attach?: {
    attached: boolean
    mode: 'attach-existing'
  }
  warning?: {
    code: string
    detail: string
    recoveredFrom: string
    verifiedBy: string
    limitations: string[]
  }
}

interface RecoveryError {
  code: string
  detail: string
}

interface ReconciledRegistrationState {
  readiness: ReadinessSnapshot
  resolvedWallet: string
  localStateFileExists: boolean
  verifiedBy: '/verify-identity'
  verifyError?: string
}

interface RegistrationMetadataInput {
  wallet: string
  name?: string
  description?: string
  capabilityIds: bigint[]
  now?: Date
  extraMetadata?: Record<string, unknown>
}

interface RegisterIdentityDeps {
  createClients?: (config: ServerConfig) => Promise<BaseSepoliaClients> | BaseSepoliaClients
  assessZkState?: (input: {
    agentId: string
    stateFilePath: string | null
    baseSepoliaRpc: string | null
  }) => Promise<ZkStateAssessment> | ZkStateAssessment
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
}

export function buildRegistrationDataUri(input: RegistrationMetadataInput): string {
  const payload = {
    schema: 'agent-auction.identity/v1',
    name: input.name ?? 'Agent Auction Identity',
    description:
      input.description ??
      'Autonomous auction agent identity registered via the Agent Auction MCP server.',
    wallet: input.wallet,
    capabilities: input.capabilityIds.map((capabilityId) => capabilityId.toString()),
    createdAt: (input.now ?? new Date()).toISOString(),
    ...input.extraMetadata,
  }

  return `data:application/json;base64,${Buffer.from(JSON.stringify(payload)).toString('base64')}`
}

export function registerRegisterIdentityTool(
  server: McpServer,
  engine: EngineClient,
  config: ServerConfig,
  deps: RegisterIdentityDeps = {},
): void {
  server.registerTool(
    'register_identity',
    {
      title: 'Register Identity',
      description:
        'Mint a real ERC-8004 identity, register AgentPrivacyRegistry membership, save the agent state file, and confirm readiness in one call.',
      inputSchema: z.object({
        attachExisting: z
          .boolean()
          .optional()
          .describe('If true, attach an existing ERC-8004 identity plus compatible local ZK state instead of minting a new identity.'),
        agentId: z
          .string()
          .optional()
          .describe('Optional explicit agent ID for attachExisting mode. Defaults to AGENT_ID when omitted.'),
        name: z
          .string()
          .optional()
          .describe('Optional display name to embed in the ERC-8004 agentURI metadata.'),
        description: z
          .string()
          .optional()
          .describe('Optional free-form description to embed in the ERC-8004 agentURI metadata.'),
        capabilityIds: z
          .array(z.string())
          .optional()
          .describe('Optional capability IDs to include in privacy bootstrap. Defaults to ["1"].'),
        stateFilePath: z
          .string()
          .optional()
          .describe('Optional output path for the saved agent-N.json file.'),
        metadata: z
          .record(z.unknown())
          .optional()
          .describe('Optional extra JSON metadata to embed in the ERC-8004 data URI payload.'),
      }),
    },
    async ({ attachExisting, agentId, name, description, capabilityIds, stateFilePath, metadata }) => {
      let normalizedCapabilityIds: bigint[]
      try {
        normalizedCapabilityIds = normalizeCapabilityIds(capabilityIds)
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        return toolError(
          'INVALID_INPUT',
          detail,
          'Provide capabilityIds as decimal strings such as ["1"] or omit the field to use the default capability.',
        )
      }

      if (attachExisting) {
        return attachExistingIdentity(
          engine,
          config,
          deps,
          {
            agentId,
            stateFilePath,
          },
        )
      }

      let backendPath: string
      try {
        const backend = resolveWriteBackend(config)
        if (!backend.configured || !backend.wallet) {
          throw new Error(
            'A configured write backend is required for register_identity.',
          )
        }
        if (!config.baseSepoliaRpc) {
          throw new Error('BASE_SEPOLIA_RPC is required for on-chain registration')
        }
        backendPath = backend.path
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        return toolError(
          'MISSING_CONFIG',
          detail,
          'Complete the supported AgentKit + CDP Server Wallet setup, or explicitly opt into MCP_WALLET_BACKEND=raw-key with BASE_SEPOLIA_RPC.',
        )
      }

      let clients: BaseSepoliaClients
      try {
        clients = await getRegistrationClients(config, deps)
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        return toolError(
          'MISSING_CONFIG',
          detail,
          'Complete the supported AgentKit + CDP Server Wallet setup, or explicitly opt into MCP_WALLET_BACKEND=raw-key with BASE_SEPOLIA_RPC.',
        )
      }
      const clientWallet = getClientsWallet(clients)
      const clientBackendPath = getClientsBackendPath(clients, config)

      const now = deps.now?.() ?? new Date()
      const agentURI = buildRegistrationDataUri({
        wallet: clientWallet,
        name,
        description,
        capabilityIds: normalizedCapabilityIds,
        now,
        extraMetadata: metadata,
      })

      let identityRegistration: IdentityRegistrationResult
      try {
        identityRegistration = await registerAgentIdentity(clients, agentURI)
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        return toolError(
          'IDENTITY_REGISTRATION_FAILED',
          detail,
          'Check BASE_SEPOLIA_RPC connectivity, signer funds, and ERC-8004 registry availability, then try register_identity again.',
        )
      }

      const resolvedStateFilePath = path.resolve(
        stateFilePath ??
          defaultAgentStatePath(
            identityRegistration.agentId,
            config.agentStateDir
            ?? (config.agentStateFile ? path.dirname(path.resolve(config.agentStateFile)) : '.'),
          ),
      )

      let privateState: Awaited<ReturnType<typeof prepareOnboarding>>
      try {
        privateState = await prepareOnboarding(identityRegistration.agentId, normalizedCapabilityIds)
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        return reconcilePartialFailure(
          engine,
          {
            error: {
              code: 'BOOTSTRAP_PREPARATION_FAILED',
              detail,
            },
            identityRegistration,
            wallet: clientWallet,
            walletBackend: clientBackendPath,
            agentURI,
            stateFilePath: resolvedStateFilePath,
          },
        )
      }

      try {
        await persistAgentState(privateState, {
          outputPath: resolvedStateFilePath,
          metadata: {
            createdAt: now.toISOString(),
            wallet: clientWallet,
            erc8004TxHash: identityRegistration.txHash,
            agentURI,
          },
        })
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        return reconcilePartialFailure(
          engine,
          {
            error: {
              code: 'STATE_PERSIST_FAILED',
              detail,
            },
            identityRegistration,
            wallet: clientWallet,
            walletBackend: clientBackendPath,
            agentURI,
            stateFilePath: resolvedStateFilePath,
          },
        )
      }

      let privacyRegistration: PrivacyRegistrationResult
      try {
        privacyRegistration = await registerPrivacyMembershipWithRetry(
          clients,
          privateState,
          clientBackendPath,
          deps.sleep ?? sleep,
        )
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        return reconcilePartialFailure(
          engine,
          {
            error: {
              code: 'PRIVACY_BOOTSTRAP_FAILED',
              detail,
            },
            identityRegistration,
            wallet: clientWallet,
            walletBackend: clientBackendPath,
            agentURI,
            stateFilePath: resolvedStateFilePath,
          },
        )
      }

      let readinessCheck: VerifyIdentityResponse
      try {
        readinessCheck = await engine.post<VerifyIdentityResponse>('/verify-identity', {
          agentId: identityRegistration.agentId.toString(),
          wallet: clientWallet,
        })
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        return reconcilePartialFailure(
          engine,
          {
            error: {
              code: 'READINESS_CHECK_FAILED',
              detail,
            },
            identityRegistration,
            wallet: clientWallet,
            walletBackend: clientBackendPath,
            agentURI,
            privacyTxHash: privacyRegistration.txHash,
            stateFilePath: resolvedStateFilePath,
          },
        )
      }

      const reconciledState: ReconciledRegistrationState = {
        readiness: buildReadinessSnapshot(readinessCheck),
        resolvedWallet: readinessCheck.resolvedWallet ?? clients.account.address,
        localStateFileExists: fs.existsSync(resolvedStateFilePath),
        verifiedBy: '/verify-identity',
      }

      if (!reconciledState.readiness.readyToParticipate || !reconciledState.localStateFileExists) {
        return partialFailure(
          'ONBOARDING_INCOMPLETE',
          buildIncompleteOnboardingDetail(reconciledState),
          buildNextAction(identityRegistration.agentId.toString(), resolvedStateFilePath, reconciledState),
          buildPartialRecovery(identityRegistration, clientWallet, {
            walletBackend: backendPath,
            resolvedWallet: reconciledState.resolvedWallet,
            privacyTxHash: privacyRegistration.txHash,
            stateFilePath: resolvedStateFilePath,
            localStateFileExists: reconciledState.localStateFileExists,
            readiness: reconciledState.readiness,
          }),
        )
      }

      return toolSuccess(
        buildRegistrationSuccess({
          identityRegistration,
          wallet: clientWallet,
          walletBackend: backendPath,
          resolvedWallet: reconciledState.resolvedWallet,
          agentURI,
          privacyTxHash: privacyRegistration.txHash,
          stateFilePath: resolvedStateFilePath,
          readiness: reconciledState.readiness,
        }),
      )
    },
  )
}

function normalizeCapabilityIds(input?: string[]): bigint[] {
  const rawValues = input && input.length > 0 ? input : ['1']
  return rawValues.map((value) => {
    if (!/^\d+$/.test(value)) {
      throw new Error(`capabilityId must be a decimal string: ${value}`)
    }

    const parsed = BigInt(value)
    if (parsed <= 0n) {
      throw new Error(`capabilityId must be greater than zero: ${value}`)
    }

    return parsed
  })
}

async function registerPrivacyMembershipWithRetry(
  clients: BaseSepoliaClients,
  privateState: Awaited<ReturnType<typeof prepareOnboarding>>,
  backendPath: string,
  sleeper: (ms: number) => Promise<void>,
): Promise<PrivacyRegistrationResult> {
  const retryDelaysMs = [4_000, 8_000, 12_000]
  let lastError: unknown

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await registerPrivacyMembership(clients, privateState)
    } catch (error) {
      lastError = error
      if (!shouldRetryPrivacyBootstrap(backendPath, error) || attempt === retryDelaysMs.length) {
        throw error
      }
      await sleeper(retryDelaysMs[attempt]!)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function shouldRetryPrivacyBootstrap(backendPath: string, error: unknown): boolean {
  if (backendPath !== 'supported-agentkit-cdp') {
    return false
  }

  const detail = error instanceof Error ? error.message : String(error)
  return /unable to estimate gas|nonce too low/i.test(detail)
}

function buildReadinessSnapshot(data: VerifyIdentityResponse): ReadinessSnapshot {
  const missingSteps: string[] = []

  if (!data.verified) {
    missingSteps.push('ERC-8004 identity is not yet verified by the engine. Re-run check_identity.')
  }
  if (!data.privacyRegistered) {
    missingSteps.push(
      'AgentPrivacyRegistry membership is not yet visible to the engine. Re-run check_identity after RPC/indexer catch-up.',
    )
  }

  return {
    walletConfigured: true,
    erc8004Registered: data.verified,
    privacyRegistryRegistered: data.privacyRegistered,
    readyToParticipate: data.verified && data.privacyRegistered,
    missingSteps,
    poseidonRoot: data.poseidonRoot,
  }
}

function buildUnavailableReadinessSnapshot(detail: string): ReadinessSnapshot {
  return {
    walletConfigured: true,
    erc8004Registered: false,
    privacyRegistryRegistered: false,
    readyToParticipate: false,
    missingSteps: [
      `Could not confirm readiness via /verify-identity: ${detail}. Re-run check_identity after the engine recovers.`,
    ],
    poseidonRoot: null,
  }
}

function buildRegistrationSuccess(input: {
  identityRegistration: IdentityRegistrationResult
  wallet: string
  walletBackend: string
  resolvedWallet: string
  agentURI: string | null
  privacyTxHash?: Hex
  stateFilePath?: string
  readiness: ReadinessSnapshot
  attach?: RegistrationSuccessData['attach']
  warning?: RegistrationSuccessData['warning']
}): RegistrationSuccessData {
  return {
    agentId: input.identityRegistration.agentId.toString(),
    wallet: input.wallet,
    walletBackend: input.walletBackend,
    resolvedWallet: input.resolvedWallet,
    agentURI: input.agentURI,
    erc8004TxHash: input.identityRegistration.txHash,
    privacyTxHash: input.privacyTxHash ?? null,
    stateFilePath: input.stateFilePath ?? null,
    readiness: input.readiness,
    attach: input.attach,
    warning: input.warning,
  }
}

async function reconcilePartialFailure(
  engine: EngineClient,
  input: {
    error: RecoveryError
    identityRegistration: IdentityRegistrationResult
    wallet: string
    walletBackend: string
    agentURI: string | null
    privacyTxHash?: Hex
    stateFilePath?: string
  },
) {
  const reconciledState = await reconcileRegistrationState(
    engine,
    input.identityRegistration.agentId.toString(),
    input.wallet,
    input.stateFilePath,
  )

  if (reconciledState.readiness.readyToParticipate && reconciledState.localStateFileExists) {
    return toolSuccess(
      buildRegistrationSuccess({
        identityRegistration: input.identityRegistration,
        wallet: input.wallet,
        walletBackend: input.walletBackend,
        resolvedWallet: reconciledState.resolvedWallet,
        agentURI: input.agentURI,
        privacyTxHash: input.privacyTxHash,
        stateFilePath: input.stateFilePath,
        readiness: reconciledState.readiness,
        warning: buildRecoveryWarning(input.error.code),
      }),
    )
  }

  return partialFailure(
    input.error.code,
    input.error.detail,
    buildNextAction(input.identityRegistration.agentId.toString(), input.stateFilePath, reconciledState),
    buildPartialRecovery(input.identityRegistration, input.wallet, {
      walletBackend: input.walletBackend,
      resolvedWallet: reconciledState.resolvedWallet,
      privacyTxHash: input.privacyTxHash,
      stateFilePath: input.stateFilePath,
      localStateFileExists: reconciledState.localStateFileExists,
      readiness: reconciledState.readiness,
    }),
  )
}

async function reconcileRegistrationState(
  engine: EngineClient,
  agentId: string,
  wallet: string,
  stateFilePath?: string,
): Promise<ReconciledRegistrationState> {
  const localStateFileExists = Boolean(stateFilePath && fs.existsSync(stateFilePath))

  try {
    const readinessCheck = await engine.post<VerifyIdentityResponse>('/verify-identity', {
      agentId,
      wallet,
    })

    return {
      readiness: buildReadinessSnapshot(readinessCheck),
      resolvedWallet: readinessCheck.resolvedWallet ?? wallet,
      localStateFileExists,
      verifiedBy: '/verify-identity',
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)

    return {
      readiness: buildUnavailableReadinessSnapshot(detail),
      resolvedWallet: wallet,
      localStateFileExists,
      verifiedBy: '/verify-identity',
      verifyError: detail,
    }
  }
}

function buildRecoveryWarning(recoveredFrom: string): RegistrationSuccessData['warning'] {
  return {
    code: 'ONBOARDING_RECOVERED',
    detail:
      'register_identity recovered from an intermediate mismatch after /verify-identity confirmed the minted agent is ready to participate.',
    recoveredFrom,
    verifiedBy: '/verify-identity',
    limitations: [
      'This confirms ERC-8004 ownership, AgentPrivacyRegistry visibility, and local state-file presence. It does not prove join_auction has already succeeded.',
    ],
  }
}

function buildIncompleteOnboardingDetail(reconciledState: ReconciledRegistrationState): string {
  if (reconciledState.verifyError) {
    return `On-chain registration completed, but readiness could not be confirmed: ${reconciledState.verifyError}`
  }

  if (!reconciledState.readiness.readyToParticipate) {
    return 'On-chain registration completed, but the reconciled readiness check still does not show a usable participation state.'
  }

  if (!reconciledState.localStateFileExists) {
    return 'The minted agent is visible to the engine, but the local agent state file is not available yet.'
  }

  return 'On-chain registration completed, but the reconciled readiness check still does not show a usable participation state.'
}

function buildNextAction(
  agentId: string,
  stateFilePath: string | undefined,
  reconciledState: ReconciledRegistrationState,
): string {
  if (reconciledState.verifyError) {
    return `Run check_identity(agentId="${agentId}") after the engine recovers and only continue to deposit_bond -> join_auction once readiness.readyToParticipate is true.`
  }

  if (!reconciledState.readiness.readyToParticipate) {
    return `Run check_identity(agentId="${agentId}") and only continue to deposit_bond -> join_auction once readiness.readyToParticipate is true.`
  }

  if (!reconciledState.localStateFileExists) {
    const expectedPath = stateFilePath ? path.resolve(stateFilePath) : `(agent-${agentId}.json not written)`
    return `Re-run register_identity with a writable stateFilePath so the agent state file exists locally before deposit_bond -> join_auction. Expected path: ${expectedPath}`
  }

  return `Run check_identity(agentId="${agentId}") and only continue to deposit_bond -> join_auction once readiness.readyToParticipate is true.`
}

function buildPartialRecovery(
  identityRegistration: IdentityRegistrationResult,
  wallet: string,
  extras: Record<string, unknown> = {},
) {
  return {
    agentId: identityRegistration.agentId.toString(),
    wallet,
    erc8004TxHash: identityRegistration.txHash,
    ...extras,
  }
}

function partialFailure(
  code: string,
  detail: string,
  suggestion: string,
  partial: Record<string, unknown>,
) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            success: false,
            error: {
              code,
              detail,
              suggestion,
            },
            nextAction: suggestion,
            partial,
          },
          null,
          2,
        ),
      },
    ],
  }
}

async function getRegistrationClients(
  config: ServerConfig,
  deps: RegisterIdentityDeps,
): Promise<BaseSepoliaClients> {
  const createClients = deps.createClients ?? createBackendAwareBaseSepoliaClients
  return await createClients(config)
}

function getClientsWallet(clients: BaseSepoliaClients): string {
  return clients.wallet ?? clients.account.address
}

function getClientsBackendPath(clients: BaseSepoliaClients, config: ServerConfig): string {
  return clients.backend?.path ?? resolveWriteBackend(config).path
}

async function attachExistingIdentity(
  engine: EngineClient,
  config: ServerConfig,
  deps: RegisterIdentityDeps,
  input: {
    agentId?: string
    stateFilePath?: string
  },
) {
  let target: ReturnType<typeof resolveBackendWriteTarget>
  try {
    target = resolveBackendWriteTarget(config, {
      agentId: input.agentId ?? null,
      agentStateFile: input.stateFilePath ?? null,
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return toolError(
      'MISSING_CONFIG',
      detail,
      'Complete the supported AgentKit + CDP Server Wallet setup, or explicitly opt into MCP_WALLET_BACKEND=raw-key and provide agentId for attachExisting.',
    )
  }

  const assessZkState = deps.assessZkState ?? assessCompatibleZkState
  const zkState = await assessZkState({
    agentId: target.agentId,
    stateFilePath: target.agentStateFile,
    baseSepoliaRpc: config.baseSepoliaRpc,
  })

  if (zkState.status !== 'configured') {
    return toolError(
      'ATTACH_STATE_INVALID',
      zkState.detail
      ?? `Compatible local proof state is ${zkState.status} for agentId ${target.agentId}.`,
      `Only use attachExisting with a matching agent-N.json. Re-run register_identity({ attachExisting: true, agentId: "${target.agentId}", stateFilePath: "${zkState.stateFilePath}" }) once the state is aligned.`,
    )
  }

  let readinessCheck: VerifyIdentityResponse
  try {
    readinessCheck = await engine.post<VerifyIdentityResponse>('/verify-identity', {
      agentId: target.agentId,
      wallet: target.wallet,
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return toolError(
      'READINESS_CHECK_FAILED',
      detail,
      `Run check_identity(agentId="${target.agentId}") once the engine recovers, then continue only when readiness.readyToParticipate is true.`,
    )
  }

  const readiness = buildReadinessSnapshot(readinessCheck)
  const localStateFileExists = Boolean(target.agentStateFile && fs.existsSync(target.agentStateFile))
  const targetWallet = target.wallet!
  if (!readiness.readyToParticipate || !localStateFileExists) {
    return partialFailure(
      'ONBOARDING_INCOMPLETE',
      buildIncompleteOnboardingDetail({
        readiness,
        resolvedWallet: readinessCheck.resolvedWallet ?? targetWallet,
        localStateFileExists,
        verifiedBy: '/verify-identity',
      }),
      buildNextAction(target.agentId, target.agentStateFile ?? undefined, {
        readiness,
        resolvedWallet: readinessCheck.resolvedWallet ?? targetWallet,
        localStateFileExists,
        verifiedBy: '/verify-identity',
      }),
      {
        agentId: target.agentId,
        wallet: targetWallet,
        walletBackend: target.backend.path,
        erc8004TxHash: null,
        privacyTxHash: null,
        stateFilePath: target.agentStateFile,
      },
    )
  }

  return toolSuccess({
    agentId: target.agentId,
    wallet: targetWallet,
    walletBackend: target.backend.path,
    resolvedWallet: readinessCheck.resolvedWallet ?? targetWallet,
    agentURI: null,
    erc8004TxHash: null,
    privacyTxHash: null,
    stateFilePath: target.agentStateFile,
    readiness,
    attach: {
      attached: true,
      mode: 'attach-existing',
    },
  })
}
