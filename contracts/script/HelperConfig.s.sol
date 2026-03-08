// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";

/// @title HelperConfig — Per-chain deployment configuration
/// @notice Returns pre-existing contract addresses for known chains,
///         or signals that mocks need to be deployed (local/unknown chains).
contract HelperConfig is Script {
    /* ── Types ──────────────────────────────────────────────────── */

    struct NetworkConfig {
        address usdc; // USDC token
        address identityRegistry; // ERC-8004 registry
        address keystoneForwarder; // Chainlink KeystoneForwarder
        address sequencer; // Sequencer EOA (signs EIP-712)
        uint256 deployerKey; // Private key for deployment
    }

    /* ── Constants ──────────────────────────────────────────────── */

    /// @dev Base Sepolia chain ID
    uint256 public constant BASE_SEPOLIA_CHAIN_ID = 84_532;
    address public constant BASE_SEPOLIA_MOCK_USDC = 0xfEE786495d165b16dc8e68B6F8281193e041737d;
    address public constant BASE_SEPOLIA_IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address public constant BASE_SEPOLIA_KEYSTONE_FORWARDER = 0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5;

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
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address sequencer = vm.envOr("SEQUENCER_ADDRESS", vm.addr(deployerKey));
        address usdc = vm.envOr("USDC_ADDRESS", BASE_SEPOLIA_MOCK_USDC);
        address identityRegistry = vm.envOr("IDENTITY_REGISTRY_ADDRESS", BASE_SEPOLIA_IDENTITY_REGISTRY);
        address keystoneForwarder = vm.envOr("KEYSTONE_FORWARDER_ADDRESS", BASE_SEPOLIA_KEYSTONE_FORWARDER);

        return NetworkConfig({
            usdc: usdc,
            identityRegistry: identityRegistry,
            keystoneForwarder: keystoneForwarder,
            sequencer: sequencer,
            deployerKey: deployerKey
        });
    }

    function _getAnvilConfig() internal pure returns (NetworkConfig memory) {
        // Anvil: everything gets mocked
        return NetworkConfig({
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
