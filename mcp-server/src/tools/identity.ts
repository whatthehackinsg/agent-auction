/**
 * check_identity — Verify agent's ERC-8004 and privacy registry status.
 *
 * POST /verify-identity -> returns verification result with readiness assessment.
 * Helps agents understand what onboarding steps are complete and what's missing.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { privateKeyToAccount } from 'viem/accounts'
import type { EngineClient } from '../lib/engine.js'
import type { ServerConfig } from '../lib/config.js'
import { toolError, toolSuccess } from '../lib/tool-response.js'

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
      // Resolve agentId
      const resolvedAgentId = agentId ?? config.agentId
      if (!resolvedAgentId) {
        return toolError(
          'MISSING_CONFIG',
          'Agent ID is required but not provided',
          'Provide agentId parameter or set AGENT_ID env var',
        )
      }

      // Resolve wallet
      let resolvedWallet = wallet
      if (!resolvedWallet) {
        if (!config.agentPrivateKey) {
          return toolError(
            'MISSING_CONFIG',
            'Wallet address is required',
            'Provide wallet parameter or set AGENT_PRIVATE_KEY env var',
          )
        }
        const account = privateKeyToAccount(config.agentPrivateKey)
        resolvedWallet = account.address
      }

      // Call engine verify-identity
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
      if (!data.verified) {
        missingSteps.push(
          `Preferred MCP recovery: call register_identity, then rerun check_identity with the returned agentId instead of relying on agentId ${resolvedAgentId}.`,
        )
      } else if (!data.privacyRegistered) {
        missingSteps.push(
          `agentId ${resolvedAgentId} is missing privacy bootstrap. Current MCP recovery is to call register_identity and continue with the returned fully bootstrapped agentId before joining auctions.`,
        )
      }

      return toolSuccess({
        agentId: resolvedAgentId,
        wallet: resolvedWallet,
        erc8004Verified: data.verified,
        privacyRegistered: data.privacyRegistered,
        poseidonRoot: data.poseidonRoot,
        readiness: {
          walletConfigured: true,
          erc8004Registered: data.verified,
          privacyRegistryRegistered: data.privacyRegistered,
          readyToParticipate: data.verified && data.privacyRegistered,
          missingSteps,
        },
      })
    },
  )
}
