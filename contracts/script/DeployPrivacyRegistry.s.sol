// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentPrivacyRegistry} from "../src/AgentPrivacyRegistry.sol";

/// @title DeployPrivacyRegistry — Standalone deployment for AgentPrivacyRegistry
/// @notice Requires IDENTITY_REGISTRY env var (ERC-8004 registry address).
///
/// Usage:
///   IDENTITY_REGISTRY=0x8004A818BFB912233c491871b3d84c89A494BD9e \
///   forge script script/DeployPrivacyRegistry.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify \
///     --etherscan-api-key $BASESCAN_API_KEY
contract DeployPrivacyRegistry is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address identityRegistry = vm.envAddress("IDENTITY_REGISTRY");

        vm.startBroadcast(deployerKey);

        AgentPrivacyRegistry privacyRegistry = new AgentPrivacyRegistry(identityRegistry);
        console2.log("AgentPrivacyRegistry deployed:", address(privacyRegistry));
        console2.log("  IdentityRegistry:", identityRegistry);

        vm.stopBroadcast();
    }
}
