/**
 * check_identity — Verify agent's ERC-8004 and privacy registry status.
 *
 * POST /verify-identity -> returns verification result with readiness assessment.
 * Helps agents understand what onboarding steps are complete and what's missing.
 */

import path from 'node:path'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { privateKeyToAccount } from 'viem/accounts'
import type { EngineClient } from '../lib/engine.js'
import type { ServerConfig } from '../lib/config.js'
import { defaultAgentStatePath } from '../lib/agent-state.js'
import { assessCompatibleZkState } from '../lib/identity-check.js'
import { toolError, toolSuccess } from '../lib/tool-response.js'
import { describeWriteBackend } from '../lib/wallet-backend.js'

interface VerifyIdentityResponse {
  verified: boolean
  resolvedWallet: string
  privacyRegistered: boolean
  poseidonRoot: string | null
}

export function registerIdentityTool(server: McpServer, engine: EngineClient, config: ServerConfig): void {
  server.registerTool(
    'check_identity',
    {
      title: 'Check Identity',
      description:
        'Verify agent ERC-8004 registration and privacy registry status. ' +
        'Returns a readiness assessment where readyToParticipate is true only when both ERC-8004 identity ' +
        'verification and AgentPrivacyRegistry membership are confirmed. Individual diagnostic fields remain included.',
      inputSchema: z.object({
        agentId: z
          .string()
          .optional()
          .describe('Numeric agent ID. Defaults to AGENT_ID env var.'),
        wallet: z
          .string()
          .optional()
          .describe('Wallet address to check. Defaults to address derived from AGENT_PRIVATE_KEY.'),
      }),
    },
    async ({ agentId, wallet }) => {
      const resolvedAgentId = agentId ?? config.agentId
      if (!resolvedAgentId) {
        return toolError(
          'MISSING_CONFIG',
          'Agent ID is required but not provided',
          'Provide agentId parameter or set AGENT_ID env var',
        )
      }

      let resolvedWallet = wallet
      let walletBackend: string | null = null
      if (!resolvedWallet) {
        const backend = describeWriteBackend(config)
        if (backend.configured && backend.wallet) {
          resolvedWallet = backend.wallet
          walletBackend = backend.path
        } else if (config.agentPrivateKey) {
          resolvedWallet = privateKeyToAccount(config.agentPrivateKey).address
          walletBackend = 'advanced-raw-key'
        } else {
          return toolError(
            'MISSING_CONFIG',
            backend.error ?? 'Wallet address is required',
            'Provide wallet explicitly, configure the supported AgentKit + CDP Server Wallet path, or explicitly opt into MCP_WALLET_BACKEND=raw-key.',
          )
        }
      }

      let data: VerifyIdentityResponse
      try {
        data = await engine.post<VerifyIdentityResponse>('/verify-identity', {
          agentId: resolvedAgentId,
          wallet: resolvedWallet,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return toolError('ENGINE_ERROR', msg, 'Check engine connectivity and try again')
      }

      const missingSteps: string[] = []
      let readyToParticipate = data.verified && data.privacyRegistered

      if (!data.verified) {
        missingSteps.push(
          `Preferred MCP recovery: call register_identity, then rerun check_identity with the returned agentId instead of relying on agentId ${resolvedAgentId}.`,
        )
      } else if (!data.privacyRegistered) {
        missingSteps.push(
          `agentId ${resolvedAgentId} is missing privacy bootstrap. Current MCP recovery is to call register_identity and continue with the returned fully bootstrapped agentId before joining auctions.`,
        )
      }

      const stateFilePath = resolveStateFilePath(config, resolvedAgentId)
      const zkState =
        data.verified && data.privacyRegistered && stateFilePath
          ? await assessCompatibleZkState({
              agentId: resolvedAgentId,
              stateFilePath,
              baseSepoliaRpc: config.baseSepoliaRpc,
            })
          : null

      if (zkState && zkState.status !== 'configured' && zkState.status !== 'untracked') {
        readyToParticipate = false
        missingSteps.push(
          `Compatible local ZK state is ${zkState.status} for agentId ${resolvedAgentId}. ` +
            `Use register_identity({ attachExisting: true, agentId: "${resolvedAgentId}", stateFilePath: "${zkState.stateFilePath}" }) ` +
            'once the matching agent-N.json is available and aligned with the on-chain privacy registration.',
        )
      }

      const response: Record<string, unknown> = {
        agentId: resolvedAgentId,
        wallet: resolvedWallet,
        erc8004Verified: data.verified,
        privacyRegistered: data.privacyRegistered,
        poseidonRoot: data.poseidonRoot,
        readiness: {
          walletConfigured: true,
          erc8004Registered: data.verified,
          privacyRegistryRegistered: data.privacyRegistered,
          readyToParticipate,
          missingSteps,
          ...(zkState && zkState.status !== 'untracked'
            ? {
                zkState: {
                  status: zkState.status,
                  attachRequired: zkState.attachRequired,
                  stateFilePath: zkState.stateFilePath,
                  detail: zkState.detail,
                },
              }
            : {}),
        },
        ...(walletBackend ? { walletBackend } : {}),
      }

      if (zkState && zkState.status !== 'untracked') {
        response.attach = {
          supported: true,
          required: zkState.attachRequired,
          mode: 'attach-existing',
        }
      }

      return toolSuccess(response)
    },
  )
}

function resolveStateFilePath(config: ServerConfig, agentId: string): string | null {
  if (config.agentStateFile && config.agentId === agentId) {
    return path.resolve(config.agentStateFile)
  }

  const stateDir =
    config.agentStateDir
    ?? (config.agentStateFile ? path.dirname(path.resolve(config.agentStateFile)) : null)

  if (!stateDir) {
    return null
  }

  return defaultAgentStatePath(agentId, stateDir)
}
