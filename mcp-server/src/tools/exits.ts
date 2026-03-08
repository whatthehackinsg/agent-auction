import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Hex } from 'viem'
import type { EngineClient } from '../lib/engine.js'
import type { ServerConfig } from '../lib/config.js'
import { resolveBackendWriteTarget } from '../lib/agent-target.js'
import {
  claimEscrowRefund,
  createBackendAwareBaseSepoliaClients,
  readDesignatedWallet,
  readIdentityOwner,
  readWithdrawableBalance,
  withdrawEscrowFunds,
  type BaseSepoliaClients,
} from '../lib/onchain.js'
import { toolError, toolSuccess } from '../lib/tool-response.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

interface ExitToolsDeps {
  createClients?: (config: ServerConfig) => Promise<BaseSepoliaClients> | BaseSepoliaClients
}

interface AuctionDetailsResponse {
  auction?: {
    status?: number | string
  }
  snapshot?: {
    winnerAgentId?: string | null
    winnerWallet?: string | null
    winningBidAmount?: string | null
  }
}

export function registerExitTools(
  server: McpServer,
  engine: EngineClient,
  config: ServerConfig,
  deps: ExitToolsDeps = {},
): void {
  server.registerTool(
    'claim_refund',
    {
      title: 'Claim Refund',
      description:
        'Claim a refundable bond after an auction settles or is cancelled, then hand off directly to withdraw_funds when funds become withdrawable.',
      inputSchema: z.object({
        auctionId: z.string().describe('The 0x-prefixed bytes32 auction ID'),
        agentId: z
          .string()
          .optional()
          .describe('Optional explicit agent ID override. Defaults to AGENT_ID.'),
      }),
    },
    async ({ auctionId, agentId: inputAgentId }) => {
      let target: ReturnType<typeof resolveBackendWriteTarget>
      try {
        target = resolveBackendWriteTarget(config, {
          agentId: inputAgentId,
        })
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        return toolError(
          'MISSING_CONFIG',
          detail,
          'Complete the supported AgentKit + CDP Server Wallet setup, or explicitly opt into MCP_WALLET_BACKEND=raw-key.',
        )
      }

      let auctionDetails: AuctionDetailsResponse
      try {
        auctionDetails = await engine.get<AuctionDetailsResponse>(`/auctions/${auctionId}`)
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        return toolError(
          'ENGINE_ERROR',
          detail,
          'Could not load auction status. Check engine connectivity and try again.',
        )
      }

      const statusLabel = normalizeAuctionStatus(auctionDetails)
      const winnerAgentId = auctionDetails.snapshot?.winnerAgentId ?? null

      if (statusLabel !== 'SETTLED' && statusLabel !== 'CANCELLED') {
        return toolError(
          'REFUND_NOT_AVAILABLE',
          `Auction ${auctionId} is ${statusLabel}; refunds are only claimable after SETTLED or CANCELLED.`,
          'Wait for settlement or cancellation, then retry claim_refund.',
        )
      }

      if (statusLabel === 'SETTLED' && winnerAgentId === target.agentId) {
        return toolError(
          'REFUND_NOT_ELIGIBLE',
          `agentId ${target.agentId} is the settled winner for auction ${auctionId}`,
          'Winning agents should call withdraw_funds after settlement instead of claim_refund.',
        )
      }

      const clients = await getExitClients(config, deps)

      const withdrawableBefore = await safeReadWithdrawable(clients, target.agentId)
      const designatedWalletBefore = await safeReadDesignatedWallet(clients, target.agentId)
      if (withdrawableBefore > 0n) {
        return toolSuccess({
          auctionId,
          agentId: target.agentId,
          refundStatus: 'ALREADY_WITHDRAWABLE',
          walletBackend: target.backend.path,
          idempotent: true,
          withdrawableAmount: withdrawableBefore.toString(),
          destinationWallet: designatedWalletBefore,
          nextAction: 'withdraw_funds',
          nextStep: 'Funds are already withdrawable. Call withdraw_funds to transfer them out.',
        })
      }

      let claimResult: Awaited<ReturnType<typeof claimEscrowRefund>>
      try {
        claimResult = await claimEscrowRefund(clients, auctionId as Hex, BigInt(target.agentId))
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        if (isIdempotentRefundError(detail)) {
          return toolSuccess({
            auctionId,
            agentId: target.agentId,
            refundStatus: 'NOTHING_CLAIMABLE',
            idempotent: true,
            withdrawableAmount: '0',
            destinationWallet: designatedWalletBefore,
            nextAction: 'withdraw_funds',
            nextStep:
              'No new refund could be claimed. If funds later appear as withdrawable, use withdraw_funds.',
          })
        }

        return toolError(
          'REFUND_CLAIM_FAILED',
          detail,
          'Check auction status, bond history, and Base Sepolia RPC connectivity, then retry claim_refund.',
        )
      }

      const withdrawableAfter = await safeReadWithdrawable(clients, target.agentId)
      const designatedWalletAfter = await safeReadDesignatedWallet(clients, target.agentId)

      return toolSuccess({
        auctionId,
        agentId: target.agentId,
        refundStatus: 'CLAIMED',
        walletBackend: target.backend.path,
        txHash: claimResult.txHash,
        withdrawableAmount: withdrawableAfter.toString(),
        destinationWallet: designatedWalletAfter,
        nextAction: 'withdraw_funds',
        nextStep: 'Refund claimed. Call withdraw_funds next to transfer the withdrawable balance.',
      })
    },
  )

  server.registerTool(
    'withdraw_funds',
    {
      title: 'Withdraw Funds',
      description:
        'Withdraw the current escrow balance for an agent after checking ownership, current withdrawable balance, and the designated destination wallet.',
      inputSchema: z.object({
        agentId: z
          .string()
          .optional()
          .describe('Optional explicit agent ID override. Defaults to AGENT_ID.'),
      }),
    },
    async ({ agentId: inputAgentId }) => {
      let target: ReturnType<typeof resolveBackendWriteTarget>
      try {
        target = resolveBackendWriteTarget(config, {
          agentId: inputAgentId,
        })
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        return toolError(
          'MISSING_CONFIG',
          detail,
          'Complete the supported AgentKit + CDP Server Wallet setup, or explicitly opt into MCP_WALLET_BACKEND=raw-key.',
        )
      }

      const clients = await getExitClients(config, deps)

      let ownerWallet: string
      try {
        ownerWallet = await readIdentityOwner(clients.publicClient, BigInt(target.agentId))
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        return toolError(
          'IDENTITY_LOOKUP_FAILED',
          detail,
          'Could not verify the ERC-8004 owner for this agent. Check BASE_SEPOLIA_RPC and try again.',
        )
      }

      const targetWallet = target.wallet!
      if (ownerWallet.toLowerCase() !== targetWallet.toLowerCase()) {
        return toolError(
          'UNAUTHORIZED_WITHDRAW',
          `Configured wallet ${targetWallet} is not the ERC-8004 owner for agentId ${target.agentId} (owner is ${ownerWallet})`,
          'Use the owner wallet for this agent before calling withdraw_funds.',
        )
      }

      const withdrawableBefore = await safeReadWithdrawable(clients, target.agentId)
      const designatedWalletBefore = await safeReadDesignatedWallet(clients, target.agentId)

      if (withdrawableBefore === 0n) {
        return toolSuccess({
          agentId: target.agentId,
          walletBackend: target.backend.path,
          withdrawalStatus: 'NOTHING_TO_WITHDRAW',
          amount: '0',
          destinationWallet: designatedWalletBefore,
          remainingWithdrawable: '0',
        })
      }

      if (!designatedWalletBefore || designatedWalletBefore === ZERO_ADDRESS) {
        return toolError(
          'NO_DESTINATION_WALLET',
          `agentId ${target.agentId} has withdrawable funds but no designated destination wallet`,
          'Claim a refund or wait for settlement to set the destination wallet before calling withdraw_funds.',
        )
      }

      let withdrawResult: Awaited<ReturnType<typeof withdrawEscrowFunds>>
      try {
        withdrawResult = await withdrawEscrowFunds(clients, BigInt(target.agentId))
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        return toolError(
          'WITHDRAW_FAILED',
          detail,
          'Check owner authorization, withdrawable balance, and Base Sepolia RPC connectivity, then retry withdraw_funds.',
        )
      }

      return toolSuccess({
        agentId: target.agentId,
        walletBackend: target.backend.path,
        withdrawalStatus: 'WITHDRAWN',
        txHash: withdrawResult.txHash,
        amount: withdrawableBefore.toString(),
        destinationWallet: designatedWalletBefore,
        // withdraw() zeroes withdrawable[agentId] atomically or reverts.
        // Returning 0 avoids a stale immediate post-tx RPC read.
        remainingWithdrawable: '0',
      })
    },
  )
}

