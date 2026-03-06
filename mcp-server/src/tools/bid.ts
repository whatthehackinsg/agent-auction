/**
 * place_bid — Sign an EIP-712 Bid message and POST to engine.
 *
 * Requires AGENT_PRIVATE_KEY and AGENT_ID environment variables.
 * Signs the Bid typed data and submits to POST /auctions/:id/action
 * with type=BID.
 *
 * Accepts an advanced ZK bid range proof override (proofPayload) or
 * auto-generates one server-side from AGENT_STATE_FILE.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { EngineClient } from '../lib/engine.js'
import { ActionSigner } from '../lib/signer.js'
import type { ServerConfig } from '../lib/config.js'
import { resolveWriteTarget } from '../lib/agent-target.js'
import { loadAgentState, generateBidRangeProofForAgent } from '../lib/proof-generator.js'
import { parseEngineStructuredError } from '../lib/proof-errors.js'
import { generateSecret, BID_RANGE_SIGNALS } from '@agent-auction/crypto'
import { verifyParticipationReadiness } from '../lib/identity-check.js'

interface EngineActionResponse {
  seq: number
  eventHash: string
  prevHash: string
  sequencerSig?: string
}

interface AuctionDetailResponse {
  auction?: {
    reserve_price?: string
    max_bid?: string | null
  }
  reservePrice?: string
  maxBid?: string | null
}

function zkError(
  code: string,
  detail: string,
  suggestion: string,
  extras?: Record<string, unknown>,
) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ success: false, error: { code, detail, suggestion, ...extras } }, null, 2),
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
        'Accepts an advanced ZK bid range proof override (proofPayload) or auto-generates one from AGENT_STATE_FILE.',
      inputSchema: z.object({
        auctionId: z.string().describe('The 0x-prefixed bytes32 auction ID to bid in'),
        amount: z
          .string()
          .describe('Bid amount in USDC base units (6 decimals). E.g. "100000000" for 100 USDC'),
        agentId: z
          .string()
          .optional()
          .describe('Optional explicit agent ID override. Defaults to AGENT_ID.'),
        agentStateFile: z
          .string()
          .optional()
          .describe('Optional explicit agent-N.json path override for proof generation.'),
        sealed: z
          .boolean()
          .optional()
          .describe('If true, submit a sealed BID_COMMIT instead of a plaintext BID. Requires proofPayload or AGENT_STATE_FILE auto-generation.'),
        salt: z
          .string()
          .optional()
          .describe('Reveal salt for sealed bids (bigint as decimal string). Auto-generated if omitted.'),
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
          .describe('Advanced: pre-built proof override. Omit to auto-generate.'),
      }),
    },
    async ({
      auctionId,
      amount,
      agentId: inputAgentId,
      agentStateFile,
      sealed,
      salt: saltParam,
      proofPayload,
    }) => {
      const target = resolveWriteTarget(config, {
        agentId: inputAgentId,
        agentStateFile,
      })
      const account = privateKeyToAccount(target.agentPrivateKey)
      const preflight = await verifyParticipationReadiness(engine, target.agentId, account.address, {
        agentStateFile: target.agentStateFile,
        requireLocalState: !proofPayload,
      })
      if (!preflight.ok) {
        return preflight.error
      }
      const signer = new ActionSigner(target.agentPrivateKey)
      const bidNonceKey = `BID:${target.agentId}`
      const bidNonce = nonceTracker.get(bidNonceKey) ?? 0
      const commitNonceKey = `BID_COMMIT:${target.agentId}`
      const commitNonce = nonceTracker.get(commitNonceKey) ?? 0

      let resolvedProof: { proof: unknown; publicSignals: string[] } | undefined
      // revealSalt must be the SAME salt used inside the BidRange circuit.
      // It is determined here (before proof generation for server-side proofs) so that
      // Poseidon(bid, revealSalt) === the commitment stored by handleBidCommit, allowing REVEAL.
      let revealSalt: bigint | undefined
      let plainBidProofSalt: bigint | undefined

      if (proofPayload) {
        if (!saltParam) {
          return zkError(
            'SALT_REQUIRED',
            'When proofPayload is provided, salt is required to bind the proof commitment.',
            'Pass the exact salt used to generate the BidRange proof.',
          )
        }
        resolvedProof = proofPayload
        // For pre-built proofs, use exactly the caller-provided proof salt.
        const providedSalt = BigInt(saltParam)
        revealSalt = providedSalt
        plainBidProofSalt = providedSalt
      } else {
        try {
          loadAgentState(target.agentStateFile!)
          // Fetch auction params for range proof
          const detail = await engine.get<AuctionDetailResponse>(
            `/auctions/${auctionId}`,
          )
          const reservePrice = BigInt(detail.auction?.reserve_price ?? detail.reservePrice ?? '0')
          const maxBudget = BigInt(detail.auction?.max_bid ?? detail.maxBid ?? '0')

          if (sealed) {
            // For sealed-bid: generate the salt here and pass it into the proof so both
            // the BidRange circuit and the REVEAL phase share the same salt value.
            revealSalt = saltParam ? BigInt(saltParam) : generateSecret()
            resolvedProof = await generateBidRangeProofForAgent(
              BigInt(amount),
              reservePrice,
              maxBudget,
              revealSalt,
            )
          } else {
            plainBidProofSalt = BigInt(bidNonce)
            resolvedProof = await generateBidRangeProofForAgent(
              BigInt(amount),
              reservePrice,
              maxBudget,
              plainBidProofSalt,
            )
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return zkError(
            'INVALID_SECRET',
            `Failed to generate bid range proof: ${msg}`,
            'Check bid amount is within auction range (reservePrice <= bid <= maxBid)',
          )
        }
      }

      // ── Sealed-bid (BID_COMMIT) path ──────────────────────────────────────
      if (sealed) {
        if (!resolvedProof) {
          return zkError(
            'PROOF_REQUIRED',
            'Sealed-bid BID_COMMIT requires a BidRange proof',
            'Set AGENT_STATE_FILE or provide a pre-built proofPayload',
          )
        }

        // Extract bidCommitment from the proof's public signals — this is the
        // authoritative value the engine uses when verifying the EIP-712 signature.
        // The engine's handleBidCommit reconstructs the BidCommit typed data with this
        // value, so the signer MUST use the same commitment.
        const bidCommitment = BigInt(resolvedProof.publicSignals[BID_RANGE_SIGNALS.BID_COMMITMENT])

        // revealSalt must match the salt used inside the BidRange circuit.
        // For server-side generation it was set above. For pre-built proofs (proofPayload),
        // the caller MUST supply it via saltParam — without it REVEAL will always fail.
        if (!revealSalt) {
          return zkError(
            'SALT_REQUIRED',
            'Sealed BID_COMMIT proof is missing reveal salt.',
            'Pass salt when using proofPayload, or let AGENT_STATE_FILE auto-generate the proof.',
          )
        }
        const finalRevealSalt = revealSalt

        const payload = await signer.signBidCommit({
          auctionId: auctionId as Hex,
          agentId: target.agentId,
          bidCommitment,
          nonce: commitNonce,
        })

        let result: EngineActionResponse
        try {
          result = await engine.post<EngineActionResponse>(
            `/auctions/${auctionId}/action`,
            { ...payload, proof: resolvedProof },
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return zkError('BID_COMMIT_FAILED', msg, 'Check the proof and auction status')
        }

        nonceTracker.set(commitNonceKey, commitNonce + 1)

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                action: 'BID_COMMIT',
                auctionId,
                agentId: target.agentId,
                wallet: signer.address,
                bidCommitment: bidCommitment.toString(),
                revealSalt: finalRevealSalt.toString(),
                nonce: commitNonce,
                seq: result.seq,
                eventHash: result.eventHash,
                prevHash: result.prevHash,
                note: 'Save revealSalt — required to reveal your bid in the reveal window',
              }, null, 2),
            },
          ],
        }
      }

      // ── Standard BID path ─────────────────────────────────────────────────
      // Sign first — BID EIP-712 type has no nullifier, so proof doesn't affect signature
      const payload = await signer.signBid({
        auctionId: auctionId as Hex,
        agentId: target.agentId,
        amount: BigInt(amount),
        nonce: bidNonce,
      })

      // Attach proof AFTER signing — proof doesn't affect BID EIP-712 signature
      const payloadWithProof: Record<string, unknown> = { ...payload, proof: resolvedProof ?? null }
      if (resolvedProof) {
        payloadWithProof.revealSalt = (plainBidProofSalt ?? BigInt(bidNonce)).toString()
      }

      let result: EngineActionResponse
      try {
        result = await engine.post<EngineActionResponse>(
          `/auctions/${auctionId}/action`,
          payloadWithProof,
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const structured = parseEngineStructuredError(msg)
        if (structured) {
          return zkError(
            structured.error,
            structured.detail,
            structured.suggestion,
            {
              ...(structured.reason ? { reason: structured.reason } : {}),
              ...(structured.diagnostics ? { diagnostics: structured.diagnostics } : {}),
            },
          )
        }
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
      nonceTracker.set(bidNonceKey, bidNonce + 1)

      const response = {
        success: true,
        action: 'BID',
        auctionId,
        agentId: target.agentId,
        wallet: signer.address,
        amount,
        nonce: bidNonce,
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
