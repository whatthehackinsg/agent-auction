# Contracts

Foundry contracts for the on-chain half of Agent Auction: auction lifecycle, escrow, privacy anchors, and NFT custody.

## Scope

- Solidity `0.8.24`
- Cancun EVM
- Base Sepolia target (`84532`)
- Foundry workflow (`forge`, `cast`, `anvil`)

## Main Contracts

| Contract | Responsibility |
|---|---|
| `AuctionRegistry.sol` | Auction lifecycle and sequencer-authorized result recording |
| `AuctionEscrow.sol` | USDC bond accounting, refund/withdraw flow, and CRE `onReport()` settlement |
| `AgentPrivacyRegistry.sol` | Per-agent Poseidon root and capability commitment anchor for ZK flows |
| `NftEscrow.sol` | ERC-721 deposit, claim, and reclaim flow for auction items |
| `MockKeystoneForwarder.sol` | Local/testing forwarder for CRE-style settlement paths |
| `deprecated/AgentAccount*.sol` | Archived EIP-4337 contracts kept for historical reference only |

## Key Invariants

- Settlement must enter `AuctionEscrow` through `onReport()`.
- Escrow solvency must hold: USDC balance covers `totalBonded + totalWithdrawable + platformBalance`.
- Bond recording is separate from token transfer: the live path is `USDC transfer -> recordBond`.
- The privacy registry is per-agent in the current live deployment and exposes `getAgentPoseidonRoot()` and `getAgentCapabilityCommitment()`.
- Archived EIP-4337 contracts in `src/deprecated/` are not the mainline production path anymore.

## Commands

Run from `contracts/`:

```bash
forge build
forge test
forge test -vvv
forge test --match-contract AuctionEscrow
forge fmt
forge snapshot
```

## Base Sepolia Addresses

| Contract / Dependency | Address |
|---|---|
| AuctionRegistry | `0xFEc7a05707AF85C6b248314E20FF8EfF590c3639` |
| AuctionEscrow | `0x20944f46AB83F7eA40923D7543AF742Da829743c` |
| AgentPrivacyRegistry | `0x5b4f09A5D5188dCe1b1ba0caeDBcEb52CaCD1902` |
| NftEscrow | `0xa05C5AF6a07D5e1abDd2c93EFdcb95D306766a94` |
| KeystoneForwarder | `0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5` |
| ERC-8004 Identity Registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| MockUSDC | `0xfEE786495d165b16dc8e68B6F8281193e041737d` |

## Commission Model

`AuctionEscrow` includes a configurable platform commission:

- `commissionBps` is globally configurable and capped at `MAX_COMMISSION_BPS` (`1000`, or 10%)
- commission is deducted during settlement before winner crediting
- accumulated commission is tracked in `platformBalance`
- the platform wallet can withdraw commission with `withdrawPlatformBalance()`

## Pointers

- Contract docs: `contracts/docs/`
- Deployment scripts: `contracts/script/Deploy.s.sol`, `contracts/script/HelperConfig.s.sol`
- Source of truth: `docs/full_contract_arch(amended).md`
