// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {AuctionRegistry} from "../src/AuctionRegistry.sol";
import {AuctionEscrow} from "../src/AuctionEscrow.sol";
import {NftEscrow} from "../src/NftEscrow.sol";

/// @title RedeploySettlementStack
/// @notice Deploy a fresh AuctionRegistry/AuctionEscrow pair that matches the current
///         8-field settlement packet, reusing the existing token, identity registry,
///         and KeystoneForwarder on Base Sepolia.
///
/// Required environment variables:
/// - DEPLOYER_PRIVATE_KEY
///
/// Optional environment variables:
/// - SEQUENCER_ADDRESS
/// - USDC_ADDRESS
/// - IDENTITY_REGISTRY_ADDRESS
/// - KEYSTONE_FORWARDER_ADDRESS
/// - DEPLOY_NFT_ESCROW           (default: true)
contract RedeploySettlementStack is Script {
    address constant DEFAULT_USDC = 0xfEE786495d165b16dc8e68B6F8281193e041737d;
    address constant DEFAULT_IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant DEFAULT_KEYSTONE_FORWARDER = 0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address sequencer = vm.envOr("SEQUENCER_ADDRESS", vm.addr(deployerKey));
        address usdc = vm.envOr("USDC_ADDRESS", DEFAULT_USDC);
        address identityRegistry = vm.envOr("IDENTITY_REGISTRY_ADDRESS", DEFAULT_IDENTITY_REGISTRY);
        address keystoneForwarder = vm.envOr("KEYSTONE_FORWARDER_ADDRESS", DEFAULT_KEYSTONE_FORWARDER);
        bool deployNftEscrow = vm.envOr("DEPLOY_NFT_ESCROW", true);

        vm.startBroadcast(deployerKey);

        AuctionRegistry registry = new AuctionRegistry(sequencer);
        AuctionEscrow escrow = new AuctionEscrow(IERC20(usdc), keystoneForwarder);

        registry.setEscrow(address(escrow));
        escrow.setRegistry(address(registry));
        escrow.setIdentityRegistry(identityRegistry);

        address nftEscrowAddress = address(0);
        if (deployNftEscrow) {
            NftEscrow nftEscrow = new NftEscrow(address(registry));
            nftEscrowAddress = address(nftEscrow);
        }

        vm.stopBroadcast();

        console2.log("========================================");
        console2.log("  REDEPLOYED SETTLEMENT STACK");
        console2.log("========================================");
        console2.log("AuctionRegistry:     ", address(registry));
        console2.log("AuctionEscrow:       ", address(escrow));
        if (deployNftEscrow) {
            console2.log("NftEscrow:           ", nftEscrowAddress);
        } else {
            console2.log("NftEscrow:            skipped");
        }
        console2.log("");
        console2.log("Sequencer:           ", sequencer);
        console2.log("USDC:                ", usdc);
        console2.log("IdentityRegistry:    ", identityRegistry);
        console2.log("KeystoneForwarder:   ", keystoneForwarder);
        console2.log("========================================");
    }
}
