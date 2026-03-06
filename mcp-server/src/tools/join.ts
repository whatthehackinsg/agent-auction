/**
 * join_auction — Sign an EIP-712 Join message and POST to engine.
 *
 * Requires AGENT_PRIVATE_KEY and AGENT_ID environment variables.
 * Signs the Join typed data with the correct nullifier derivation,
 * then submits to POST /auctions/:id/action with type=JOIN.
 *
 * Accepts an advanced ZK membership proof override (proofPayload) or
 * auto-generates one server-side from AGENT_STATE_FILE.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { EngineClient } from '../lib/engine.js'
import { ActionSigner } from '../lib/signer.js'
import type { ServerConfig } from '../lib/config.js'
import { requireSignerConfig } from '../lib/config.js'
import { verifyParticipationReadiness } from '../lib/identity-check.js'
import {
  loadAgentState,
  generateMembershipProofForAgent,
} from '../lib/proof-generator.js'

interface EngineActionResponse {
  seq: number
  eventHash: string
  prevHash: string
  sequencerSig?: string
}

function zkError(code: string, detail: string, suggestion: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ success: false, error: { code, detail, suggestion } }, null, 2),
      },
    ],
  }
}

export function registerJoinTool(
  server: McpServer,
  engine: EngineClient,
  config: ServerConfig,
  nonceTracker: Map<string, number>,
): void {
  server.registerTool(
    'join_auction',
    {
      title: 'Join Auction',
      description:
        'Join an auction by signing an EIP-712 Join message and posting it to the engine. ' +
        'Requires AGENT_PRIVATE_KEY and AGENT_ID. The agent must have posted a bond before joining. ' +
        'Accepts an advanced ZK membership proof override (proofPayload) or auto-generates one from AGENT_STATE_FILE.',
      inputSchema: z.object({
        auctionId: z.string().describe('The 0x-prefixed bytes32 auction ID to join'),
        bondAmount: z
          .string()
          .describe('Bond amount in USDC base units (6 decimals). E.g. "50000000" for 50 USDC'),
        proofPayload: z
          .object({
            proof: z.object({
              pi_a: z.array(z.string()),
              pi_b: z.array(z.array(z.string())),
              pi_c: z.array(z.string()),
              protocol: z.string(),
              curve: z.string(),
            }),
            publicSignals: z.array(z.string()),
          })
          .optional()
          .describe(
            'Advanced: pre-built proof override. Omit to auto-generate.',
          ),
      }),
    },
    async ({ auctionId, bondAmount, proofPayload }) => {
      const { agentPrivateKey, agentId } = requireSignerConfig(config)
      const account = privateKeyToAccount(agentPrivateKey)
      const preflight = await verifyParticipationReadiness(engine, agentId, account.address, {
        agentStateFile: config.agentStateFile,
        requireLocalState: !proofPayload,
      })
      if (!preflight.ok) {
        return preflight.error
      }
      const signer = new ActionSigner(agentPrivateKey)

      let resolvedProof: { proof: unknown; publicSignals: string[] } | undefined

      if (proofPayload) {
        // Pre-built proof — pass through without local verification
        resolvedProof = proofPayload
      } else {
        // Server-side generation
        try {
          const agentState = loadAgentState(config.agentStateFile!)
          // Use the agent's own Poseidon capability tree root (stored in local state file).
          // This is the per-agent root the circuit constrains against — NOT the global
          // keccak registry root returned by AgentPrivacyRegistry.getRoot().
          resolvedProof = await generateMembershipProofForAgent(
            agentState,
            BigInt(auctionId),
            agentState.capabilityMerkleRoot,
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return zkError(
            'INVALID_SECRET',
            `Failed to generate membership proof: ${msg}`,
            'Check AGENT_STATE_FILE contents and ensure agent is registered on-chain',
          )
        }
      }

      const nonceKey = `JOIN:${agentId}`
      const nonce = nonceTracker.get(nonceKey) ?? 0

      const payload = await signer.signJoin({
        auctionId: auctionId as Hex,
        agentId,
        bondAmount: BigInt(bondAmount),
        nonce,
        proofPayload: resolvedProof,
      })

      let result: EngineActionResponse
      try {
        result = await engine.post<EngineActionResponse>(`/auctions/${auctionId}/action`, payload)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('Nullifier already')) {
          return zkError(
            'NULLIFIER_REUSED',
            msg,
            'This agent has already joined this auction. Each agent can only join once per auction.',
          )
        }
        if (
          msg.includes('Invalid membership proof') ||
          msg.includes('Invalid EIP-712 signature')
        ) {
          return zkError(
            'PROOF_INVALID',
            msg,
            'The ZK proof or signature is invalid. Regenerate the proof and try again.',
          )
        }
        throw err // Re-throw non-ZK errors
      }

      // Increment nonce on success
      nonceTracker.set(nonceKey, nonce + 1)

      const response = {
        success: true,
        action: 'JOIN',
        auctionId,
        agentId,
        wallet: signer.address,
        bondAmount,
        nonce,
        seq: result.seq,
        eventHash: result.eventHash,
        prevHash: result.prevHash,
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      }
    },
  )
}
