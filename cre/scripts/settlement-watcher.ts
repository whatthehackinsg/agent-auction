#!/usr/bin/env bun
/**
 * CRE Settlement Watcher
 *
 * Watches for AuctionEnded events on Base Sepolia and automatically
 * triggers `cre workflow simulate --broadcast` for each one.
 *
 * This replaces live CRE deployment for testing/demos —
 * same on-chain result (automatic settlement), just runs locally.
 *
 * Usage:
 *   cd cre
 *   bun run scripts/settlement-watcher.ts
 *
 * Env:
 *   BASE_SEPOLIA_RPC  — RPC URL (default: https://sepolia.base.org)
 */

import { createPublicClient, http, parseAbiItem, type Log } from 'viem'
import { baseSepolia } from 'viem/chains'
import { spawn } from 'child_process'
import path from 'path'

const AUCTION_REGISTRY = '0xFEc7a05707AF85C6b248314E20FF8EfF590c3639'
const WORKFLOW_DIR = path.resolve(import.meta.dir, '../workflows/settlement')
const CRE_PROJECT_ROOT = path.resolve(import.meta.dir, '..')

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC ?? 'https://sepolia.base.org'),
})

const auctionEndedEvent = parseAbiItem(
  'event AuctionEnded(bytes32 indexed auctionId, uint256 indexed winnerAgentId, address winnerWallet, uint256 finalPrice, bytes32 finalLogHash, bytes32 replayContentHash)',
)

/** Track processed TX hashes to avoid duplicate triggers */
const processed = new Set<string>()

function runCRESimulate(txHash: string, eventIndex: number): Promise<number> {
  return new Promise((resolve, reject) => {
    console.log(`[watcher] triggering CRE simulate --broadcast for TX ${txHash}`)

    const proc = spawn(
      'cre',
      [
        'workflow', 'simulate', WORKFLOW_DIR,
        '--target', 'base-sepolia',
        '--broadcast',
        '--non-interactive',
        '--trigger-index', '0',
        '--evm-tx-hash', txHash,
        '--evm-event-index', String(eventIndex),
      ],
      {
        cwd: CRE_PROJECT_ROOT,
        stdio: 'inherit',
        env: { ...process.env },
      },
    )

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`[watcher] settlement succeeded for TX ${txHash}`)
      } else {
        console.error(`[watcher] settlement failed for TX ${txHash} (exit ${code})`)
      }
      resolve(code ?? 1)
    })

    proc.on('error', (err) => {
      console.error(`[watcher] failed to spawn CRE CLI:`, err)
      reject(err)
    })
  })
}

async function handleLog(log: Log) {
  const txHash = log.transactionHash
  if (!txHash || processed.has(txHash)) return

  processed.add(txHash)

  const auctionId = log.topics[1] ?? 'unknown'
  const winnerAgentId = log.topics[2] ?? 'unknown'
  console.log(`\n[watcher] AuctionEnded detected!`)
  console.log(`  auctionId:     ${auctionId}`)
  console.log(`  winnerAgentId: ${winnerAgentId}`)
  console.log(`  TX:            ${txHash}`)
  console.log(`  block:         ${log.blockNumber}`)

  // Find the event index within the TX receipt
  const receipt = await client.getTransactionReceipt({ hash: txHash })
  let eventIndex = 0
  for (const receiptLog of receipt.logs) {
    if (
      receiptLog.address.toLowerCase() === AUCTION_REGISTRY.toLowerCase() &&
      receiptLog.topics[0] === log.topics[0]
    ) {
      if (receiptLog.logIndex === log.logIndex) break
      eventIndex++
    }
  }

  await runCRESimulate(txHash, eventIndex)
}

async function main() {
  console.log('============================================================')
  console.log('  CRE Settlement Watcher')
  console.log('============================================================')
  console.log(`  Registry:  ${AUCTION_REGISTRY}`)
  console.log(`  Chain:     Base Sepolia (84532)`)
  console.log(`  Workflow:  ${WORKFLOW_DIR}`)
  console.log(`  Polling:   every 4s`)
  console.log('------------------------------------------------------------')
  console.log('  Watching for AuctionEnded events...')
  console.log('  Press Ctrl+C to stop')
  console.log('============================================================\n')

  client.watchEvent({
    address: AUCTION_REGISTRY as `0x${string}`,
    event: auctionEndedEvent,
    onLogs: (logs) => {
      for (const log of logs) {
        handleLog(log).catch((err) =>
          console.error('[watcher] error handling log:', err),
        )
      }
    },
    onError: (error) => {
      console.error('[watcher] event watch error:', error)
    },
    pollingInterval: 4_000,
  })

  // Keep alive until Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n[watcher] shutting down...')
    process.exit(0)
  })
  await new Promise(() => {})
}

main().catch(console.error)
