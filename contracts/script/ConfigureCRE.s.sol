// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AuctionEscrow} from "../src/AuctionEscrow.sol";

/// @title ConfigureCRE — Configure AuctionEscrow with CRE workflow credentials
/// @notice Call after `cre workflow deploy` to pin workflowId/name/owner on escrow.
///
/// Usage (real deployment — after `cre workflow deploy` returns values):
///   WORKFLOW_ID=0x... WORKFLOW_NAME=0x... WORKFLOW_OWNER=0x... \
///   forge script script/ConfigureCRE.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast
///
/// Usage (mock — for simulate --broadcast testing):
///   USE_MOCK=true forge script script/ConfigureCRE.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast
///
/// Environment variables:
///   DEPLOYER_PRIVATE_KEY — Owner of AuctionEscrow (required)
///   WORKFLOW_ID          — bytes32 from `cre workflow deploy` output
///   WORKFLOW_NAME        — bytes10 workflow name (from CRE registry)
///   WORKFLOW_OWNER       — address that deployed the CRE workflow
///   USE_MOCK             — If "true", use simulator default mock values
contract ConfigureCRE is Script {
    // Default deployed AuctionEscrow on Base Sepolia (override with ESCROW_ADDRESS if needed)
    address constant DEFAULT_ESCROW = 0xb23D3bca2728e407A3b8c8ab63C8Ed6538c4bca2;

    // Simulator mock values (used by `cre workflow simulate --broadcast`)
    bytes32 constant MOCK_WORKFLOW_ID = 0x1111111111111111111111111111111111111111111111111111111111111111;
    bytes10 constant MOCK_WORKFLOW_NAME = 0x65383438303935613439; // simulator-generated
    address constant MOCK_WORKFLOW_OWNER = 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address escrowAddress = vm.envOr("ESCROW_ADDRESS", DEFAULT_ESCROW);
        AuctionEscrow escrow = AuctionEscrow(escrowAddress);

        bool useMock = vm.envOr("USE_MOCK", false);

        bytes32 workflowId;
        bytes10 workflowName;
        address workflowOwner;

        if (useMock) {
            workflowId = MOCK_WORKFLOW_ID;
            workflowName = MOCK_WORKFLOW_NAME;
            workflowOwner = MOCK_WORKFLOW_OWNER;
            console2.log("Using MOCK CRE values (for simulate --broadcast testing)");
        } else {
            workflowId = vm.envBytes32("WORKFLOW_ID");
            workflowName = bytes10(vm.envBytes32("WORKFLOW_NAME"));
            workflowOwner = vm.envAddress("WORKFLOW_OWNER");
        }

        console2.log("AuctionEscrow:", escrowAddress);
        console2.log("workflowId:");
        console2.logBytes32(workflowId);
        console2.log("workflowName:");
        console2.logBytes10(workflowName);
        console2.log("workflowOwner:", workflowOwner);

        // Check current state
        console2.log("");
        console2.log("Current isCREConfigured:", escrow.isCREConfigured());
        console2.log("Current expectedWorkflowId:");
        console2.logBytes32(escrow.expectedWorkflowId());

        vm.startBroadcast(deployerKey);
        escrow.configureCRE(workflowId, workflowName, workflowOwner);
        vm.stopBroadcast();

        console2.log("");
        console2.log("configureCRE() called successfully!");
        console2.log("isCREConfigured:", escrow.isCREConfigured());
    }
}
