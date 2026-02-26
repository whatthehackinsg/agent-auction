import { describe, it, expect, beforeEach } from 'vitest'
import { Miniflare } from 'miniflare'
import { ADDRESSES } from '../src/lib/addresses'
import {
  getBondStatus,
  pollAndRecordBondTransfers,
  registerPendingBond,
} from '../src/lib/bond-watcher'
import { applySchema, createTestMiniflare, randomAuctionId, randomAgentId, randomWallet } from './setup'

describe('Bond watcher (Task 16)', () => {
  let mf: Miniflare
  let db: D1Database

  beforeEach(async () => {
    mf = createTestMiniflare()
    db = await mf.getD1Database('AUCTION_DB')
    await applySchema(db)
  })

  it('registers pending bond and reports PENDING/TIMEOUT status', async () => {
    const auctionId = randomAuctionId()
    const agentId = randomAgentId().toString()
    const wallet = randomWallet()

    await registerPendingBond(db, {
      auctionId,
      agentId,
      depositor: wallet,
      amount: '1000000',
      now: 100,
    })

    const pending = await getBondStatus(db, auctionId, agentId, { now: 120 })
    expect(pending.status).toBe('PENDING')

    const timeout = await getBondStatus(db, auctionId, agentId, {
      now: 200,
      timeoutSeconds: 60,
    })
    expect(timeout.status).toBe('TIMEOUT')

    await mf.dispose()
  })

  it('detects transfer log and calls recordBond, then marks CONFIRMED', async () => {
    const auctionId = randomAuctionId()
    const agentId = '42'
    const depositor = randomWallet()
    const amount = '500000'

    await registerPendingBond(db, {
      auctionId,
      agentId,
      depositor,
      amount,
      now: 100,
    })

    const writeCalls: unknown[] = []
    const mockPublicClient = {
      getLogs: async () => [
        {
          args: {
            from: depositor,
            to: ADDRESSES.auctionEscrow,
            value: BigInt(amount),
          },
          transactionHash: ('0x' + '12'.repeat(32)) as `0x${string}`,
          logIndex: 7,
        },
      ],
    }
    const mockWalletClient = {
      writeContract: async (args: unknown) => {
        writeCalls.push(args)
        return ('0x' + '34'.repeat(32)) as `0x${string}`
      },
    }

    const confirmed = await pollAndRecordBondTransfers(
      db,
      (process.env.SEQUENCER_PRIVATE_KEY ?? '0x' + '11'.repeat(32)) as `0x${string}`,
      {
        now: 150,
        publicClientLike: mockPublicClient,
        walletClientLike: mockWalletClient,
      },
    )

    expect(confirmed).toBe(1)
    expect(writeCalls).toHaveLength(1)

    const status = await getBondStatus(db, auctionId, agentId, { now: 150 })
    expect(status.status).toBe('CONFIRMED')
    expect(status.observedLogIndex).toBe(7)

    await mf.dispose()
  })
})
