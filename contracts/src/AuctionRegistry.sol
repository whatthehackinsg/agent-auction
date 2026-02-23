// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAuctionTypes} from "./interfaces/IAuctionTypes.sol";

/// @title AuctionRegistry — Simplified auction state machine
/// @notice Manages auction lifecycle: NONE → OPEN → CLOSED → SETTLED (or CANCELLED).
///         Holds EIP-712 DOMAIN_SEPARATOR, records sequencer-signed results,
///         and emits AuctionEnded for CRE trigger.
/// @dev Ref: full_contract_arch(amended).md Section 7
contract AuctionRegistry is IAuctionTypes, Ownable {
    using ECDSA for bytes32;

    /* ── Constants ──────────────────────────────────────────────── */

    /// @dev EIP-712 typehash for settlement packet signature verification
    bytes32 public constant SETTLEMENT_TYPEHASH = keccak256(
        "AuctionSettlementPacket(bytes32 auctionId,bytes32 manifestHash,bytes32 finalLogHash,bytes32 replayContentHash,uint256 winnerAgentId,address winnerWallet,uint256 winningBidAmount,uint64 closeTimestamp)"
    );

    /* ── Immutables ─────────────────────────────────────────────── */

    bytes32 public immutable DOMAIN_SEPARATOR;

    /* ── State ──────────────────────────────────────────────────── */

    address public sequencerAddress;
    address public escrowAddress;
    bool private _escrowBound;

    /// @notice Full settlement packet per auction (stored at close)
    struct AuctionData {
        AuctionState state;
        bytes32 manifestHash;
        bytes32 roomConfigHash;
        uint256 reservePrice;
        uint256 depositAmount;
        uint256 deadline;
        // Populated at close (recordResult)
        bytes32 finalLogHash;
        bytes32 replayContentHash;
        uint256 winnerAgentId;
        address winnerWallet;
        uint256 finalPrice;
        uint64 closeTimestamp;
    }

    mapping(bytes32 => AuctionData) public auctions;

    /* ── Events ─────────────────────────────────────────────────── */

    event AuctionCreated(
        bytes32 indexed auctionId, bytes32 manifestHash, uint256 reservePrice, uint256 depositAmount, uint256 deadline
    );

    /// @notice CRE EVM Log Trigger fires on this event
    event AuctionEnded(
        bytes32 indexed auctionId,
        uint256 indexed winnerAgentId,
        address winnerWallet,
        uint256 finalPrice,
        bytes32 finalLogHash,
        bytes32 replayContentHash
    );

    event AuctionSettled(bytes32 indexed auctionId);
    event AuctionCancelled(bytes32 indexed auctionId);
    event WinnerWalletUpdated(bytes32 indexed auctionId, address oldWallet, address newWallet);
    event SequencerUpdated(address indexed oldSequencer, address indexed newSequencer);
    event EscrowBound(address indexed escrow);

    /* ── Errors ─────────────────────────────────────────────────── */

    error OnlySequencer();
    error OnlyEscrow();
    error AuctionAlreadyExists();
    error AuctionNotOpen();
    error AuctionNotClosed();
    error InvalidSequencerSig();
    error EscrowAlreadyBound();
    error ZeroAddress();
    error AuctionNotExpired();
    error InvalidEIP712Sig();
    error ManifestHashMismatch();

    /* ── Modifiers ──────────────────────────────────────────────── */

    modifier onlySequencer() {
        _checkSequencer();
        _;
    }

    modifier onlyEscrow() {
        _checkEscrow();
        _;
    }

    function _checkSequencer() internal view {
        if (msg.sender != sequencerAddress) revert OnlySequencer();
    }

    function _checkEscrow() internal view {
        if (msg.sender != escrowAddress) revert OnlyEscrow();
    }

    /* ── Constructor ────────────────────────────────────────────── */

    constructor(address sequencer_) Ownable(msg.sender) {
        if (sequencer_ == address(0)) revert ZeroAddress();
        sequencerAddress = sequencer_;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AgentAuction"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    /* ── Admin ──────────────────────────────────────────────────── */

    /// @notice One-time binding of escrow contract
    function setEscrow(address escrow_) external onlyOwner {
        if (_escrowBound) revert EscrowAlreadyBound();
        if (escrow_ == address(0)) revert ZeroAddress();
        escrowAddress = escrow_;
        _escrowBound = true;
        emit EscrowBound(escrow_);
    }

    /// @notice Update sequencer address (owner only)
    function setSequencer(address sequencer_) external onlyOwner {
        if (sequencer_ == address(0)) revert ZeroAddress();
        address old = sequencerAddress;
        sequencerAddress = sequencer_;
        emit SequencerUpdated(old, sequencer_);
    }

    /* ── Auction lifecycle ──────────────────────────────────────── */

    /// @notice Create a new auction (called by sequencer or admin)
    function createAuction(
        bytes32 auctionId,
        bytes32 manifestHash,
        bytes32 roomConfigHash,
        uint256 reservePrice,
        uint256 depositAmount,
        uint256 deadline
    ) external onlySequencer {
        if (auctions[auctionId].state != AuctionState.NONE) revert AuctionAlreadyExists();

        auctions[auctionId] = AuctionData({
            state: AuctionState.OPEN,
            manifestHash: manifestHash,
            roomConfigHash: roomConfigHash,
            reservePrice: reservePrice,
            depositAmount: depositAmount,
            deadline: deadline,
            finalLogHash: bytes32(0),
            replayContentHash: bytes32(0),
            winnerAgentId: 0,
            winnerWallet: address(0),
            finalPrice: 0,
            closeTimestamp: 0
        });

        emit AuctionCreated(auctionId, manifestHash, reservePrice, depositAmount, deadline);
    }

    /// @notice Record auction result — the ONE on-chain write at close
    /// @dev Verifies sequencer EIP-712 signature over the settlement packet.
    ///      Uses DOMAIN_SEPARATOR to prevent cross-chain replay.
    ///      Emits AuctionEnded which triggers CRE workflow.
    function recordResult(AuctionSettlementPacket calldata packet, bytes calldata sequencerSig) external {
        AuctionData storage auction = auctions[packet.auctionId];
        if (auction.state != AuctionState.OPEN) revert AuctionNotOpen();

        // FIX: Enforce manifestHash integrity — packet must match auction creation
        if (packet.manifestHash != auction.manifestHash) revert ManifestHashMismatch();

        // Verify sequencer EIP-712 signature (FIX: was raw keccak256, now uses domain separator)
        bytes32 structHash = keccak256(
            abi.encode(
                SETTLEMENT_TYPEHASH,
                packet.auctionId,
                packet.manifestHash,
                packet.finalLogHash,
                packet.replayContentHash,
                packet.winnerAgentId,
                packet.winnerWallet,
                packet.winningBidAmount,
                packet.closeTimestamp
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address recovered = ECDSA.recover(digest, sequencerSig);
        if (recovered != sequencerAddress) revert InvalidSequencerSig();

        // Store result
        auction.state = AuctionState.CLOSED;
        auction.finalLogHash = packet.finalLogHash;
        auction.replayContentHash = packet.replayContentHash;
        auction.winnerAgentId = packet.winnerAgentId;
        auction.winnerWallet = packet.winnerWallet;
        auction.finalPrice = packet.winningBidAmount;
        auction.closeTimestamp = packet.closeTimestamp;

        emit AuctionEnded(
            packet.auctionId,
            packet.winnerAgentId,
            packet.winnerWallet,
            packet.winningBidAmount,
            packet.finalLogHash,
            packet.replayContentHash
        );
    }

    /// @notice Called by AuctionEscrow after CRE settlement completes
    function markSettled(bytes32 auctionId) external onlyEscrow {
        if (auctions[auctionId].state != AuctionState.CLOSED) revert AuctionNotClosed();
        auctions[auctionId].state = AuctionState.SETTLED;
        emit AuctionSettled(auctionId);
    }

    /// @notice Cancel expired auction (72h timeout)
    function cancelExpiredAuction(bytes32 auctionId) external {
        AuctionData storage auction = auctions[auctionId];
        if (auction.state != AuctionState.OPEN) revert AuctionNotOpen();
        if (block.timestamp < auction.deadline + 72 hours) revert AuctionNotExpired();

        auction.state = AuctionState.CANCELLED;
        emit AuctionCancelled(auctionId);
    }

    /// @notice EIP-712 wallet rotation for winner
    /// @dev Domain 2: "AuctionRegistry" — wallet rotation only
    function updateWinnerWallet(bytes32 auctionId, address newWallet, bytes calldata sig) external {
        AuctionData storage auction = auctions[auctionId];
        if (auction.state != AuctionState.CLOSED && auction.state != AuctionState.SETTLED) {
            revert AuctionNotClosed();
        }
        if (newWallet == address(0)) revert ZeroAddress();

        // EIP-712 Domain 2: "AuctionRegistry"
        bytes32 rotationDomainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AuctionRegistry"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );

        bytes32 structHash = keccak256(
            abi.encode(keccak256("WalletRotation(bytes32 auctionId,address newWallet)"), auctionId, newWallet)
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", rotationDomainSeparator, structHash));
        address recovered = ECDSA.recover(digest, sig);
        if (recovered != auction.winnerWallet) revert InvalidEIP712Sig();

        address oldWallet = auction.winnerWallet;
        auction.winnerWallet = newWallet;
        emit WinnerWalletUpdated(auctionId, oldWallet, newWallet);
    }

    /* ── Views ──────────────────────────────────────────────────── */

    function getAuctionState(bytes32 auctionId) external view returns (AuctionState) {
        return auctions[auctionId].state;
    }

    function getWinner(bytes32 auctionId) external view returns (uint256 agentId, address wallet, uint256 price) {
        AuctionData storage a = auctions[auctionId];
        return (a.winnerAgentId, a.winnerWallet, a.finalPrice);
    }

    /// @notice Check if an auction is cancelled (used by AuctionEscrow for refund eligibility)
    function isCancelled(bytes32 auctionId) external view returns (bool) {
        return auctions[auctionId].state == AuctionState.CANCELLED;
    }
}
