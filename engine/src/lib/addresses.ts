/** Deployed contract addresses on Base Sepolia (chainId 84532) */
export const ADDRESSES = {
  mockUSDC: '0xfEE786495d165b16dc8e68B6F8281193e041737d' as `0x${string}`,
  identityRegistry: '0x8004A818BFB912233c491871b3d84c89A494BD9e' as `0x${string}`,
  auctionRegistry: '0xAe416531962709cb26886851888aEc80ef29bB45' as `0x${string}`,
  auctionEscrow: '0x5a1af9fDD97162c184496519E40afCf864061329' as `0x${string}`,
  agentPrivacyRegistry: '0x5b4f09A5D5188dCe1b1ba0caeDBcEb52CaCD1902' as `0x${string}`,
  nftEscrow: '0x298C51ca785f2016d42550C6FF052D40f7061519' as `0x${string}`,
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
