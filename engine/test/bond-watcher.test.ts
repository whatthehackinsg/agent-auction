import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Miniflare } from 'miniflare'
import { ADDRESSES } from '../src/lib/addresses'
import {
  enforceJoinBondObservation,
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

  afterEach(async () => {
    await mf.dispose()
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
  })

  it('deprecated pollAndRecordBondTransfers returns 0 and does not confirm bonds', async () => {
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

    expect(confirmed).toBe(0)
    expect(writeCalls).toHaveLength(0)

    const status = await getBondStatus(db, auctionId, agentId, { now: 150 })
    expect(status.status).toBe('PENDING')
  })

  it('enforceJoinBondObservation accepts matching CONFIRMED bond', async () => {
    const auctionId = randomAuctionId()
    const agentId = '55'
    const depositor = randomWallet()
    const amount = '500000'

    await db
      .prepare(
        `INSERT INTO bond_observations (auction_id, agent_id, depositor, amount, status, requested_at, confirmed_at, observed_tx_hash, observed_log_index)
         VALUES (?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?)`,
      )
      .bind(auctionId, agentId, depositor, amount, 100, 110, '0x' + '12'.repeat(32), 2)
      .run()

    await expect(
      enforceJoinBondObservation(db, {
        auctionId,
        agentId,
        wallet: depositor,
        amount,
        now: 150,
      }),
    ).resolves.toBeUndefined()
  })

  it('enforceJoinBondObservation rejects stale CONFIRMED bond with insufficient amount and resets to PENDING', async () => {
    const auctionId = randomAuctionId()
    const agentId = '56'
    const depositor = randomWallet()

    await db
      .prepare(
        `INSERT INTO bond_observations (auction_id, agent_id, depositor, amount, status, requested_at, confirmed_at, observed_tx_hash, observed_log_index)
         VALUES (?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?)`,
      )
      .bind(auctionId, agentId, depositor, '1', 100, 110, '0x' + '34'.repeat(32), 3)
      .run()

    await expect(
      enforceJoinBondObservation(db, {
        auctionId,
        agentId,
        wallet: depositor,
        amount: '500000',
        now: 150,
      }),
    ).rejects.toThrow('bond pending')

    const row = await db
      .prepare(
        'SELECT status, amount, depositor, confirmed_at, observed_tx_hash, observed_log_index FROM bond_observations WHERE auction_id = ? AND agent_id = ?',
      )
      .bind(auctionId, agentId)
      .first<{
        status: string
        amount: string
        depositor: string
        confirmed_at: number | null
        observed_tx_hash: string | null
        observed_log_index: number | null
      }>()

    expect(row).not.toBeNull()
    expect(row!.status).toBe('PENDING')
    expect(row!.amount).toBe('500000')
    expect(row!.depositor.toLowerCase()).toBe(depositor.toLowerCase())
    expect(row!.confirmed_at).toBeNull()
    expect(row!.observed_tx_hash).toBeNull()
    expect(row!.observed_log_index).toBeNull()
  })
})
