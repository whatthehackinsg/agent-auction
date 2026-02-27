import { formatUnits } from 'viem'
import {
  createDeployerClients,
  createWalletForPrivateKey,
  getAgentPrivateKeys,
} from './config'
import {
  claimRefund,
  createAuction,
  getWinner,
  joinAuction,
  placeBid,
  postBond,
  submitBondProof,
  waitForSettlement,
} from './auction'
import { fundWithUSDC, getUsdcBalance, registerIdentity } from './identity'
import { deployWallet } from './wallet'
import { logStep, sleep } from './utils'

type AgentRun = {
  name: string
  agentId: bigint
  eoaAddress: `0x${string}`
  privateKey: `0x${string}`
  walletClient: ReturnType<typeof createWalletForPrivateKey>['walletClient']
  smartWallet: `0x${string}`
}

const USDC = BigInt(1_000_000)

async function main() {
  const started = Date.now()
  logStep('demo', 'starting 3-agent lifecycle demo')

  const deployer = createDeployerClients()
  const privateKeys = getAgentPrivateKeys().slice(0, 3)

  const agentIds = [BigInt(1001), BigInt(1002), BigInt(1003)]
  const labels = ['Agent-A', 'Agent-B', 'Agent-C'] as const

  const runs: AgentRun[] = []

  const auction = await createAuction({
    reservePrice: BigInt(80) * USDC,
    depositAmount: BigInt(50) * USDC,
    deadlineSecFromNow: 60,
  })
  logStep('auction', `created ${auction.auctionId}`)

  for (let i = 0; i < 3; i++) {
    const signer = createWalletForPrivateKey(privateKeys[i])
    const smartWallet = await deployWallet(signer.account.address, BigInt(100 + i))

    await registerIdentity(agentIds[i], signer.account.address)
    await fundWithUSDC(signer.account.address, BigInt(200) * USDC)

    const balance = await getUsdcBalance(signer.account.address)
    logStep('funding', `${labels[i]} balance=${formatUnits(balance, 6)} USDC`) 

    runs.push({
      name: labels[i],
      agentId: agentIds[i],
      eoaAddress: signer.account.address,
      privateKey: privateKeys[i],
      walletClient: signer.walletClient,
      smartWallet,
    })
    logStep('agent', `${labels[i]} ready eoa=${signer.account.address} smart=${smartWallet}`)
  }

  for (const agent of runs) {
    const bondTxHash = await postBond({
      walletClient: agent.walletClient,
      walletAddress: agent.eoaAddress,
      auctionId: auction.auctionId,
      amount: BigInt(50) * USDC,
    })
    logStep('bond', `${agent.name} bond posted tx=${bondTxHash}`)

    // Wait for TX to propagate across RPCs before submitting proof to engine
    await sleep(3000)

    await submitBondProof({
      auctionId: auction.auctionId,
      agentId: agent.agentId,
      depositor: agent.eoaAddress,
      amount: BigInt(50) * USDC,
      txHash: bondTxHash,
    })
    logStep('bond', `${agent.name} bond verified`)

    await joinAuction({
      auctionId: auction.auctionId,
      agentId: agent.agentId,
      wallet: agent.eoaAddress,
      bondAmount: BigInt(50) * USDC,
      nonce: 0,
      privateKey: agent.privateKey,
    })
    logStep('join', `${agent.name} joined auction`) 
  }

  await placeBid({
    auctionId: auction.auctionId,
    agentId: runs[0].agentId,
    wallet: runs[0].eoaAddress,
    amount: BigInt(100) * USDC,
    nonce: 0,
    privateKey: runs[0].privateKey,
  })
  logStep('bid', 'Agent-A bid 100 USDC')
  await sleep(800)

  await placeBid({
    auctionId: auction.auctionId,
    agentId: runs[1].agentId,
    wallet: runs[1].eoaAddress,
    amount: BigInt(150) * USDC,
    nonce: 0,
    privateKey: runs[1].privateKey,
  })
  logStep('bid', 'Agent-B bid 150 USDC')
  await sleep(800)

  await placeBid({
    auctionId: auction.auctionId,
    agentId: runs[2].agentId,
    wallet: runs[2].eoaAddress,
    amount: BigInt(200) * USDC,
    nonce: 0,
    privateKey: runs[2].privateKey,
  })
  logStep('bid', 'Agent-C bid 200 USDC')

  if (process.env.SKIP_SETTLEMENT_WAIT === '1') {
    logStep('settlement', 'SKIP_SETTLEMENT_WAIT=1 set, skipping settlement verification')
  } else {
    logStep('settlement', 'waiting for on-chain close + settlement (up to 3 min)')
    logStep('settlement', 'tip: run settlement watcher in another terminal for full SETTLED state:')
    logStep('settlement', '  cd cre && bun run scripts/settlement-watcher.ts')

    const result = await waitForSettlement(auction.auctionId, 180_000)

    if (result.state === 3) {
      logStep('settlement', 'auction fully SETTLED via CRE onReport()')
    } else if (result.state === 2) {
      logStep('settlement', 'auction CLOSED on-chain (recordResult succeeded)')
      logStep('settlement', 'CRE settlement not detected — run the settlement watcher for full E2E')
    }

    const winner = await getWinner(auction.auctionId)
    logStep(
      'settlement',
      `winner on-chain agentId=${winner.agentId.toString()} wallet=${winner.wallet} amount=${formatUnits(winner.amount, 6)} USDC`,
    )

    if (winner.agentId !== runs[2].agentId) {
      throw new Error(
        `unexpected winner: expected Agent-C (${runs[2].agentId.toString()}), got ${winner.agentId.toString()}`,
      )
    }

    // Refunds only work after SETTLED — skip if only CLOSED
    if (result.state === 3) {
      await claimRefund({
        walletClient: deployer.walletClient,
        caller: deployer.account.address,
        auctionId: auction.auctionId,
        agentId: runs[0].agentId,
      })
      logStep('refund', 'Agent-A refund claimed')

      await claimRefund({
        walletClient: deployer.walletClient,
        caller: deployer.account.address,
        auctionId: auction.auctionId,
        agentId: runs[1].agentId,
      })
      logStep('refund', 'Agent-B refund claimed')
    } else {
      logStep('refund', 'skipping refund claims (requires SETTLED state from CRE)')
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  logStep('demo', `completed in ${elapsed}s`) 
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err)
  logStep('fatal', message)
  process.exitCode = 1
})
