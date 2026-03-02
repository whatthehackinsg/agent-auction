/**
 * place_bid — Sign an EIP-712 Bid message and POST to engine.
 *
 * Requires AGENT_PRIVATE_KEY and AGENT_ID environment variables.
 * Signs the Bid typed data and submits to POST /auctions/:id/action
 * with type=BID.
 *
 * Optionally accepts a ZK bid range proof (proofPayload) or generates
 * one server-side (generateProof: true).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Hex } from 'viem'
import type { EngineClient } from '../lib/engine.js'
import { ActionSigner } from '../lib/signer.js'
import type { ServerConfig } from '../lib/config.js'
import { requireSignerConfig } from '../lib/config.js'
import { loadAgentState, generateBidRangeProofForAgent } from '../lib/proof-generator.js'

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

export function registerBidTool(
  server: McpServer,
  engine: EngineClient,
  config: ServerConfig,
  nonceTracker: Map<string, number>,
): void {
  server.registerTool(
    'place_bid',
    {
      title: 'Place Bid',
      description:
        'Place a bid in an auction by signing an EIP-712 Bid message and posting it to the engine. ' +
        'The bid amount must exceed the current highest bid. Requires AGENT_PRIVATE_KEY and AGENT_ID. ' +
        'Optionally accepts a ZK bid range proof (proofPayload) or generates one server-side (generateProof: true).',
      inputSchema: z.object({
        auctionId: z.string().describe('The 0x-prefixed bytes32 auction ID to bid in'),
        amount: z
          .string()
          .describe('Bid amount in USDC base units (6 decimals). E.g. "100000000" for 100 USDC'),
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
          .describe('Pre-built Groth16 bid range proof. If provided, passed directly to engine.'),
        generateProof: z
          .boolean()
          .optional()
          .describe(
            'If true, generate bid range proof server-side. Fetches reservePrice and maxBid from engine automatically.',
          ),
      }),
    },
    async ({ auctionId, amount, proofPayload, generateProof }) => {
      const { agentPrivateKey, agentId } = requireSignerConfig(config)
      const signer = new ActionSigner(agentPrivateKey)

      let resolvedProof: { proof: unknown; publicSignals: string[] } | undefined

      if (proofPayload) {
        resolvedProof = proofPayload
      } else if (generateProof) {
        if (!config.agentStateFile) {
          return zkError(
            'AGENT_NOT_REGISTERED',
            'AGENT_STATE_FILE env var is not set',
            'Set AGENT_STATE_FILE to the path of your agent-N.json file',
          )
        }
        try {
          // Fetch auction params for range proof
          const detail = await engine.get<{ reservePrice?: string; maxBid?: string }>(
            `/auctions/${auctionId}`,
          )
          const reservePrice = BigInt(detail.reservePrice ?? '0')
          const maxBudget = BigInt(detail.maxBid ?? '0')
          resolvedProof = await generateBidRangeProofForAgent(
            BigInt(amount),
            reservePrice,
            maxBudget,
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return zkError(
            'INVALID_SECRET',
            `Failed to generate bid range proof: ${msg}`,
            'Check bid amount is within auction range (reservePrice <= bid <= maxBid)',
          )
        }
      }

      const nonceKey = `BID:${agentId}`
      const nonce = nonceTracker.get(nonceKey) ?? 0

      // Sign first — BID EIP-712 type has no nullifier, so proof doesn't affect signature
      const payload = await signer.signBid({
        auctionId: auctionId as Hex,
        agentId,
        amount: BigInt(amount),
        nonce,
      })

      // Attach proof AFTER signing — proof doesn't affect BID EIP-712 signature
      const payloadWithProof = { ...payload, proof: resolvedProof ?? null }

      let result: EngineActionResponse
      try {
        result = await engine.post<EngineActionResponse>(
          `/auctions/${auctionId}/action`,
          payloadWithProof,
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('Invalid bid range proof')) {
          return zkError(
            'PROOF_INVALID',
            msg,
            'The bid range proof is invalid. Ensure bid is within [reservePrice, maxBid] range.',
          )
        }
        throw err
      }

      // Increment nonce on success
      nonceTracker.set(nonceKey, nonce + 1)

      const response = {
        success: true,
        action: 'BID',
        auctionId,
        agentId,
        wallet: signer.address,
        amount,
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
