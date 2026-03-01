/** Deployed contract addresses on Base Sepolia (chainId 84532) */
export const ADDRESSES = {
  mockUSDC: '0xfEE786495d165b16dc8e68B6F8281193e041737d' as `0x${string}`,
  auctionRegistry: '0xFEc7a05707AF85C6b248314E20FF8EfF590c3639' as `0x${string}`,
  auctionEscrow: '0x20944f46AB83F7eA40923D7543AF742Da829743c' as `0x${string}`,
  agentPrivacyRegistry: '0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff' as `0x${string}`,
  keystoneForwarder: '0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5' as `0x${string}`,
  sequencer: '0x633ec0e633AA4d8BbCCEa280331A935747416737' as `0x${string}`,
} as const

export const CHAIN_CONFIG = {
  chainId: 84532,
  rpcUrl: 'https://sepolia.base.org',
  usdcDecimals: 6,
} as const

/** EIP-712 domain for AuctionRegistry signature verification */
export const EIP712_DOMAIN = {
  name: 'AgentAuction' as const,
  version: '1' as const,
  chainId: 84532,
  verifyingContract: ADDRESSES.auctionRegistry,
} as const
