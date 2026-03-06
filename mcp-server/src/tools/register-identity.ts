import fs from 'node:fs'
import path from 'node:path'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { prepareOnboarding } from '@agent-auction/crypto'
import type { Hex } from 'viem'
import type { EngineClient } from '../lib/engine.js'
import type { ServerConfig } from '../lib/config.js'
import { requireRegistrationConfig } from '../lib/config.js'
import { defaultAgentStatePath, persistAgentState } from '../lib/agent-state.js'
import {
  createBaseSepoliaClients,
  registerAgentIdentity,
  registerPrivacyMembership,
  type BaseSepoliaClients,
  type IdentityRegistrationResult,
  type PrivacyRegistrationResult,
} from '../lib/onchain.js'
import { toolError, toolSuccess } from '../lib/tool-response.js'

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
  resolvedWallet: string
  agentURI: string
  erc8004TxHash: Hex
  privacyTxHash: Hex | null
  stateFilePath: string | null
  readiness: ReadinessSnapshot
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
  createClients?: (rpcUrl: string, privateKey: Hex) => BaseSepoliaClients
  now?: () => Date
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
    async ({ name, description, capabilityIds, stateFilePath, metadata }) => {
      let registrationConfig: ReturnType<typeof requireRegistrationConfig>
      try {
        registrationConfig = requireRegistrationConfig(config)
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        return toolError(
          'MISSING_CONFIG',
          detail,
          'Set AGENT_PRIVATE_KEY and BASE_SEPOLIA_RPC before calling register_identity.',
        )
      }

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

      const createClients = deps.createClients ?? createBaseSepoliaClients
      const clients = createClients(
        registrationConfig.baseSepoliaRpc,
        registrationConfig.agentPrivateKey,
      )

      const now = deps.now?.() ?? new Date()
      const agentURI = buildRegistrationDataUri({
        wallet: clients.account.address,
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
          defaultAgentStatePath(identityRegistration.agentId, registrationConfig.agentStateDir),
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
            wallet: clients.account.address,
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
            wallet: clients.account.address,
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
            wallet: clients.account.address,
            agentURI,
            stateFilePath: resolvedStateFilePath,
          },
        )
      }

      let privacyRegistration: PrivacyRegistrationResult
      try {
        privacyRegistration = await registerPrivacyMembership(clients, privateState)
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
            wallet: clients.account.address,
            agentURI,
            stateFilePath: resolvedStateFilePath,
          },
        )
      }

      let readinessCheck: VerifyIdentityResponse
      try {
        readinessCheck = await engine.post<VerifyIdentityResponse>('/verify-identity', {
          agentId: identityRegistration.agentId.toString(),
          wallet: clients.account.address,
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
            wallet: clients.account.address,
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
          buildPartialRecovery(identityRegistration, clients.account.address, {
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
          wallet: clients.account.address,
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
  resolvedWallet: string
  agentURI: string
  privacyTxHash?: Hex
  stateFilePath?: string
  readiness: ReadinessSnapshot
  warning?: RegistrationSuccessData['warning']
}): RegistrationSuccessData {
  return {
    agentId: input.identityRegistration.agentId.toString(),
    wallet: input.wallet,
    resolvedWallet: input.resolvedWallet,
    agentURI: input.agentURI,
    erc8004TxHash: input.identityRegistration.txHash,
    privacyTxHash: input.privacyTxHash ?? null,
    stateFilePath: input.stateFilePath ?? null,
    readiness: input.readiness,
    warning: input.warning,
  }
}

async function reconcilePartialFailure(
  engine: EngineClient,
  input: {
    error: RecoveryError
    identityRegistration: IdentityRegistrationResult
    wallet: string
    agentURI: string
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
