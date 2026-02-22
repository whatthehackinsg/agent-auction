// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";

/// @title HelperConfig — Per-chain deployment configuration
/// @notice Returns pre-existing contract addresses for known chains,
///         or signals that mocks need to be deployed (local/unknown chains).
contract HelperConfig is Script {
    /* ── Types ──────────────────────────────────────────────────── */

    struct NetworkConfig {
        address entryPoint; // EIP-4337 EntryPoint v0.7
        address usdc; // USDC token
        address identityRegistry; // ERC-8004 registry
        address keystoneForwarder; // Chainlink KeystoneForwarder
        address sequencer; // Sequencer EOA (signs EIP-712)
        uint256 deployerKey; // Private key for deployment
    }

    /* ── Constants ──────────────────────────────────────────────── */

    /// @dev EIP-4337 EntryPoint v0.7 canonical address (same on all EVM chains)
    address public constant ENTRY_POINT_V07 = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    /// @dev Base Sepolia chain ID
    uint256 public constant BASE_SEPOLIA_CHAIN_ID = 84_532;

    /// @dev Anvil default private key (account[0])
    uint256 public constant ANVIL_DEFAULT_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    /* ── State ──────────────────────────────────────────────────── */

    NetworkConfig public activeConfig;
    bool public needsMocks;

    /* ── Constructor ─────────────────────────────────────────────── */

    constructor() {
        if (block.chainid == BASE_SEPOLIA_CHAIN_ID) {
            activeConfig = _getBaseSepoliaConfig();
            needsMocks = false;
        } else {
            // Local (anvil) or unknown chain — deploy mocks
            activeConfig = _getAnvilConfig();
            needsMocks = true;
        }
    }

    /* ── Chain configs ──────────────────────────────────────────── */

    function _getBaseSepoliaConfig() internal view returns (NetworkConfig memory) {
        // For Base Sepolia we still deploy our own mocks for USDC, IdentityRegistry,
        // and KeystoneForwarder since the real ones may not be available yet.
        // Update these addresses once real contracts are deployed.
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address sequencer = vm.envOr("SEQUENCER_ADDRESS", vm.addr(deployerKey));

        return NetworkConfig({
            entryPoint: ENTRY_POINT_V07,
            usdc: address(0), // Will deploy MockUSDC
            identityRegistry: address(0), // Will deploy MockIdentityRegistry
            keystoneForwarder: address(0), // Will deploy MockKeystoneForwarder
            sequencer: sequencer,
            deployerKey: deployerKey
        });
    }

    function _getAnvilConfig() internal pure returns (NetworkConfig memory) {
        // Anvil: everything gets mocked, including EntryPoint
        // Note: EntryPoint may already be deployed at canonical address on anvil
        return NetworkConfig({
            entryPoint: ENTRY_POINT_V07,
            usdc: address(0), // Will deploy MockUSDC
            identityRegistry: address(0), // Will deploy MockIdentityRegistry
            keystoneForwarder: address(0), // Will deploy MockKeystoneForwarder
            sequencer: vm.addr(ANVIL_DEFAULT_KEY), // Anvil account[0]
            deployerKey: ANVIL_DEFAULT_KEY
        });
    }

    /* ── Helpers ─────────────────────────────────────────────────── */

    function getActiveConfig() external view returns (NetworkConfig memory) {
        return activeConfig;
    }

    /// @notice Update config after mock deployment
    function setUsdc(address usdc_) external {
        activeConfig.usdc = usdc_;
    }

    function setIdentityRegistry(address registry_) external {
        activeConfig.identityRegistry = registry_;
    }

    function setKeystoneForwarder(address forwarder_) external {
        activeConfig.keystoneForwarder = forwarder_;
    }
}