function getExitClients(
  config: ServerConfig,
  deps: ExitToolsDeps,
): Promise<BaseSepoliaClients> {
  const createClients = deps.createClients ?? createBackendAwareBaseSepoliaClients
  return Promise.resolve(createClients(config))
}

function normalizeAuctionStatus(details: AuctionDetailsResponse): 'OPEN' | 'CLOSED' | 'SETTLED' | 'CANCELLED' | 'UNKNOWN' {
  const status = details.auction?.status
  if (status === 1 || status === '1' || status === 'OPEN') return 'OPEN'
  if (status === 2 || status === '2' || status === 'CLOSED') return 'CLOSED'
  if (status === 3 || status === '3' || status === 'SETTLED') return 'SETTLED'
  if (status === 4 || status === '4' || status === 'CANCELLED') return 'CANCELLED'
  return 'UNKNOWN'
}

async function safeReadWithdrawable(
  clients: BaseSepoliaClients,
  agentId: string,
): Promise<bigint> {
  return readWithdrawableBalance(clients.publicClient, BigInt(agentId))
}

async function safeReadDesignatedWallet(
  clients: BaseSepoliaClients,
  agentId: string,
): Promise<string> {
  return readDesignatedWallet(clients.publicClient, BigInt(agentId))
}

function isIdempotentRefundError(detail: string): boolean {
  const lowered = detail.toLowerCase()
  return (
    lowered.includes('already refunded') ||
    lowered.includes('nobondfound') ||
    lowered.includes('no bond') ||
    lowered.includes('nothing to refund')
  )
}
