// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {AuctionRegistry} from "../src/AuctionRegistry.sol";
import {AuctionEscrow} from "../src/AuctionEscrow.sol";
import {AgentPrivacyRegistry} from "../src/AgentPrivacyRegistry.sol";
import {MockKeystoneForwarder} from "../src/MockKeystoneForwarder.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockIdentityRegistry} from "../src/mocks/MockIdentityRegistry.sol";
import {HelperConfig} from "./HelperConfig.s.sol";

/// @title Deploy — Full deployment script for Agent Auction contracts
/// @notice Deploys core contracts + testnet mocks in correct order, then wires them.
///
/// Usage:
///   # Local (anvil):
///   forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
///
///   # Base Sepolia:
///   forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify
///
/// Environment variables:
///   DEPLOYER_PRIVATE_KEY  — Required for Base Sepolia
///   SEQUENCER_ADDRESS     — Optional, defaults to deployer
contract Deploy is Script {
    /* ── Deployed addresses (populated during run) ───────────────── */

    // Mocks (testnet only)
    MockUSDC public mockUsdc;
    MockIdentityRegistry public mockIdentityRegistry;
    MockKeystoneForwarder public mockForwarder;

    // Core contracts
    AuctionRegistry public registry;
    AuctionEscrow public escrow;
    AgentPrivacyRegistry public privacyRegistry;

    // Config
    HelperConfig public helperConfig;

    /* ── Main entry ─────────────────────────────────────────────── */

    function run() external {
        helperConfig = new HelperConfig();
        HelperConfig.NetworkConfig memory config = helperConfig.getActiveConfig();

        vm.startBroadcast(config.deployerKey);

        // ── Step 1: Deploy mocks if needed ──────────────────────
        address usdc = config.usdc;
        address identityRegistry = config.identityRegistry;
        address keystoneForwarder = config.keystoneForwarder;

        if (usdc == address(0)) {
            mockUsdc = new MockUSDC();
            usdc = address(mockUsdc);
            console2.log("MockUSDC deployed:", usdc);
        }

        if (identityRegistry == address(0)) {
            mockIdentityRegistry = new MockIdentityRegistry();
            identityRegistry = address(mockIdentityRegistry);
            console2.log("MockIdentityRegistry deployed:", identityRegistry);
        }

        if (keystoneForwarder == address(0)) {
            // Default CRE workflow params for testnet
            bytes32 workflowId = keccak256("agent-auction-settlement-v1");
            bytes10 workflowName = bytes10("auctsettle");
            address workflowOwner = vm.addr(config.deployerKey);

            mockForwarder = new MockKeystoneForwarder(workflowId, workflowName, workflowOwner);
            keystoneForwarder = address(mockForwarder);
            console2.log("MockKeystoneForwarder deployed:", keystoneForwarder);
        }

        // ── Step 2: Deploy AuctionRegistry ──────────────────────
        registry = new AuctionRegistry(config.sequencer);
        console2.log("AuctionRegistry deployed:", address(registry));
        console2.log("  Sequencer:", config.sequencer);

        // ── Step 3: Deploy AuctionEscrow ────────────────────────
        escrow = new AuctionEscrow(IERC20(usdc), keystoneForwarder);
        console2.log("AuctionEscrow deployed:", address(escrow));

        // ── Step 4: Deploy AgentPrivacyRegistry ─────────────────
        privacyRegistry = new AgentPrivacyRegistry(identityRegistry);
        console2.log("AgentPrivacyRegistry deployed:", address(privacyRegistry));

        // ── Step 5: Cross-bind contracts ────────────────────────

        // Registry ← Escrow (one-time, immutable after set)
        registry.setEscrow(address(escrow));
        console2.log("AuctionRegistry.setEscrow:", address(escrow));

        // Escrow ← Registry
        escrow.setRegistry(address(registry));
        console2.log("AuctionEscrow.setRegistry:", address(registry));

        // Escrow ← IdentityRegistry (for withdraw auth)
        escrow.setIdentityRegistry(identityRegistry);
        console2.log("AuctionEscrow.setIdentityRegistry:", identityRegistry);

        // ── Step 6: Configure CRE workflow params on Escrow ─────
        if (address(mockForwarder) != address(0)) {
            escrow.setExpectedWorkflowId(mockForwarder.workflowId());
            escrow.setExpectedWorkflowName(mockForwarder.workflowName());
            escrow.setExpectedAuthor(mockForwarder.workflowOwner());
            console2.log("AuctionEscrow CRE config set (mock workflow params)");
        }
        // NOTE: Real KeystoneForwarder deployments must call configureCRE(workflowId, workflowName, workflowOwner)
        // after CRE workflow registration/activation. onReport() is fail-closed until configured.

        vm.stopBroadcast();

        // ── Step 7: Print deployment summary ───────────────────
        _printSummary(config, usdc, identityRegistry, keystoneForwarder);
    }

    /* ── Helpers ─────────────────────────────────────────────────── */

    function _printSummary(
        HelperConfig.NetworkConfig memory config,
        address usdc,
        address identityRegistry,
        address keystoneForwarder
    ) internal view {
        console2.log("");
        console2.log("========================================");
        console2.log("  DEPLOYMENT SUMMARY");
        console2.log("========================================");
        console2.log("Chain ID:", block.chainid);
        console2.log("");
        console2.log("-- External Dependencies --");
        console2.log("USDC:                ", usdc);
        console2.log("IdentityRegistry:    ", identityRegistry);
        console2.log("KeystoneForwarder:   ", keystoneForwarder);
        console2.log("Sequencer:           ", config.sequencer);
        console2.log("");
        console2.log("-- Core Contracts --");
        console2.log("AuctionRegistry:     ", address(registry));
        console2.log("AuctionEscrow:       ", address(escrow));
        console2.log("AgentPrivacyRegistry:", address(privacyRegistry));
        console2.log("");
        console2.log("-- Wiring --");
        console2.log("Registry.escrow =    ", address(escrow));
        console2.log("Escrow.registry =    ", address(registry));
        console2.log("Escrow.idReg =       ", identityRegistry);
        console2.log("========================================");
    }
}
