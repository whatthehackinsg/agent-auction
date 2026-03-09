/**
 * agent-userop-demo.ts
 *
 * End-to-end EIP-4337 UserOp demo using our AgentAccount + AgentPaymaster
 * through Pimlico bundler on Base Sepolia.
 *
 * Prerequisites (run once via cast — see docs):
 *   1. Agent registered in IdentityRegistry
 *   2. AgentPaymaster.setEscrow(v4)
 *   3. AgentPaymaster.registerAgent(agentAccountAddress, agentId)
 *   4. MockUSDC minted to AgentAccount
 *
 * Usage:
 *   set -a && source .env && set +a && npx tsx scripts/agent-userop-demo.ts
 */

import {
  createPublicClient,
  http,
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem"
import { baseSepolia } from "viem/chains"
import { privateKeyToAccount } from "viem/accounts"
import {
  entryPoint07Address,
  getUserOperationHash,
  toSmartAccount,
  type SmartAccount,
  type SmartAccountImplementation,
} from "viem/account-abstraction"
import { createSmartAccountClient } from "permissionless"
import { createPimlicoClient } from "permissionless/clients/pimlico"

/* ── Constants ──────────────────────────────────────────────── */

const ADDRESSES = {
  entryPoint: entryPoint07Address,
  agentAccountFactory: "0x076d3C6c50b72D78be0C5190c392e6e5Ac7FD8aD" as Address,
  agentPaymaster: "0xd71a4b73737d4E1a9A73662Cf93690AB5A4fE32d" as Address,
  auctionEscrow: "0x5a1af9fDD97162c184496519E40afCf864061329" as Address,
  mockUSDC: "0xfEE786495d165b16dc8e68B6F8281193e041737d" as Address,
} as const

const FACTORY_ABI = [
  {
    name: "createAccount",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "runtimeSigner", type: "address" },
      { name: "salt", type: "uint256" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "getAddress",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "runtimeSigner", type: "address" },
      { name: "salt", type: "uint256" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
] as const

const EXECUTE_ABI = [
  {
    name: "execute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "target", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bytes" }],
  },
] as const

const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const

const SALT = 0n
const BOND_AMOUNT = 1_000_000n // 1 USDC (6 decimals)
const TIMEOUT_MS = 30_000

/* ── Env ────────────────────────────────────────────────────── */

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v?.trim()) throw new Error(`${name} is required`)
  return v.trim()
}

const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org"
const privateKey = requireEnv("PRIVATE_KEY") as Hex
const bundlerUrl = requireEnv("PIMLICO_BUNDLER_URL")

/* ── Clients ────────────────────────────────────────────────── */

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(rpcUrl),
})

const owner = privateKeyToAccount(privateKey)

/* ── Custom AgentAccount adapter ────────────────────────────── */

async function createAgentAccount(): Promise<SmartAccount<SmartAccountImplementation>> {
  const accountAddress = (await publicClient.readContract({
    address: ADDRESSES.agentAccountFactory,
    abi: FACTORY_ABI,
    functionName: "getAddress",
    args: [owner.address, SALT],
  })) as Address

  console.log("AgentAccount address:", accountAddress)

  const account = await toSmartAccount({
    client: publicClient,
    entryPoint: {
      address: ADDRESSES.entryPoint,
      version: "0.7",
      abi: undefined as any,
    },
    getAddress: async () => accountAddress,
    encodeCalls: async (calls) => {
      if (calls.length !== 1) throw new Error("Batch not supported in this demo")
      const { to, value, data } = calls[0]
      return encodeFunctionData({
        abi: EXECUTE_ABI,
        functionName: "execute",
        args: [to, value ?? 0n, data ?? "0x"],
      })
    },
    // Factory args for lazy deployment (initCode)
    getFactoryArgs: async () => {
      const code = await publicClient.getCode({ address: accountAddress })
      if (code && code !== "0x") return { factory: undefined, factoryData: undefined }
      return {
        factory: ADDRESSES.agentAccountFactory,
        factoryData: encodeFunctionData({
          abi: FACTORY_ABI,
          functionName: "createAccount",
          args: [owner.address, SALT],
        }),
      }
    },
    // Stub signature for gas estimation
    getStubSignature: async () =>
      "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c" as Hex,
    // sign() is used by toSmartAccount internally for ERC-6492 wrapping
    sign: async ({ hash }) => {
      return owner.signMessage({ message: { raw: hash } })
    },
    signMessage: async ({ message }) => {
      return owner.signMessage({ message })
    },
    signTypedData: async (typedData) => {
      return owner.signTypedData(typedData as any)
    },
  })

  // Patch signUserOperation — viem's sendUserOperation (line 140) calls
  // account.signUserOperation(), which toSmartAccount does NOT create.
  // We follow the same pattern as permissionless's toSimpleSmartAccount.
  const patched = account as any
  patched.signUserOperation = async (parameters: any) => {
    const { chainId = baseSepolia.id, ...userOperation } = parameters
    return owner.signMessage({
      message: {
        raw: getUserOperationHash({
          userOperation: {
            ...userOperation,
            sender: userOperation.sender ?? accountAddress,
            signature: "0x",
          },
          entryPointAddress: ADDRESSES.entryPoint,
          entryPointVersion: "0.7",
          chainId,
        }),
      },
    })
  }

  return patched as SmartAccount<SmartAccountImplementation>
}

