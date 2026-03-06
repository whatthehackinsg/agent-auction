import { describe, expect, it, vi } from 'vitest'
import type { EngineClient } from '../src/lib/engine.js'
import { registerExitTools } from '../src/tools/exits.js'
import {
  makeCapturingMcpServerMulti,
  makeConfig,
  makeFakeReceipt,
  makeFakeTxHash,
  makeOnchainClients,
  parseToolResponse,
  TEST_AUCTION_ID,
  TEST_WALLET,
} from './helpers.js'

function makeAuctionDetails(status: number, winnerAgentId: string = '0') {
  return {
    auction: {
      status,
      deposit_amount: '50000000',
    },
    snapshot: {
      winnerAgentId,
      winningBidAmount: '100000000',
      winnerWallet: TEST_WALLET,
    },
  }
}

function makeExitEngine(details = makeAuctionDetails(3, '9')): EngineClient {
  return {
    get: async (path: string) => {
      if (path === `/auctions/${TEST_AUCTION_ID}`) {
        return details
      }
      throw new Error(`Unexpected GET ${path}`)
    },
    post: async () => {
      throw new Error('Unexpected POST')
    },
  } as unknown as EngineClient
}

function makeExitClients(options?: {
  owner?: string
  withdrawableBefore?: bigint
  withdrawableAfter?: bigint
  designatedWalletBefore?: string
  designatedWalletAfter?: string
  txHash?: `0x${string}`
}) {
  let withdrawableReads = 0
  let designatedWalletReads = 0

  return makeOnchainClients({
    readContractImpl: async (args) => {
      const functionName = (args as { functionName: string }).functionName

      if (functionName === 'ownerOf') {
        return options?.owner ?? TEST_WALLET
      }
      if (functionName === 'withdrawable') {
        withdrawableReads += 1
        return withdrawableReads === 1
          ? options?.withdrawableBefore ?? 0n
          : options?.withdrawableAfter ?? options?.withdrawableBefore ?? 0n
      }
      if (functionName === 'getDesignatedWallet') {
        designatedWalletReads += 1
        return designatedWalletReads === 1
          ? options?.designatedWalletBefore ?? TEST_WALLET
          : options?.designatedWalletAfter ?? options?.designatedWalletBefore ?? TEST_WALLET
      }

      throw new Error(`Unexpected readContract(${functionName})`)
    },
    writeContractImpl: async () => options?.txHash ?? makeFakeTxHash('66'),
    waitForReceiptImpl: async (hash) => makeFakeReceipt({ transactionHash: hash }),
  })
}

describe('claim_refund', () => {
  it('returns a preflight error when the auction is still OPEN', async () => {
    const createClients = vi.fn()
    const { mockServer, getHandler } = makeCapturingMcpServerMulti()

    registerExitTools(
      mockServer,
      makeExitEngine(makeAuctionDetails(1)),
      makeConfig({
        baseSepoliaRpc: 'https://base-sepolia.example',
      }),
      {
        createClients,
      },
    )

    const handler = getHandler('claim_refund')
    const result = await handler({
      auctionId: TEST_AUCTION_ID,
      agentId: '5',
    })
    const body = parseToolResponse(result)

    expect(body.success).toBe(false)
    expect(body.error).toMatchObject({
      code: 'REFUND_NOT_AVAILABLE',
    })
    expect(createClients).not.toHaveBeenCalled()
  })

  it('claims a settled loser refund and points directly to withdraw_funds', async () => {
    const txHash = makeFakeTxHash('77')
    const { clients, writeCalls } = makeExitClients({
      withdrawableBefore: 0n,
      withdrawableAfter: 50000000n,
      designatedWalletBefore: TEST_WALLET,
      designatedWalletAfter: TEST_WALLET,
      txHash,
    })
    const { mockServer, getHandler } = makeCapturingMcpServerMulti()

    registerExitTools(
      mockServer,
      makeExitEngine(makeAuctionDetails(3, '9')),
      makeConfig({
        baseSepoliaRpc: 'https://base-sepolia.example',
      }),
      {
        createClients: () => clients,
      },
    )

    const handler = getHandler('claim_refund')
    const result = await handler({
      auctionId: TEST_AUCTION_ID,
      agentId: '5',
    })
    const body = parseToolResponse(result)

    expect(body.success).toBe(true)
    expect(body.auctionId).toBe(TEST_AUCTION_ID)
    expect(body.agentId).toBe('5')
    expect(body.refundStatus).toBe('CLAIMED')
    expect(body.txHash).toBe(txHash)
    expect(body.withdrawableAmount).toBe('50000000')
    expect(body.destinationWallet).toBe(TEST_WALLET)
    expect(body.nextAction).toBe('withdraw_funds')

    expect(writeCalls).toHaveLength(1)
    const claimCall = writeCalls[0] as {
      functionName: string
      args: [string, bigint]
    }
    expect(claimCall.functionName).toBe('claimRefund')
    expect(claimCall.args).toEqual([TEST_AUCTION_ID, 5n])
  })

  it('returns an idempotent already-withdrawable state instead of re-sending claimRefund', async () => {
    const { clients, writeCalls } = makeExitClients({
      withdrawableBefore: 50000000n,
      withdrawableAfter: 50000000n,
      designatedWalletBefore: TEST_WALLET,
    })
    const { mockServer, getHandler } = makeCapturingMcpServerMulti()

    registerExitTools(
      mockServer,
      makeExitEngine(makeAuctionDetails(4)),
      makeConfig({
        baseSepoliaRpc: 'https://base-sepolia.example',
      }),
      {
        createClients: () => clients,
      },
    )

    const handler = getHandler('claim_refund')
    const result = await handler({
      auctionId: TEST_AUCTION_ID,
      agentId: '5',
    })
    const body = parseToolResponse(result)

    expect(body.success).toBe(true)
    expect(body.refundStatus).toBe('ALREADY_WITHDRAWABLE')
    expect(body.idempotent).toBe(true)
    expect(body.withdrawableAmount).toBe('50000000')
    expect(body.nextAction).toBe('withdraw_funds')
    expect(writeCalls).toHaveLength(0)
  })
})

