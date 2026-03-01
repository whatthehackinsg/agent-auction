# contracts/

Solidity smart contracts for on-chain auction identity, bonding, escrow, and CRE-mediated settlement.

- **Solidity**: 0.8.24 / Cancun EVM / Optimizer 200 runs
- **Framework**: Foundry (forge, cast, anvil)
- **Target chain**: Base Sepolia (chainId `84532`)
- **Tests**: 144 total (`forge test`)

## Contracts

| Contract | Role |
|---|---|
| `AuctionRegistry.sol` | Auction lifecycle state machine: OPEN -> CLOSED -> SETTLED/CANCELLED |
| `AuctionEscrow.sol` | USDC bonds, commission system, CRE settlement via `IReceiver.onReport()` |
| `AgentPrivacyRegistry.sol` | ZK membership Merkle root + nullifier tracking |
| `NftEscrow.sol` | ERC-721 custody for auction items (deposit/claim/reclaim) |
| `MockKeystoneForwarder.sol` | Test helper simulating Chainlink KeystoneForwarder |
| `deprecated/AgentAccount.sol` | (Archived) EIP-4337 smart wallet |
| `deprecated/AgentAccountFactory.sol` | (Archived) CREATE2 deployment factory |
| `deprecated/AgentPaymaster.sol` | (Archived) Gas sponsorship paymaster |

### AuctionEscrow Commission System

The escrow contract includes a platform commission mechanism for monetization:

- **`commissionBps`**: Global commission rate in basis points (admin-settable, starts at 0)
- **`MAX_COMMISSION_BPS`**: Hard cap at 1000 (10%)
- **`platformBalance`**: Accumulated commission available for withdrawal
- **`platformWallet`**: Destination address for commission withdrawals
- Commission is deducted from the settlement amount in `_processReport()` before crediting the winner's withdrawable balance
- Admin functions: `setCommissionBps(uint16)`, `setPlatformWallet(address)`, `withdrawPlatformBalance()`
- Events: `CommissionBpsUpdated`, `CommissionCollected`, `PlatformWithdrawal`
- Solvency invariant: `USDC.balanceOf(escrow) >= totalBonded + totalWithdrawable + platformBalance`

## Usage

Run from `contracts/`:

```bash
# Build
forge build

# Test (all 144)
forge test

# Test a specific suite
forge test --match-contract AuctionEscrow

# Test a single test
forge test --match-test testDeposit

# Verbose with stack traces
forge test -vvv

# Format
forge fmt

# Gas snapshots
forge snapshot
```

## Deployed Addresses (Base Sepolia)

| Contract | Address |
|---|---|
| AuctionRegistry (v2) | `0xFEc7a05707AF85C6b248314E20FF8EfF590c3639` |
| AuctionEscrow (v2) | `0x20944f46AB83F7eA40923D7543AF742Da829743c` |
| AgentPrivacyRegistry | `0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff` |
| NftEscrow | `0xa05C5AF6a07D5e1abDd2c93EFdcb95D306766a94` |
| KeystoneForwarder (real) | `0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5` |
| ERC-8004 Identity Registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| MockUSDC | `0xfEE786495d165b16dc8e68B6F8281193e041737d` |

## Documentation

- Contract API docs: `contracts/docs/`
- Architecture source of truth: `docs/full_contract_arch(amended).md`
- Developer guide: `docs/developer-guide.md`
- Deployment scripts: `script/Deploy.s.sol`, `script/HelperConfig.s.sol`
