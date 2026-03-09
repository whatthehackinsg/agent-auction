// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AuctionRegistry} from "../src/AuctionRegistry.sol";
import {IAuctionTypes} from "../src/interfaces/IAuctionTypes.sol";

/// @notice Creates a test auction and records result to emit AuctionEnded event
/// @dev Run: forge script script/CreateTestAuction.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast
contract CreateTestAuction is Script {
    // Deployed AuctionRegistry on Base Sepolia
    address constant REGISTRY = 0xAe416531962709cb26886851888aEc80ef29bB45;

    // Test auction params
    bytes32 constant AUCTION_ID = keccak256("test-auction-cre-002");
    bytes32 constant MANIFEST_HASH = keccak256("test-manifest");
    bytes32 constant ROOM_CONFIG_HASH = keccak256("test-room-config");
    uint256 constant RESERVE_PRICE = 100_000; // 0.1 USDC (6 decimals)
    uint256 constant DEPOSIT_AMOUNT = 50_000; // 0.05 USDC
    uint256 constant DEADLINE_OFFSET = 1 hours;

    // Test winner
    uint256 constant WINNER_AGENT_ID = 42;
    address constant WINNER_WALLET = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    uint256 constant WINNING_BID = 200_000; // 0.2 USDC
    bytes32 constant FINAL_LOG_HASH = keccak256("test-final-log-hash");

    bytes32 constant REPLAY_CONTENT_HASH = keccak256("test-replay-content-hash");
    // EIP-712 domain from AuctionRegistry constructor
    bytes32 constant SETTLEMENT_TYPEHASH = keccak256(
        "AuctionSettlementPacket(bytes32 auctionId,bytes32 manifestHash,bytes32 finalLogHash,bytes32 replayContentHash,uint256 winnerAgentId,address winnerWallet,uint256 winningBidAmount,uint64 closeTimestamp)"
    );

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        AuctionRegistry registry = AuctionRegistry(REGISTRY);

        console.log("Deployer/Sequencer:", deployer);
        console.log("Registry:", REGISTRY);

        // Check sequencer
        address seq = registry.sequencerAddress();
        console.log("Sequencer on-chain:", seq);
        require(seq == deployer, "Deployer is not sequencer");

        uint256 deadline = block.timestamp + DEADLINE_OFFSET;
        uint64 closeTimestamp = uint64(block.timestamp);

        vm.startBroadcast(deployerKey);

        // Step 1: Create auction
        console.log("Step 1: Creating auction...");
        registry.createAuction(
            AUCTION_ID,
            MANIFEST_HASH,
            ROOM_CONFIG_HASH,
            RESERVE_PRICE,
            DEPOSIT_AMOUNT,
            deadline
        );
        console.log("Auction created. ID:", vm.toString(AUCTION_ID));

        // Step 2: Build EIP-712 signature for recordResult
        bytes32 domainSeparator = registry.DOMAIN_SEPARATOR();
        console.log("Domain separator:", vm.toString(domainSeparator));

        bytes32 structHash = keccak256(
            abi.encode(
                SETTLEMENT_TYPEHASH,
                AUCTION_ID,
                MANIFEST_HASH,
                FINAL_LOG_HASH,
                REPLAY_CONTENT_HASH,
                WINNER_AGENT_ID,
                WINNER_WALLET,
                WINNING_BID,
                closeTimestamp
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(deployerKey, digest);
        bytes memory sequencerSig = abi.encodePacked(r, s, v);

        // Step 3: Record result (emits AuctionEnded)
        console.log("Step 2: Recording result (emits AuctionEnded)...");
        IAuctionTypes.AuctionSettlementPacket memory packet = IAuctionTypes.AuctionSettlementPacket({
            auctionId: AUCTION_ID,
            manifestHash: MANIFEST_HASH,
            finalLogHash: FINAL_LOG_HASH,
            replayContentHash: REPLAY_CONTENT_HASH,
            winnerAgentId: WINNER_AGENT_ID,
            winnerWallet: WINNER_WALLET,
            winningBidAmount: WINNING_BID,
            closeTimestamp: closeTimestamp
        });

        registry.recordResult(packet, sequencerSig);
        console.log("AuctionEnded event emitted!");
        console.log("Winner agent ID:", WINNER_AGENT_ID);
        console.log("Winner wallet:", WINNER_WALLET);
        console.log("Winning bid:", WINNING_BID);

        vm.stopBroadcast();

        console.log("---");
        console.log("DONE. Use the tx hash from the recordResult call for CRE simulation.");
        console.log("Run: cre workflow simulate settlement --non-interactive --trigger-index 0 --evm-tx-hash <TX_HASH> --evm-event-index 0");
    }
}
