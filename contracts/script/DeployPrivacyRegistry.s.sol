// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentPrivacyRegistry} from "../src/AgentPrivacyRegistry.sol";

/// @title DeployPrivacyRegistry — Standalone deployment for AgentPrivacyRegistry
/// @notice No constructor args, no cross-binding needed.
///
/// Usage:
///   forge script script/DeployPrivacyRegistry.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify \
///     --etherscan-api-key $BASESCAN_API_KEY
contract DeployPrivacyRegistry is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        AgentPrivacyRegistry privacyRegistry = new AgentPrivacyRegistry();
        console2.log("AgentPrivacyRegistry deployed:", address(privacyRegistry));

        vm.stopBroadcast();
    }
}
