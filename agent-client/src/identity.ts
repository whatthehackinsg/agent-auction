import { type Address, decodeEventLog } from 'viem'
import {
  ADDRESSES,
  createDeployerClients,
  erc8004Abi,
  identityAbi,
  publicClient,
  usdcAbi,
} from './config'
import { logStep } from './utils'

/**
 * Register an agent via ERC-8004 Identity Registry.
 *
 * Calls register(agentURI) — the caller (deployer) becomes the owner.
 * Parses the Registered event to extract the minted agentId.
 *
 * Falls back to MockIdentityRegistry.registerWithId() when
 * USE_MOCK_IDENTITY=true (local dev / testing).
 */
export async function registerIdentity(agentId: bigint, owner: Address): Promise<void> {
  const useMock = process.env.USE_MOCK_IDENTITY === 'true'
  const { walletClient } = createDeployerClients()

  if (useMock) {
    logStep('identity', `[mock] register agentId=${agentId.toString()} owner=${owner}`)
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
    return
  }

  // ERC-8004: self-register with agentURI
  const agentURI = `agent://${owner}/${agentId.toString()}`
  logStep('identity', `[erc-8004] register agentURI=${agentURI}`)

  try {
    const txHash = await walletClient.writeContract({
      address: ADDRESSES.identityRegistry,
      abi: erc8004Abi,
      functionName: 'register',
      args: [agentURI],
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

    // Parse Registered event to confirm
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: erc8004Abi,
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName === 'Registered') {
          logStep('identity', `registered agentId=${(decoded.args as { agentId: bigint }).agentId.toString()}`)
          return
        }
      } catch {
        // Not a matching event, skip
      }
    }
    logStep('identity', `tx confirmed but no Registered event found (tx=${txHash})`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('already registered') || message.includes('ERC721')) {
      logStep('identity', `agent already registered, continuing`)
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
