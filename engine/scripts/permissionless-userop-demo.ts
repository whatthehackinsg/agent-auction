import {
  parseEther,
  createPublicClient,
  http,
  getAddress,
  type Address,
  type Hex,
} from "viem"
import { baseSepolia } from "viem/chains"
import { privateKeyToAccount } from "viem/accounts"
import { entryPoint07Address, toSimpleSmartAccount } from "permissionless/accounts"
import { createSmartAccountClient } from "permissionless"
import { createPimlicoClient } from "permissionless/clients/pimlico"

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

const bundlerEndpoints = parseEndpointList(
  process.env.PIMLICO_BUNDLER_URL,
  process.env.BUNDLER_URL_FALLBACKS,
)
const paymasterEndpoints = parseEndpointList(
  process.env.PIMLICO_PAYMASTER_URL,
  process.env.PIMLICO_PAYMASTER_URL_FALLBACKS,
)

if (bundlerEndpoints.length === 0) {
  throw new Error(
    "Set PIMLICO_BUNDLER_URL and optionally BUNDLER_URL_FALLBACKS before running this script.",
  )
}

const baseRpcUrl = requireEnv("BASE_SEPOLIA_RPC_URL")
const privateKey = requireEnv("PRIVATE_KEY")
const destination = process.env.DESTINATION
const txValueWei = process.env.TX_VALUE_WEI
  ? BigInt(process.env.TX_VALUE_WEI)
  : parseEther(process.env.TX_VALUE_ETH ?? "0")
const requestTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || "") || DEFAULT_REQUEST_TIMEOUT_MS

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(baseRpcUrl),
})

const owner = privateKeyToAccount(privateKey as Hex)

async function main() {
  const account = await toSimpleSmartAccount({
    client: publicClient,
    owner,
    entryPoint: {
      address: entryPoint07Address,
      version: "0.7",
    },
  })

  const to = destination ? getAddress(destination as Address) : account.address

  console.log("EntryPoint", entryPoint07Address)
  console.log("Smart account", account.address)
  console.log("Destination", to)

  let lastError: unknown
  for (let i = 0; i < bundlerEndpoints.length; i++) {
    const bundlerUrl = bundlerEndpoints[i]
    const paymasterUrl = paymasterEndpoints[i] ?? paymasterEndpoints[0] ?? undefined

    console.log(`Attempting bundler: ${bundlerUrl}`)

    const pimlicoPaymaster = paymasterUrl
      ? createPimlicoClient({
          chain: baseSepolia,
          transport: http(paymasterUrl, { timeout: requestTimeoutMs }),
          entryPoint: {
            address: entryPoint07Address,
            version: "0.7",
          },
        })
      : undefined

    const smartAccountClient = createSmartAccountClient({
      account,
      chain: baseSepolia,
      bundlerTransport: http(bundlerUrl, { timeout: requestTimeoutMs }),
      paymaster: pimlicoPaymaster
        ? {
            getPaymasterData: pimlicoPaymaster.getPaymasterData,
            getPaymasterStubData: pimlicoPaymaster.getPaymasterStubData,
          }
        : undefined,
      paymasterContext: {
        mode: "SPONSORED",
      },
    })

    try {
      const userOpHash = await smartAccountClient.sendUserOperation({
        calls: [
          {
            to,
            value: txValueWei,
            data: "0x",
          },
        ],
      })

      console.log("UserOperation hash", userOpHash)

      const receipt = await smartAccountClient.waitForUserOperationReceipt({
        hash: userOpHash,
      })

      console.log("Bundler endpoint success", bundlerUrl)
      console.log("onChain tx hash", receipt.receipt.transactionHash)
      console.log("UserOp status", receipt.success ? "success" : "failed")
      return
    } catch (error) {
      lastError = error
      if (!isRetryableBundlerError(error)) {
        throw error
      }

      if (i === bundlerEndpoints.length - 1) {
        break
      }

      console.warn(
        `Bundler ${bundlerUrl} failed. Switching to fallback`,
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  throw new Error(`All bundler endpoints failed. Last error: ${String(lastError)}`)
}

function parseEndpointList(primary?: string, fallbackList?: string): string[] {
  const endpoints = [
    ...(primary ? [primary] : []),
    ...(fallbackList
      ? fallbackList
          .split(",")
          .map((raw) => raw.trim())
          .filter(Boolean)
      : []),
  ]
  return Array.from(new Set(endpoints))
}

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value || value.trim() === "") {
    throw new Error(`Environment variable ${name} is required.`)
  }
  return value
}

function isRetryableBundlerError(error: unknown): boolean {
  const code = (error as { code?: string | number })?.code
  const cause = (error as { cause?: { code?: string | number } })?.cause
  const message = (error as Error | undefined)?.message?.toLowerCase() ?? ""

  const retryableCodes = [
    "ECONNRESET",
    "ECONNREFUSED",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ETIMEDOUT",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_SOCKET",
    "NETWORK_ERROR",
    "ERR_NETWORK",
    "ERR_CONNECTION_REFUSED",
  ]

  if (typeof code === "string" && retryableCodes.includes(code)) return true
  if (typeof cause?.code === "string" && retryableCodes.includes(cause.code)) return true

  return [
    "fetch failed",
    "connect",
    "connection",
    "timeout",
    "timed out",
    "network",
    "econnrefused",
    "econnreset",
    "enotfound",
  ].some((needle) => message.includes(needle))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
