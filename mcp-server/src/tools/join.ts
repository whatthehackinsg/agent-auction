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
import type { EngineClient } from '../lib/engine.js'
import { ActionSigner } from '../lib/signer.js'
import type { ServerConfig } from '../lib/config.js'
import { resolveBackendWriteTarget } from '../lib/agent-target.js'
import { verifyParticipationReadiness } from '../lib/identity-check.js'
import { parseEngineStructuredError } from '../lib/proof-errors.js'
import { getEvmWalletProvider } from '../lib/wallet-backend.js'
import {
  loadAgentState,
  computeLocalProofState,
  fetchOnchainProofState,
  generateMembershipProofForAgent,
} from '../lib/proof-generator.js'

interface EngineActionResponse {
  seq: number
  eventHash: string
  prevHash: string
  sequencerSig?: string
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
        text: JSON.stringify(
          { success: false, error: { code, detail, suggestion, ...extras } },
          null,
          2,
        ),
      },
    ],
  }
}

function readinessBoundaryNote() {
  return (
    'check_identity only confirms ERC-8004 ownership and privacy visibility. ' +
    'join_auction also requires the local proof state to match the on-chain privacy registration.'
  )
}

function parseToolErrorResponse(
  payload: unknown,
): { code: string; detail: string; suggestion: string } | null {
  if (
    !payload
    || typeof payload !== 'object'
    || !('content' in payload)
    || !Array.isArray((payload as { content?: unknown[] }).content)
  ) {
    return null
  }

  const first = (payload as { content: Array<{ text?: string }> }).content[0]
  if (!first || typeof first.text !== 'string') {
    return null
  }

  try {
    const parsed = JSON.parse(first.text) as {
      error?: { code?: string; detail?: string; suggestion?: string }
    }
    if (
      parsed.error
      && typeof parsed.error.code === 'string'
      && typeof parsed.error.detail === 'string'
      && typeof parsed.error.suggestion === 'string'
    ) {
      return {
        code: parsed.error.code,
        detail: parsed.error.detail,
        suggestion: parsed.error.suggestion,
      }
    }
  } catch {
    // Ignore malformed tool content.
  }

  return null
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
        'Requires a configured write backend and AGENT_ID. Supported path: AgentKit + CDP Server Wallet. ' +
        'Advanced bridge: MCP_WALLET_BACKEND=raw-key with AGENT_PRIVATE_KEY. The agent must have posted a bond before joining. ' +
        'Accepts an advanced ZK membership proof override (proofPayload) or auto-generates one from AGENT_STATE_FILE.',
      inputSchema: z.object({
        auctionId: z.string().describe('The 0x-prefixed bytes32 auction ID to join'),
        bondAmount: z
          .string()
          .describe('Bond amount in USDC base units (6 decimals). E.g. "50000000" for 50 USDC'),
        agentId: z
          .string()
          .optional()
          .describe('Optional explicit agent ID override. Defaults to AGENT_ID.'),
        agentStateFile: z
          .string()
          .optional()
          .describe('Optional explicit agent-N.json path override for proof generation.'),
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
    async ({ auctionId, bondAmount, agentId: inputAgentId, agentStateFile, proofPayload }) => {
      let target
      let signer: ActionSigner
      try {
        target = resolveBackendWriteTarget(config, {
          agentId: inputAgentId,
          agentStateFile,
        })
        const walletProvider = await getEvmWalletProvider(config)
        signer = new ActionSigner({
          address: walletProvider.wallet,
          signTypedData: (typedData) => walletProvider.signTypedData(typedData),
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return zkError(
          'MISSING_CONFIG',
          msg,
          'Complete the supported AgentKit + CDP Server Wallet setup, or explicitly opt into MCP_WALLET_BACKEND=raw-key for the advanced bridge.',
        )
      }

      const preflight = await verifyParticipationReadiness(engine, target.agentId, signer.address, {
        agentStateFile: target.agentStateFile,
        requireLocalState: !proofPayload,
      })
      if (!preflight.ok) {
        const preflightError = parseToolErrorResponse(preflight.error)
        if (
          !proofPayload
          && config.baseSepoliaRpc
          && preflightError?.code === 'PRIVACY_NOT_REGISTERED'
        ) {
          const onchainProofState = await fetchOnchainProofState(
            config.baseSepoliaRpc,
            BigInt(target.agentId),
          )
          if (onchainProofState.status === 'unreadable') {
            return zkError(
              'PRIVACY_STATE_UNREADABLE',
              onchainProofState.detail,
              'Update the configured AgentPrivacyRegistry deployment or address, then rerun register_identity for this agent before retrying join_auction.',
              {
                reason: 'privacy_state_unreadable',
                readinessBoundary: readinessBoundaryNote(),
              },
            )
          }
          if (onchainProofState.status === 'missing') {
            return zkError(
              'PRIVACY_STATE_MISSING',
              `On-chain privacy proof state is incomplete for agentId ${target.agentId}: missing ${onchainProofState.missing.join(', ')}.`,
              'Register the agent on the per-agent AgentPrivacyRegistry, then rerun register_identity/check_identity before joining.',
              {
                reason: 'privacy_state_missing',
                readinessBoundary: readinessBoundaryNote(),
              },
            )
          }
        }
        return preflight.error
      }

      let resolvedProof: { proof: unknown; publicSignals: string[] } | undefined

      if (proofPayload) {
        // Pre-built proof — pass through without local verification
        resolvedProof = proofPayload
      } else {
        // Server-side generation
        try {
          const agentState = loadAgentState(target.agentStateFile!)
          if (agentState.agentId !== BigInt(target.agentId)) {
            return zkError(
              'PROOF_STATE_MISMATCH',
              `AGENT_STATE_FILE ${target.agentStateFile} belongs to agentId ${agentState.agentId}, not target agentId ${target.agentId}.`,
              'Use the stateFilePath returned by register_identity for this exact agentId, then retry join_auction.',
              {
                reason: 'agent_state_file_mismatch',
                readinessBoundary: readinessBoundaryNote(),
              },
            )
          }

          let validatedRegistryRoot = agentState.capabilityMerkleRoot
          if (config.baseSepoliaRpc) {
            const localProofState = await computeLocalProofState(agentState)
            const onchainProofState = await fetchOnchainProofState(
              config.baseSepoliaRpc,
              BigInt(target.agentId),
            )

            if (onchainProofState.status === 'unreadable') {
              return zkError(
                'PRIVACY_STATE_UNREADABLE',
                onchainProofState.detail,
                'Update the configured AgentPrivacyRegistry deployment or address, then rerun register_identity for this agent before retrying join_auction.',
                {
                  reason: 'privacy_state_unreadable',
                  readinessBoundary: readinessBoundaryNote(),
                },
              )
            }

            if (onchainProofState.status === 'missing') {
              return zkError(
                'PRIVACY_STATE_MISSING',
                `On-chain privacy proof state is incomplete for agentId ${target.agentId}: missing ${onchainProofState.missing.join(', ')}.`,
                'Register the agent on the per-agent AgentPrivacyRegistry, then rerun register_identity/check_identity before joining.',
                {
                  reason: 'privacy_state_missing',
                  readinessBoundary: readinessBoundaryNote(),
                },
              )
            }

            if (localProofState.poseidonRoot !== onchainProofState.poseidonRoot) {
              return zkError(
                'PROOF_STATE_MISMATCH',
                `Local Poseidon root ${localProofState.poseidonRoot} does not match on-chain Poseidon root ${onchainProofState.poseidonRoot} for agentId ${target.agentId}.`,
                'Use the stateFilePath returned by register_identity for this agent. If this is already the correct file, rerun register_identity to refresh privacy state before joining.',
                {
                  reason: 'registry_root_mismatch',
                  readinessBoundary: readinessBoundaryNote(),
                },
              )
            }

            if (localProofState.capabilityCommitment !== onchainProofState.capabilityCommitment) {
              return zkError(
                'PROOF_STATE_MISMATCH',
                `Local capability commitment ${localProofState.capabilityCommitment} does not match on-chain capability commitment ${onchainProofState.capabilityCommitment} for agentId ${target.agentId}.`,
                'Use the matching agent state file for this identity or rerun register_identity so local witness state and on-chain privacy registration are aligned.',
                {
                  reason: 'capability_commitment_mismatch',
                  readinessBoundary: readinessBoundaryNote(),
                },
              )
            }

            validatedRegistryRoot = onchainProofState.poseidonRoot
          }

          // Use the agent's own Poseidon capability tree root (stored in local state file).
          // This is the per-agent root the circuit constrains against — NOT the global
          // keccak registry root returned by AgentPrivacyRegistry.getRoot().
          resolvedProof = await generateMembershipProofForAgent(
            agentState,
            BigInt(auctionId),
            validatedRegistryRoot,
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

      const nonceKey = `JOIN:${target.agentId}:${auctionId}`
      const nonce = nonceTracker.get(nonceKey) ?? 0

      const payload = await signer.signJoin({
        auctionId: auctionId as Hex,
        agentId: target.agentId,
        bondAmount: BigInt(bondAmount),
        nonce,
        proofPayload: resolvedProof,
      })

      let result: EngineActionResponse
      try {
        result = await engine.post<EngineActionResponse>(`/auctions/${auctionId}/action`, payload)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const structured = parseEngineStructuredError(msg)
        if (structured) {
          return zkError(
            structured.error,
            `${structured.detail} ${readinessBoundaryNote()}`.trim(),
            structured.suggestion,
            {
              ...(structured.reason ? { reason: structured.reason } : {}),
              ...(structured.diagnostics ? { diagnostics: structured.diagnostics } : {}),
            },
          )
        }
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
            'The ZK proof or signature is invalid. Regenerate the proof from the correct agent-N.json and retry. A green check_identity result does not guarantee JOIN proof-state alignment.',
          )
        }
        throw err // Re-throw non-ZK errors
      }

      // Increment nonce on success
      nonceTracker.set(nonceKey, nonce + 1)

      const response = {
        success: true,
        action: 'JOIN',
        walletBackend: target.backend.path,
        auctionId,
        agentId: target.agentId,
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
