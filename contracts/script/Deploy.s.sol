// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IEntryPoint} from "@account-abstraction/interfaces/IEntryPoint.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {AgentAccountFactory} from "../src/AgentAccountFactory.sol";
import {AgentPaymaster, IERC8004Registry} from "../src/AgentPaymaster.sol";
import {AuctionRegistry} from "../src/AuctionRegistry.sol";
import {AuctionEscrow} from "../src/AuctionEscrow.sol";
import {MockKeystoneForwarder} from "../src/MockKeystoneForwarder.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockIdentityRegistry} from "../src/mocks/MockIdentityRegistry.sol";
import {MockEntryPoint} from "../src/mocks/MockEntryPoint.sol";
import {HelperConfig} from "./HelperConfig.s.sol";

/// @title Deploy — Full deployment script for Agent Auction contracts
/// @notice Deploys all 6 contracts + testnet mocks in correct order, then wires them.
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
///   PAYMASTER_STAKE_ETH   — Optional, ETH to stake on paymaster (default: 0.01)
///   PAYMASTER_DEPOSIT_ETH — Optional, ETH to deposit on paymaster (default: 0.05)
contract Deploy is Script {
    /* ── Deployed addresses (populated during run) ───────────────── */

    // Mocks (testnet only)
    MockUSDC public mockUsdc;
    MockIdentityRegistry public mockIdentityRegistry;
    MockKeystoneForwarder public mockForwarder;

    // Core contracts
    AgentAccountFactory public factory;
    AgentPaymaster public paymaster;
    AuctionRegistry public registry;
    AuctionEscrow public escrow;

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

        // ── Step 2: Resolve EntryPoint ──────────────────────────
        address entryPointAddr = config.entryPoint;
        if (entryPointAddr.code.length == 0) {
            // No EntryPoint at canonical address — deploy MockEntryPoint
            MockEntryPoint mockEP = new MockEntryPoint();
            entryPointAddr = address(mockEP);
            console2.log("MockEntryPoint deployed:", entryPointAddr);
        } else {
            console2.log("EntryPoint verified at:", entryPointAddr);
        }
        IEntryPoint entryPoint = IEntryPoint(entryPointAddr);

        // ── Step 3: Deploy AgentAccountFactory ──────────────────
        //   (internally deploys AgentAccount implementation)
        factory = new AgentAccountFactory(entryPoint);
        console2.log("AgentAccountFactory deployed:", address(factory));
        console2.log("  AgentAccount impl:", address(factory.ACCOUNT_IMPLEMENTATION()));

        // ── Step 4: Deploy AgentPaymaster ────────────────────────
        paymaster = new AgentPaymaster(entryPoint, IERC20(usdc), IERC8004Registry(identityRegistry));
        console2.log("AgentPaymaster deployed:", address(paymaster));

        // ── Step 5: Deploy AuctionRegistry ──────────────────────
        registry = new AuctionRegistry(config.sequencer);
        console2.log("AuctionRegistry deployed:", address(registry));
        console2.log("  Sequencer:", config.sequencer);

        // ── Step 6: Deploy AuctionEscrow ────────────────────────
        escrow = new AuctionEscrow(IERC20(usdc), keystoneForwarder);
        console2.log("AuctionEscrow deployed:", address(escrow));

        // ── Step 7: Cross-bind contracts ────────────────────────

        // Registry ← Escrow (one-time, immutable after set)
        registry.setEscrow(address(escrow));
        console2.log("AuctionRegistry.setEscrow:", address(escrow));

        // Escrow ← Registry
        escrow.setRegistry(address(registry));
        console2.log("AuctionEscrow.setRegistry:", address(registry));

        // Paymaster ← Escrow (for bond-check path)
        paymaster.setEscrow(address(escrow));
        console2.log("AgentPaymaster.setEscrow:", address(escrow));

        // Escrow ← IdentityRegistry (for withdraw auth)
        escrow.setIdentityRegistry(identityRegistry);
        console2.log("AuctionEscrow.setIdentityRegistry:", identityRegistry);

        // ── Step 8: Configure CRE workflow params on Escrow ─────
        if (address(mockForwarder) != address(0)) {
            escrow.setExpectedWorkflowId(mockForwarder.workflowId());
            escrow.setExpectedWorkflowName(mockForwarder.workflowName());
            escrow.setExpectedAuthor(mockForwarder.workflowOwner());
            console2.log("AuctionEscrow CRE config set (mock workflow params)");
        }

        // ── Step 8b: Paymaster target allowlist ────────────────
        paymaster.setAllowedTarget(address(escrow), true);
        paymaster.setAllowedTarget(address(registry), true);
        console2.log("AgentPaymaster: allowed targets set (escrow + registry)");

        // ── Step 9: Fund Paymaster (stake + deposit) ────────────
        uint256 stakeAmount = vm.envOr("PAYMASTER_STAKE_ETH", uint256(0.01 ether));
        uint256 depositAmount = vm.envOr("PAYMASTER_DEPOSIT_ETH", uint256(0.05 ether));

        if (stakeAmount > 0 && address(vm.addr(config.deployerKey)).balance >= stakeAmount + depositAmount) {
            paymaster.addStake{value: stakeAmount}(86_400); // 1 day unstake delay
            console2.log("AgentPaymaster staked:", stakeAmount);

            paymaster.deposit{value: depositAmount}();
            console2.log("AgentPaymaster deposited:", depositAmount);
        } else {
            console2.log("SKIP: Paymaster stake/deposit (insufficient ETH or zero config)");
            console2.log("  Run manually:");
            console2.log("  cast send", address(paymaster), "\"addStake(uint32)\" 86400 --value 0.01ether");
            console2.log("  cast send", address(paymaster), "\"deposit()\" --value 0.05ether");
        }

        vm.stopBroadcast();

        // ── Step 10: Print deployment summary ───────────────────
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
        console2.log("EntryPoint:          ", config.entryPoint);
        console2.log("USDC:                ", usdc);
        console2.log("IdentityRegistry:    ", identityRegistry);
        console2.log("KeystoneForwarder:   ", keystoneForwarder);
        console2.log("Sequencer:           ", config.sequencer);
        console2.log("");
        console2.log("-- Core Contracts --");
        console2.log("AgentAccountFactory: ", address(factory));
        console2.log("  (AgentAccount impl:", address(factory.ACCOUNT_IMPLEMENTATION()), ")");
        console2.log("AgentPaymaster:      ", address(paymaster));
        console2.log("AuctionRegistry:     ", address(registry));
        console2.log("AuctionEscrow:       ", address(escrow));
        console2.log("");
        console2.log("-- Wiring --");
        console2.log("Registry.escrow =    ", address(escrow));
        console2.log("Escrow.registry =    ", address(registry));
        console2.log("Paymaster.escrow =   ", address(escrow));
        console2.log("Escrow.idReg =       ", identityRegistry);
        console2.log("========================================");
    }
}
