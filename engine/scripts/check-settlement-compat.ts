import { createPublicClient, http, keccak256, encodeAbiParameters } from 'viem'
import { baseSepolia } from 'viem/chains'
import { ADDRESSES, CHAIN_CONFIG, EIP712_DOMAIN } from '../src/lib/addresses'

const CURRENT_SETTLEMENT_TYPE =
  'AuctionSettlementPacket(bytes32 auctionId,bytes32 manifestHash,bytes32 finalLogHash,bytes32 replayContentHash,uint256 winnerAgentId,address winnerWallet,uint256 winningBidAmount,uint64 closeTimestamp)'

const LEGACY_SETTLEMENT_TYPE =
  'AuctionSettlementPacket(bytes32 auctionId,bytes32 manifestHash,bytes32 finalLogHash,uint256 winnerAgentId,address winnerWallet,uint256 winningBidAmount,uint64 closeTimestamp)'

const abi = [
  { name: 'DOMAIN_SEPARATOR', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] },
  { name: 'SETTLEMENT_TYPEHASH', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] },
] as const

function computeDomainSeparator(): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'address' },
      ],
      [
        keccak256(new TextEncoder().encode('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
        keccak256(new TextEncoder().encode(EIP712_DOMAIN.name)),
        keccak256(new TextEncoder().encode(EIP712_DOMAIN.version)),
        BigInt(EIP712_DOMAIN.chainId),
        EIP712_DOMAIN.verifyingContract,
      ],
    ),
  )
}

async function main() {
  const registryAddress =
    (process.env.AUCTION_REGISTRY_ADDRESS as `0x${string}` | undefined) ??
    ADDRESSES.auctionRegistry
  const rpcUrl = process.env.BASE_SEPOLIA_RPC ?? CHAIN_CONFIG.rpcUrl

  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  })

  const [onchainDomainSeparator, onchainTypehash] = await Promise.all([
    client.readContract({
      address: registryAddress,
      abi,
      functionName: 'DOMAIN_SEPARATOR',
    }),
    client.readContract({
      address: registryAddress,
      abi,
      functionName: 'SETTLEMENT_TYPEHASH',
    }),
  ])

  const currentTypehash = keccak256(new TextEncoder().encode(CURRENT_SETTLEMENT_TYPE))
  const legacyTypehash = keccak256(new TextEncoder().encode(LEGACY_SETTLEMENT_TYPE))
  const expectedDomainSeparator = computeDomainSeparator()

  const packetMode =
    onchainTypehash === currentTypehash
      ? 'current'
      : onchainTypehash === legacyTypehash
        ? 'legacy'
        : 'unknown'

  const report = {
    registryAddress,
    rpcUrl,
    packetMode,
    compatible: packetMode === 'current' && onchainDomainSeparator === expectedDomainSeparator,
    domainSeparatorMatches: onchainDomainSeparator === expectedDomainSeparator,
    onchainDomainSeparator,
    expectedDomainSeparator,
    onchainTypehash,
    currentTypehash,
    legacyTypehash,
  }

  console.log(JSON.stringify(report, null, 2))

  if (!report.compatible) {
    process.exitCode = 1
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
