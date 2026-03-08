// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {NftEscrow} from "../src/NftEscrow.sol";

/// @title DeployNftEscrow — Standalone deployment for NftEscrow
/// @notice Single constructor arg: address(registry).
///
/// Usage:
///   REGISTRY=0xB2FB10e98B2707A4C27434665E3C864ecaea0b7F \
///   forge script script/DeployNftEscrow.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify \
///     --etherscan-api-key $BASESCAN_API_KEY
contract DeployNftEscrow is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address registryAddr = vm.envAddress("REGISTRY");

        vm.startBroadcast(deployerKey);

        NftEscrow nftEscrow = new NftEscrow(registryAddr);
        console2.log("NftEscrow deployed:", address(nftEscrow));
        console2.log("  registry:", registryAddr);

        vm.stopBroadcast();
    }
}
