import { type Address } from 'viem'
import {
  ADDRESSES,
  createDeployerClients,
  identityAbi,
  publicClient,
  usdcAbi,
} from './config'
import { logStep } from './utils'

export async function registerIdentity(agentId: bigint, owner: Address): Promise<void> {
  const { walletClient } = createDeployerClients()
  logStep('identity', `register agentId=${agentId.toString()} owner=${owner}`)

  try {
    const txHash = await walletClient.writeContract({
      address: ADDRESSES.mockIdentityRegistry,
      abi: identityAbi,
      functionName: 'registerWithId',
      args: [agentId, owner],
    })
    await publicClient.waitForTransactionReceipt({ hash: txHash })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('Already registered')) {
      logStep('identity', `agentId=${agentId.toString()} already registered, continuing`)
      return
    }
    throw err
  }
}

export async function fundWithUSDC(wallet: Address, amount: bigint): Promise<void> {
  const { walletClient } = createDeployerClients()
  logStep('funding', `mint ${amount.toString()} usdc-units to ${wallet}`)

  const txHash = await walletClient.writeContract({
    address: ADDRESSES.mockUSDC,
    abi: usdcAbi,
    functionName: 'mint',
    args: [wallet, amount],
  })
  await publicClient.waitForTransactionReceipt({ hash: txHash })
}

export async function getUsdcBalance(wallet: Address): Promise<bigint> {
  const balance = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: [wallet],
  })
  return balance as bigint
}