/* ── Main ───────────────────────────────────────────────────── */

async function main() {
  console.log("\n=== AgentAccount + AgentPaymaster UserOp Demo ===")
  console.log("EntryPoint:", ADDRESSES.entryPoint)
  console.log("Bundler:", bundlerUrl.replace(/apikey=[^&]+/, "apikey=***"))
  console.log("Owner (runtime signer):", owner.address)

  // 1. Create custom SmartAccount
  const account = await createAgentAccount()
  console.log("Account type: AgentAccount (custom EIP-4337)")

  // 2. Create Pimlico bundler client for gas price estimation
  const pimlicoBundler = createPimlicoClient({
    chain: baseSepolia,
    transport: http(bundlerUrl, { timeout: TIMEOUT_MS }),
    entryPoint: {
      address: ADDRESSES.entryPoint,
      version: "0.7",
    },
  })

  // 3. Create smart account client with our AgentPaymaster
  const smartClient = createSmartAccountClient({
    account,
    chain: baseSepolia,
    bundlerTransport: http(bundlerUrl, { timeout: TIMEOUT_MS }),
    userOperation: {
      estimateFeesPerGas: async () => {
        const prices = await pimlicoBundler.getUserOperationGasPrice()
        return prices.fast
      },
    },
    // Our custom AgentPaymaster — not Pimlico's paymaster
    paymaster: {
      getPaymasterData: async () => ({
        paymaster: ADDRESSES.agentPaymaster,
        paymasterData: "0x" as Hex,
        paymasterVerificationGasLimit: 150_000n,
        paymasterPostOpGasLimit: 50_000n,
      }),
      getPaymasterStubData: async () => ({
        paymaster: ADDRESSES.agentPaymaster,
        paymasterData: "0x" as Hex,
        paymasterVerificationGasLimit: 150_000n,
        paymasterPostOpGasLimit: 50_000n,
      }),
    },
  })

  // 4. Build the UserOp: USDC.transfer(escrow, 1 USDC) — bond deposit path
  const transferData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [ADDRESSES.auctionEscrow, BOND_AMOUNT],
  })

  console.log("\nSubmitting UserOp: USDC.transfer(escrow, 1 USDC)")
  console.log("  target:", ADDRESSES.mockUSDC, "(MockUSDC)")
  console.log("  to:", ADDRESSES.auctionEscrow, "(AuctionEscrow v2)")
  console.log("  amount:", BOND_AMOUNT.toString(), "(1 USDC)")
  console.log("  paymaster:", ADDRESSES.agentPaymaster, "(AgentPaymaster)")

  const userOpHash = await smartClient.sendUserOperation({
    calls: [
      {
        to: ADDRESSES.mockUSDC,
        value: 0n,
        data: transferData,
      },
    ],
  })

  console.log("\nUserOperation hash:", userOpHash)
  console.log("Waiting for on-chain inclusion...")

  const receipt = await smartClient.waitForUserOperationReceipt({
    hash: userOpHash,
    timeout: 60_000,
  })

  console.log("\n=== Result ===")
  console.log("Status:", receipt.success ? "SUCCESS" : "FAILED")
  console.log("Tx hash:", receipt.receipt.transactionHash)
  console.log("Block:", receipt.receipt.blockNumber)
  console.log("Gas used:", receipt.receipt.gasUsed.toString())
  console.log("\nBasescan: https://sepolia.basescan.org/tx/" + receipt.receipt.transactionHash)
}

main().catch((err) => {
  console.error("\nFailed:", err instanceof Error ? err.message : String(err))
  if (err?.details) console.error("Details:", err.details)
  process.exit(1)
})
