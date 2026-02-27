// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAuctionTypes} from "./interfaces/IAuctionTypes.sol";

/// @notice Minimal interface for reading AuctionRegistry state
interface IAuctionRegistryNft {
    function getAuctionState(bytes32 auctionId) external view returns (IAuctionTypes.AuctionState);
    function getWinner(bytes32 auctionId) external view returns (uint256 agentId, address wallet, uint256 price);
}

/// @title NftEscrow — ERC-721 custody for auction items
/// @notice Holds a seller's NFT during an auction, then transfers it to the winner
///         after CRE settlement, or returns it on cancellation / timeout.
/// @dev Reads AuctionRegistry for auction state and winner info. No CRE integration
///      (no IReceiver) — claims are permissionless once state is correct.
contract NftEscrow is ERC721Holder, ReentrancyGuard {
    /* ── Types ──────────────────────────────────────────────────── */

    enum NftState {
        NONE,
        DEPOSITED,
        CLAIMED,
        RETURNED
    }

    struct NftDeposit {
        address nftContract;
        uint256 tokenId;
        address depositor;
        NftState state;
        uint256 depositTimestamp;
    }

    /* ── Immutables ─────────────────────────────────────────────── */

    IAuctionRegistryNft public immutable registry;
    uint256 public constant RECLAIM_TIMEOUT = 30 days;

    /* ── State ──────────────────────────────────────────────────── */

    /// @dev auctionId => NftDeposit
    mapping(bytes32 => NftDeposit) public deposits;

    /* ── Events ─────────────────────────────────────────────────── */

    event NftDeposited(bytes32 indexed auctionId, address indexed nftContract, uint256 tokenId, address depositor);
    event NftClaimed(bytes32 indexed auctionId, address indexed winner, address nftContract, uint256 tokenId);
    event NftReturned(bytes32 indexed auctionId, address indexed depositor, address nftContract, uint256 tokenId);

    /* ── Errors ─────────────────────────────────────────────────── */

    error AuctionNotOpen();
    error AlreadyDeposited();
    error NotSettled();
    error AlreadyClaimed();
    error NotReclaimable();
    error NoDeposit();
    error AlreadyReturned();

    /* ── Constructor ────────────────────────────────────────────── */

    constructor(address registry_) {
        registry = IAuctionRegistryNft(registry_);
    }

    /* ── Deposit ────────────────────────────────────────────────── */

    /// @notice Seller deposits their NFT into escrow for an auction.
    ///         Caller must have called nftContract.approve(address(this), tokenId) first.
    /// @param auctionId The auction this NFT is the item for
    /// @param nftContract The ERC-721 contract address
    /// @param tokenId The token ID to deposit
    function depositNft(bytes32 auctionId, address nftContract, uint256 tokenId) external nonReentrant {
        IAuctionTypes.AuctionState state = registry.getAuctionState(auctionId);
        if (state != IAuctionTypes.AuctionState.OPEN) revert AuctionNotOpen();

        NftDeposit storage dep = deposits[auctionId];
        if (dep.state != NftState.NONE) revert AlreadyDeposited();

        dep.nftContract = nftContract;
        dep.tokenId = tokenId;
        dep.depositor = msg.sender;
        dep.state = NftState.DEPOSITED;
        dep.depositTimestamp = block.timestamp;

        IERC721(nftContract).transferFrom(msg.sender, address(this), tokenId);

        emit NftDeposited(auctionId, nftContract, tokenId, msg.sender);
    }

    /* ── Claim (winner gets NFT) ────────────────────────────────── */

    /// @notice After CRE settlement (SETTLED state), transfer the NFT to the auction winner.
    ///         Permissionless — anyone can trigger it.
    /// @param auctionId The settled auction
    function claimNft(bytes32 auctionId) external nonReentrant {
        IAuctionTypes.AuctionState state = registry.getAuctionState(auctionId);
        if (state != IAuctionTypes.AuctionState.SETTLED) revert NotSettled();

        NftDeposit storage dep = deposits[auctionId];
        if (dep.state == NftState.NONE) revert NoDeposit();
        if (dep.state == NftState.CLAIMED) revert AlreadyClaimed();
        if (dep.state == NftState.RETURNED) revert AlreadyClaimed();

        dep.state = NftState.CLAIMED;

        (, address winnerWallet,) = registry.getWinner(auctionId);

        IERC721(dep.nftContract).transferFrom(address(this), winnerWallet, dep.tokenId);

        emit NftClaimed(auctionId, winnerWallet, dep.nftContract, dep.tokenId);
    }

    /* ── Reclaim (depositor gets NFT back) ──────────────────────── */

    /// @notice Depositor reclaims their NFT when the auction is cancelled,
    ///         or after RECLAIM_TIMEOUT (30 days) post-settlement.
    /// @param auctionId The auction to reclaim from
    function reclaimNft(bytes32 auctionId) external nonReentrant {
        NftDeposit storage dep = deposits[auctionId];
        if (dep.state == NftState.NONE) revert NoDeposit();
        if (dep.state == NftState.CLAIMED) revert AlreadyClaimed();
        if (dep.state == NftState.RETURNED) revert AlreadyReturned();

        IAuctionTypes.AuctionState auctionState = registry.getAuctionState(auctionId);

        bool cancelled = auctionState == IAuctionTypes.AuctionState.CANCELLED;
        bool timedOut = auctionState == IAuctionTypes.AuctionState.SETTLED
            && block.timestamp >= dep.depositTimestamp + RECLAIM_TIMEOUT;

        if (!cancelled && !timedOut) revert NotReclaimable();

        dep.state = NftState.RETURNED;

        IERC721(dep.nftContract).transferFrom(address(this), dep.depositor, dep.tokenId);

        emit NftReturned(auctionId, dep.depositor, dep.nftContract, dep.tokenId);
    }
}
