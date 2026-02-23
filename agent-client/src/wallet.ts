import { type Address, type Hex } from 'viem'
import { baseSepolia } from 'viem/chains'
import { fileURLToPath } from 'node:url'
import {
  ADDRESSES,
  createDeployerClients,
  createWalletForPrivateKey,
  factoryAbi,
  getDeployerPrivateKey,
  publicClient,
} from './config'
import { logStep } from './utils'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getCallable(record: Record<string, unknown>, name: string): ((...args: unknown[]) => unknown) | null {
  const maybe = record[name]
  if (typeof maybe !== 'function') {
    return null
  }
  return (...args: unknown[]) => Reflect.apply(maybe, undefined, args)
}

export async function getWalletAddress(runtimeSigner: Address, salt: bigint): Promise<Address> {
  const predicted = await publicClient.readContract({
    address: ADDRESSES.agentAccountFactory,
    abi: factoryAbi,
    functionName: 'getAddress',
    args: [runtimeSigner, salt],
  })
  return predicted as Address
}

/**
 * Optional UserOp probe using permissionless.js.
 * This keeps the demo compatible with repos that do not have bundler/paymaster configured.
 */
async function tryPermissionlessProbe(): Promise<boolean> {
  const bundlerRpc = process.env.BUNDLER_RPC_URL
  if (!bundlerRpc) {
    return false
  }

  try {
    const permissionlessUnknown: unknown = await import('permissionless')
    const accountsUnknown: unknown = await import('permissionless/accounts')
    if (!isRecord(permissionlessUnknown) || !isRecord(accountsUnknown)) {
      return false
    }

    const createSmartAccountClient = getCallable(permissionlessUnknown, 'createSmartAccountClient')
    const toSimpleSmartAccount = getCallable(accountsUnknown, 'toSimpleSmartAccount')
    if (!createSmartAccountClient || !toSimpleSmartAccount) {
      return false
    }

    const maybeEntryPoint = permissionlessUnknown['entryPoint07Address']
    const entryPointAddress: Address =
      typeof maybeEntryPoint === 'string' ? (maybeEntryPoint as Address) : ADDRESSES.entryPoint

    const owner = createWalletForPrivateKey(getDeployerPrivateKey()).account

    const simpleAccount = await Promise.resolve(
      toSimpleSmartAccount({
        owner,
        client: publicClient,
        entryPoint: { address: entryPointAddress, version: '0.7' },
      }),
    )

    const smartClientUnknown = createSmartAccountClient({
      account: simpleAccount,
      chain: baseSepolia,
      bundlerTransport: { url: bundlerRpc },
    })

    if (!isRecord(smartClientUnknown)) {
      return false
    }

    const sendUserOperation = getCallable(smartClientUnknown, 'sendUserOperation')
    const waitForReceipt = getCallable(smartClientUnknown, 'waitForUserOperationReceipt')

    if (!sendUserOperation || !waitForReceipt) {
      return false
    }

    const hash = await Promise.resolve(
      sendUserOperation({
        calls: [{ to: owner.address, value: BigInt(0), data: '0x' }],
      }),
    )
    await Promise.resolve(waitForReceipt({ hash }))
    return true
  } catch {
    return false
  }
}

export async function deployWallet(runtimeSigner: Address, salt: bigint): Promise<Address> {
  const predicted = await getWalletAddress(runtimeSigner, salt)
  const code = await publicClient.getCode({ address: predicted })
  if (code && code !== '0x') {
    logStep('wallet', `already deployed at ${predicted}`)
    return predicted
  }

  const { walletClient } = createDeployerClients()

  logStep('wallet', `deploying AgentAccount for signer=${runtimeSigner} salt=${salt.toString()}`)
  const txHash = await walletClient.writeContract({
    address: ADDRESSES.agentAccountFactory,
    abi: factoryAbi,
    functionName: 'createAccount',
    args: [runtimeSigner, salt],
  })
  await publicClient.waitForTransactionReceipt({ hash: txHash })

  const deployed = await getWalletAddress(runtimeSigner, salt)
  const deployedCode = await publicClient.getCode({ address: deployed })
  if (!deployedCode || deployedCode === '0x') {
    throw new Error(`account deployment failed at predicted address ${deployed}`)
  }

  const userOpReady = await tryPermissionlessProbe()
  logStep('wallet', `permissionless UserOp probe ${userOpReady ? 'available' : 'skipped/unavailable'}`)

  return deployed
}

async function runCli(): Promise<void> {
  const runtimeSigner = process.env.RUNTIME_SIGNER as Address | undefined
  const saltRaw = process.env.SALT

  if (!runtimeSigner || !/^0x[0-9a-fA-F]{40}$/.test(runtimeSigner)) {
    throw new Error('RUNTIME_SIGNER must be provided as 0x-prefixed address')
  }
  if (!saltRaw || !/^\d+$/.test(saltRaw)) {
    throw new Error('SALT must be provided as uint string')
  }

  const salt = BigInt(saltRaw)
  const addr = await deployWallet(runtimeSigner, salt)
  logStep('wallet', `deployed_address=${addr}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli().catch((err) => {
    const message = err instanceof Error ? err.message : String(err)
    logStep('fatal', message)
    process.exitCode = 1
  })
}
