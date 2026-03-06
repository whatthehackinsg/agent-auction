/**
 * get_bond_status + post_bond — Bond management tools.
 *
 * get_bond_status: GET /auctions/:id/bonds/:agentId
 * post_bond: POST /auctions/:id/bonds with USDC transfer proof
 *
 * Note: post_bond only submits the bond proof to the engine.
 * The actual USDC transfer must happen on-chain first (via the agent's
 * wallet sending USDC to the AuctionEscrow contract).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Hex } from 'viem'
import type { EngineClient } from '../lib/engine.js'
import type { ServerConfig } from '../lib/config.js'
import { resolveBondTarget, resolveWriteTarget } from '../lib/agent-target.js'
import {
  createBaseSepoliaClients,
  readIdentityOwner,
  transferUsdcToEscrow,
  type BaseSepoliaClients,
} from '../lib/onchain.js'
import { ActionSigner } from '../lib/signer.js'
import { toolError, toolSuccess } from '../lib/tool-response.js'

interface BondStatusResponse {
  status: 'NONE' | 'PENDING' | 'CONFIRMED' | 'TIMEOUT'
}

interface BondRecordResponse {
  status: 'PENDING' | 'CONFIRMED'
  txHash: string
}

interface AuctionDetailResponse {
  auction?: {
    deposit_amount?: string
  }
  depositAmount?: string
}

interface BondToolsDeps {
  createClients?: (rpcUrl: string, privateKey: Hex) => BaseSepoliaClients
  smartWaitAttempts?: number
  pollDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

export function registerBondTools(
  server: McpServer,
  engine: EngineClient,
  config: ServerConfig,
  deps: BondToolsDeps = {},
): void {
  // ── get_bond_status ─────────────────────────────────────────────────

  server.registerTool(
    'get_bond_status',
    {
      title: 'Get Bond Status',
      description:
        'Check the bond observation status for an agent in an auction. ' +
        'Returns NONE, PENDING, CONFIRMED, or TIMEOUT.',
      inputSchema: z.object({
        auctionId: z.string().describe('The 0x-prefixed bytes32 auction ID'),
        agentId: z
          .string()
          .optional()
          .describe(
            'Agent ID to check. Defaults to the configured AGENT_ID if not provided.',
          ),
      }),
    },
    async ({ auctionId, agentId: inputAgentId }) => {
      const agentId = inputAgentId ?? config.agentId
      if (!agentId) {
        return toolError(
          'MISSING_CONFIG',
          'agentId is required',
          'Provide agentId parameter or set AGENT_ID env var',
        )
      }

      let status: BondStatusResponse
      try {
        status = await engine.get<BondStatusResponse>(
          `/auctions/${auctionId}/bonds/${agentId}`,
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return toolError('ENGINE_ERROR', msg, 'Check engine connectivity and try again')
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { auctionId, agentId, bondStatus: status.status },
              null,
              2,
            ),
          },
        ],
      }
    },
  )

  // ── post_bond ───────────────────────────────────────────────────────

  server.registerTool(
    'post_bond',
    {
      title: 'Post Bond Proof',
      description:
        'Submit a USDC bond transfer proof to the engine for verification. ' +
        'The USDC transfer must have already been executed on-chain (transfer to AuctionEscrow at ' +
        '0x20944f46AB83F7eA40923D7543AF742Da829743c). ' +
        'Provide the transaction hash as proof.',
      inputSchema: z.object({
        auctionId: z.string().describe('The 0x-prefixed bytes32 auction ID'),
        agentId: z
          .string()
          .optional()
          .describe('Optional explicit agent ID override. Defaults to AGENT_ID.'),
        amount: z
          .string()
          .describe('Bond amount in USDC base units (6 decimals). E.g. "50000000" for 50 USDC'),
        txHash: z
          .string()
          .describe('The 0x-prefixed transaction hash of the USDC transfer to escrow'),
      }),
    },
    async ({ auctionId, agentId: inputAgentId, amount, txHash }) => {
      let target: ReturnType<typeof resolveWriteTarget>
      try {
        target = resolveWriteTarget(config, {
          agentId: inputAgentId,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return toolError('MISSING_CONFIG', msg, 'Set AGENT_PRIVATE_KEY and AGENT_ID env vars')
      }
      const signer = new ActionSigner(target.agentPrivateKey)
      const depositor = signer.address

      let result: BondRecordResponse
      try {
        result = await engine.post<BondRecordResponse>(
          `/auctions/${auctionId}/bonds`,
          {
            agentId: target.agentId,
            depositor,
            amount,
            txHash,
          },
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.toLowerCase().includes('bond')) {
          return toolError(
            'BOND_NOT_CONFIRMED',
            msg,
            'Verify the USDC transfer tx hash and amount are correct',
          )
        }
        return toolError('ENGINE_ERROR', msg, 'Check engine connectivity and try again')
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                auctionId,
                agentId: target.agentId,
                depositor,
                amount,
                bondStatus: result.status,
                txHash: result.txHash,
              },
              null,
              2,
            ),
          },
        ],
      }
    },
  )

  // ── deposit_bond ───────────────────────────────────────────────────

  server.registerTool(
    'deposit_bond',
    {
      title: 'Deposit Bond',
      description:
        'Default autonomous bond flow. Resolves the required auction deposit, transfers USDC to AuctionEscrow on Base Sepolia, and records the tx with the engine. ' +
        'Returns existing PENDING/CONFIRMED bond state idempotently.',
      inputSchema: z.object({
        auctionId: z.string().describe('The 0x-prefixed bytes32 auction ID'),
        agentId: z
          .string()
          .optional()
          .describe('Optional explicit agent ID override. Defaults to AGENT_ID.'),
        amount: z
          .string()
          .optional()
          .describe('Optional bond amount override in USDC base units. Defaults to the auction depositAmount.'),
        fundingPrivateKey: z
          .string()
          .optional()
          .describe('Advanced: optional alternate funding signer. Must be the ERC-8004 owner wallet for the target agent.'),
      }),
    },
    async ({ auctionId, agentId: inputAgentId, amount, fundingPrivateKey }) => {
      let target: ReturnType<typeof resolveBondTarget>
      try {
        target = resolveBondTarget(config, {
          agentId: inputAgentId,
          fundingPrivateKey: normalizeOptionalPrivateKey(fundingPrivateKey),
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return toolError(
          'MISSING_CONFIG',
          msg,
          'Set AGENT_PRIVATE_KEY and AGENT_ID env vars, or pass agentId with a configured signer.',
        )
      }

      let currentStatus: BondStatusResponse
      try {
        currentStatus = await engine.get<BondStatusResponse>(
          `/auctions/${auctionId}/bonds/${target.agentId}`,
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return toolError('ENGINE_ERROR', msg, 'Check engine connectivity and try again')
      }

      if (currentStatus.status === 'PENDING' || currentStatus.status === 'CONFIRMED') {
        return toolSuccess({
          auctionId,
          agentId: target.agentId,
          bondStatus: currentStatus.status,
          amount: amount ?? null,
          depositor: target.fundingWallet,
          idempotent: true,
          nextAction: currentStatus.status === 'CONFIRMED' ? 'join_auction' : 'get_bond_status',
        })
      }

      let resolvedAmount = amount
      if (!resolvedAmount) {
        let auctionDetails: AuctionDetailResponse
        try {
          auctionDetails = await engine.get<AuctionDetailResponse>(`/auctions/${auctionId}`)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return toolError(
            'ENGINE_ERROR',
            msg,
            'Could not load auction deposit requirements. Check engine connectivity and try again.',
          )
        }

        resolvedAmount = extractDepositAmount(auctionDetails)
      }

      if (!config.baseSepoliaRpc) {
        return toolError(
          'MISSING_CONFIG',
          'BASE_SEPOLIA_RPC is required for deposit_bond',
          'Set BASE_SEPOLIA_RPC to a Base Sepolia RPC endpoint before using deposit_bond.',
        )
      }

      const createClients = deps.createClients ?? createBaseSepoliaClients
      const fundingClients = createClients(config.baseSepoliaRpc, target.fundingPrivateKey)

      let identityOwner: string
      try {
        identityOwner = await readIdentityOwner(fundingClients.publicClient, BigInt(target.agentId))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return toolError(
          'IDENTITY_LOOKUP_FAILED',
          msg,
          'Could not verify the ERC-8004 owner for this agent. Check BASE_SEPOLIA_RPC and try again.',
        )
      }

      if (identityOwner.toLowerCase() !== target.fundingWallet.toLowerCase()) {
        return toolError(
          'FUNDING_WALLET_MISMATCH',
          `Funding wallet ${target.fundingWallet} does not own agentId ${target.agentId} (owner is ${identityOwner})`,
          'Use the ERC-8004 owner wallet for this agent, or remove the funding override and retry deposit_bond.',
        )
      }

      let transfer: { txHash: Hex }
      try {
        transfer = await transferUsdcToEscrow(fundingClients, BigInt(resolvedAmount))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return toolError(
          'TRANSFER_FAILED',
          msg,
          'Ensure the funding wallet has enough Base Sepolia USDC and gas, then retry deposit_bond.',
        )
      }

      let engineResult: BondRecordResponse
      try {
        engineResult = await engine.post<BondRecordResponse>(`/auctions/${auctionId}/bonds`, {
          agentId: target.agentId,
          depositor: target.fundingWallet,
          amount: resolvedAmount,
          txHash: transfer.txHash,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.toLowerCase().includes('identity mismatch')) {
          return toolError(
            'FUNDING_WALLET_MISMATCH',
            msg,
            'Use the ERC-8004 owner wallet for this agent, or remove the funding override and retry deposit_bond.',
          )
        }
        if (msg.toLowerCase().includes('bond')) {
          return toolError(
            'BOND_NOT_CONFIRMED',
            msg,
            'The transfer was sent but the engine could not confirm it yet. Re-check with get_bond_status or use post_bond once the tx is visible.',
          )
        }
        return toolError('ENGINE_ERROR', msg, 'Check engine connectivity and try again')
      }

      const finalStatus = await smartWaitForBondStatus(
        engine,
        auctionId,
        target.agentId,
        engineResult.status,
        deps,
      )

      if (finalStatus === 'CONFIRMED') {
        return toolSuccess({
          auctionId,
          agentId: target.agentId,
          amount: resolvedAmount,
          depositor: target.fundingWallet,
          txHash: engineResult.txHash,
          bondStatus: 'CONFIRMED',
          idempotent: false,
          nextAction: 'join_auction',
          nextStep: 'Bond confirmed. Call join_auction next.',
        })
      }

      return toolSuccess({
        auctionId,
        agentId: target.agentId,
        amount: resolvedAmount,
        depositor: target.fundingWallet,
        txHash: engineResult.txHash,
        bondStatus: 'PENDING',
        idempotent: false,
        nextAction: 'get_bond_status',
        nextStep:
          'Bond transfer submitted. Wait briefly, then call get_bond_status or retry deposit_bond before joining.',
      })
    },
  )
}

function extractDepositAmount(details: AuctionDetailResponse): string {
  const value = details.auction?.deposit_amount ?? details.depositAmount
  if (!value || !/^\d+$/.test(value)) {
    throw new Error('Auction details did not include a valid depositAmount')
  }
  return value
}

async function smartWaitForBondStatus(
  engine: EngineClient,
  auctionId: string,
  agentId: string,
  initialStatus: string,
  deps: BondToolsDeps,
): Promise<'PENDING' | 'CONFIRMED' | 'TIMEOUT'> {
  if (initialStatus === 'CONFIRMED' || initialStatus === 'TIMEOUT') {
    return initialStatus
  }

  const attempts = deps.smartWaitAttempts ?? 3
  const pollDelayMs = deps.pollDelayMs ?? 2_000
  const sleep = deps.sleep ?? defaultSleep
  let latestStatus: BondStatusResponse['status'] =
    initialStatus === 'PENDING' ? 'PENDING' : 'NONE'

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (pollDelayMs > 0) {
      await sleep(pollDelayMs)
    }

    try {
      const current = await engine.get<BondStatusResponse>(
        `/auctions/${auctionId}/bonds/${agentId}`,
      )
      latestStatus = current.status
      if (latestStatus === 'CONFIRMED' || latestStatus === 'TIMEOUT') {
        return latestStatus
      }
    } catch {
      break
    }
  }

  return latestStatus === 'NONE' ? 'PENDING' : latestStatus
}

function normalizeOptionalPrivateKey(value?: string): Hex | null {
  if (!value) {
    return null
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error('fundingPrivateKey must be a 0x-prefixed 64-char hex string')
  }

  return value as Hex
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