describe('withdraw_funds', () => {
  it('returns a no-op result when nothing is withdrawable', async () => {
    const { clients, writeCalls } = makeExitClients({
      withdrawableBefore: 0n,
      designatedWalletBefore: TEST_WALLET,
    })
    const { mockServer, getHandler } = makeCapturingMcpServerMulti()

    registerExitTools(
      mockServer,
      makeExitEngine(),
      makeConfig({
        baseSepoliaRpc: 'https://base-sepolia.example',
      }),
      {
        createClients: () => clients,
      },
    )

    const handler = getHandler('withdraw_funds')
    const result = await handler({
      agentId: '5',
    })
    const body = parseToolResponse(result)

    expect(body.success).toBe(true)
    expect(body.withdrawalStatus).toBe('NOTHING_TO_WITHDRAW')
    expect(body.amount).toBe('0')
    expect(body.destinationWallet).toBe(TEST_WALLET)
    expect(writeCalls).toHaveLength(0)
  })

  it('blocks withdraw_funds when the configured signer is not the ERC-8004 owner', async () => {
    const { clients, writeCalls } = makeExitClients({
      owner: '0x0000000000000000000000000000000000000005',
      withdrawableBefore: 50000000n,
      designatedWalletBefore: TEST_WALLET,
    })
    const { mockServer, getHandler } = makeCapturingMcpServerMulti()

    registerExitTools(
      mockServer,
      makeExitEngine(),
      makeConfig({
        baseSepoliaRpc: 'https://base-sepolia.example',
      }),
      {
        createClients: () => clients,
      },
    )

    const handler = getHandler('withdraw_funds')
    const result = await handler({
      agentId: '5',
    })
    const body = parseToolResponse(result)

    expect(body.success).toBe(false)
    expect(body.error).toMatchObject({
      code: 'UNAUTHORIZED_WITHDRAW',
    })
    expect(writeCalls).toHaveLength(0)
  })

  it('withdraws available funds and returns the full summary', async () => {
    const txHash = makeFakeTxHash('88')
    const { clients, writeCalls } = makeExitClients({
      withdrawableBefore: 50000000n,
      withdrawableAfter: 0n,
      designatedWalletBefore: TEST_WALLET,
      designatedWalletAfter: '0x0000000000000000000000000000000000000000',
      txHash,
    })
    const { mockServer, getHandler } = makeCapturingMcpServerMulti()

    registerExitTools(
      mockServer,
      makeExitEngine(),
      makeConfig({
        baseSepoliaRpc: 'https://base-sepolia.example',
      }),
      {
        createClients: () => clients,
      },
    )

    const handler = getHandler('withdraw_funds')
    const result = await handler({
      agentId: '5',
    })
    const body = parseToolResponse(result)

    expect(body.success).toBe(true)
    expect(body.withdrawalStatus).toBe('WITHDRAWN')
    expect(body.agentId).toBe('5')
    expect(body.txHash).toBe(txHash)
    expect(body.amount).toBe('50000000')
    expect(body.destinationWallet).toBe(TEST_WALLET)
    expect(body.remainingWithdrawable).toBe('0')

    expect(writeCalls).toHaveLength(1)
    const withdrawCall = writeCalls[0] as {
      functionName: string
      args: [bigint]
    }
    expect(withdrawCall.functionName).toBe('withdraw')
    expect(withdrawCall.args).toEqual([5n])
  })
})
