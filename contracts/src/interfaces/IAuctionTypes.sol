// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAuctionTypes {
    enum AuctionState {
        NONE,
        OPEN,
        CLOSED,
        SETTLED,
        CANCELLED
    }

    struct AuctionSettlementPacket {
        bytes32 auctionId;
        bytes32 manifestHash;
        bytes32 finalLogHash;
        bytes32 replayContentHash;
        uint256 winnerAgentId;
        address winnerWallet;
        uint256 winningBidAmount;
        uint64 closeTimestamp;
    }

    struct BondRecord {
        address depositor;
        uint256 amount;
        bool refunded;
    }
}
