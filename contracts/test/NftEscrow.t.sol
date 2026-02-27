// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {NftEscrow} from "../src/NftEscrow.sol";
import {AuctionEscrow} from "../src/AuctionEscrow.sol";
import {AuctionRegistry} from "../src/AuctionRegistry.sol";
import {MockKeystoneForwarder} from "../src/MockKeystoneForwarder.sol";
import {IAuctionTypes} from "../src/interfaces/IAuctionTypes.sol";
import {MockERC721} from "../src/mocks/MockERC721.sol";

/// @dev Minimal mock ERC-20 for testing (same pattern as AuctionEscrow.t.sol)
contract MockUSDCForNft {
    string public name = "Mock USDC";
    string public symbol = "USDC";
    uint8 public decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "not approved");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

contract NftEscrowTest is Test {
    MockERC721 nft;
    NftEscrow nftEscrow;
    AuctionRegistry registry;
    AuctionEscrow auctionEscrow;
    MockKeystoneForwarder forwarder;
    MockUSDCForNft usdc;

    address seller;
    address winner;

    uint256 sequencerPk = 0xA11CE;
    address sequencer;

    // CRE config
    bytes32 workflowId = keccak256("settlement-workflow");
    bytes10 workflowName = bytes10("settlement");
    address workflowOwner = address(0x4444444444444444444444444444444444444444);

    // Auction data
    bytes32 auctionId = keccak256("nft-auction-1");
    uint256 winnerAgentId = 42;
    address winnerWallet = address(0x1111111111111111111111111111111111111111);
    uint256 bondAmount = 100e6;
    uint256 tokenId = 1;

    function setUp() public {
        sequencer = vm.addr(sequencerPk);
        seller = makeAddr("seller");
        winner = winnerWallet;

        // Deploy mock contracts
        nft = new MockERC721();
        usdc = new MockUSDCForNft();
        forwarder = new MockKeystoneForwarder(workflowId, workflowName, workflowOwner);

        // Deploy registry
        registry = new AuctionRegistry(sequencer);

        // Deploy NftEscrow
        nftEscrow = new NftEscrow(address(registry));

        // Deploy AuctionEscrow for full flow tests
        auctionEscrow = new AuctionEscrow(IERC20(address(usdc)), address(forwarder));
        registry.setEscrow(address(auctionEscrow));
        auctionEscrow.setRegistry(address(registry));
        auctionEscrow.configureCRE(workflowId, workflowName, workflowOwner);

        // Create an OPEN auction
        vm.prank(sequencer);
        registry.createAuction(
            auctionId, keccak256("manifest"), keccak256("room"), 100e6, 10e6, block.timestamp + 1 days
        );

        // Mint NFT to seller
        nft.mint(seller, tokenId);

        // Fund escrow with USDC
        usdc.mint(address(auctionEscrow), 1000e6);
    }

    /* ── Helpers ──────────────────────────────────────────────────── */

    function _depositNft() internal {
        vm.startPrank(seller);
        nft.approve(address(nftEscrow), tokenId);
        nftEscrow.depositNft(auctionId, address(nft), tokenId);
        vm.stopPrank();
    }

    function _closeAuction() internal {
        IAuctionTypes.AuctionSettlementPacket memory packet = IAuctionTypes.AuctionSettlementPacket({
            auctionId: auctionId,
            manifestHash: keccak256("manifest"),
            finalLogHash: keccak256("finalLog"),
            replayContentHash: keccak256("replayContent"),
            winnerAgentId: winnerAgentId,
            winnerWallet: winnerWallet,
            winningBidAmount: 200e6,
            closeTimestamp: uint64(block.timestamp)
        });
        bytes32 structHash = keccak256(
            abi.encode(
                registry.SETTLEMENT_TYPEHASH(),
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
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", registry.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sequencerPk, digest);
        registry.recordResult(packet, abi.encodePacked(r, s, v));
    }

    function _settleViaCRE() internal {
        bytes memory report = abi.encode(auctionId, winnerAgentId, winnerWallet, 200e6);
        forwarder.forwardReport(address(auctionEscrow), report);
    }

    /* ── depositNft ──────────────────────────────────────────────── */

    function test_depositNft_success() public {
        _depositNft();

        (address nftContract, uint256 tid, address depositor, NftEscrow.NftState state, uint256 depositTs) =
            nftEscrow.deposits(auctionId);

        assertEq(nftContract, address(nft));
        assertEq(tid, tokenId);
        assertEq(depositor, seller);
        assertEq(uint256(state), uint256(NftEscrow.NftState.DEPOSITED));
        assertGt(depositTs, 0);

        // NFT is now held by escrow
        assertEq(nft.ownerOf(tokenId), address(nftEscrow));
    }

    function test_depositNft_revertsIfAuctionNotOpen() public {
        // Close the auction first
        _closeAuction();

        vm.startPrank(seller);
        nft.approve(address(nftEscrow), tokenId);
        vm.expectRevert(NftEscrow.AuctionNotOpen.selector);
        nftEscrow.depositNft(auctionId, address(nft), tokenId);
        vm.stopPrank();
    }

    function test_depositNft_revertsIfAlreadyDeposited() public {
        _depositNft();

        // Mint another NFT and try to deposit for same auction
        uint256 tokenId2 = 2;
        nft.mint(seller, tokenId2);

        vm.startPrank(seller);
        nft.approve(address(nftEscrow), tokenId2);
        vm.expectRevert(NftEscrow.AlreadyDeposited.selector);
        nftEscrow.depositNft(auctionId, address(nft), tokenId2);
        vm.stopPrank();
    }

    /* ── claimNft ────────────────────────────────────────────────── */

    function test_claimNft_success() public {
        _depositNft();
        _closeAuction();
        _settleViaCRE();

        // State should be SETTLED
        assertEq(uint256(registry.getAuctionState(auctionId)), uint256(IAuctionTypes.AuctionState.SETTLED));

        nftEscrow.claimNft(auctionId);

        // NFT should now belong to the winner
        assertEq(nft.ownerOf(tokenId), winnerWallet);

        // Deposit state should be CLAIMED
        (,,, NftEscrow.NftState state,) = nftEscrow.deposits(auctionId);
        assertEq(uint256(state), uint256(NftEscrow.NftState.CLAIMED));
    }

    function test_claimNft_revertsIfNotSettled() public {
        _depositNft();

        // Auction is OPEN, not SETTLED
        vm.expectRevert(NftEscrow.NotSettled.selector);
        nftEscrow.claimNft(auctionId);
    }

    function test_claimNft_revertsIfNotSettled_closed() public {
        _depositNft();
        _closeAuction();

        // Auction is CLOSED, not SETTLED
        vm.expectRevert(NftEscrow.NotSettled.selector);
        nftEscrow.claimNft(auctionId);
    }

    function test_claimNft_revertsIfAlreadyClaimed() public {
        _depositNft();
        _closeAuction();
        _settleViaCRE();

        nftEscrow.claimNft(auctionId);

        // Second claim should revert
        vm.expectRevert(NftEscrow.AlreadyClaimed.selector);
        nftEscrow.claimNft(auctionId);
    }

    /* ── reclaimNft ──────────────────────────────────────────────── */

    function test_reclaimNft_successOnCancellation() public {
        _depositNft();

        // Cancel: warp past deadline + 72h
        vm.warp(block.timestamp + 1 days + 72 hours + 1);
        registry.cancelExpiredAuction(auctionId);
        assertEq(uint256(registry.getAuctionState(auctionId)), uint256(IAuctionTypes.AuctionState.CANCELLED));

        nftEscrow.reclaimNft(auctionId);

        // NFT back to seller
        assertEq(nft.ownerOf(tokenId), seller);

        // Deposit state should be RETURNED
        (,,, NftEscrow.NftState state,) = nftEscrow.deposits(auctionId);
        assertEq(uint256(state), uint256(NftEscrow.NftState.RETURNED));
    }

    function test_reclaimNft_successOnTimeout() public {
        _depositNft();
        _closeAuction();
        _settleViaCRE();

        // Warp past RECLAIM_TIMEOUT (30 days from deposit)
        vm.warp(block.timestamp + 30 days);

        nftEscrow.reclaimNft(auctionId);

        // NFT back to seller
        assertEq(nft.ownerOf(tokenId), seller);

        (,,, NftEscrow.NftState state,) = nftEscrow.deposits(auctionId);
        assertEq(uint256(state), uint256(NftEscrow.NftState.RETURNED));
    }

    function test_reclaimNft_revertsIfNotCancelledOrTimedOut() public {
        _depositNft();

        // Auction is still OPEN — not cancelled, not settled
        vm.expectRevert(NftEscrow.NotReclaimable.selector);
        nftEscrow.reclaimNft(auctionId);
    }

    function test_reclaimNft_revertsIfSettledButNotTimedOut() public {
        _depositNft();
        _closeAuction();
        _settleViaCRE();

        // Only 1 day has passed — not past 30-day timeout
        vm.warp(block.timestamp + 1 days);

        vm.expectRevert(NftEscrow.NotReclaimable.selector);
        nftEscrow.reclaimNft(auctionId);
    }

    function test_reclaimNft_revertsIfAlreadyClaimed() public {
        _depositNft();
        _closeAuction();
        _settleViaCRE();

        nftEscrow.claimNft(auctionId);

        // Warp past timeout and try reclaim — should revert
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(NftEscrow.AlreadyClaimed.selector);
        nftEscrow.reclaimNft(auctionId);
    }

    function test_reclaimNft_revertsIfAlreadyReturned() public {
        _depositNft();

        // Cancel and reclaim
        vm.warp(block.timestamp + 1 days + 72 hours + 1);
        registry.cancelExpiredAuction(auctionId);
        nftEscrow.reclaimNft(auctionId);

        // Try reclaim again
        vm.expectRevert(NftEscrow.AlreadyReturned.selector);
        nftEscrow.reclaimNft(auctionId);
    }

    /* ── Full E2E flow ────────────────────────────────────────────── */

    function test_fullFlow_depositSettleClaim() public {
        // 1. Seller deposits NFT
        _depositNft();
        assertEq(nft.ownerOf(tokenId), address(nftEscrow));

        // 2. Record a bond for the winner
        bytes32 txHash = keccak256(abi.encode(auctionId, winnerAgentId, "bond"));
        auctionEscrow.recordBond(auctionId, winnerAgentId, address(0xAAAA), bondAmount, txHash, 0);

        // 3. Close auction via sequencer EIP-712 sig
        _closeAuction();
        assertEq(uint256(registry.getAuctionState(auctionId)), uint256(IAuctionTypes.AuctionState.CLOSED));

        // 4. CRE settles via MockKeystoneForwarder -> AuctionEscrow.onReport -> registry.markSettled
        _settleViaCRE();
        assertEq(uint256(registry.getAuctionState(auctionId)), uint256(IAuctionTypes.AuctionState.SETTLED));
        assertTrue(auctionEscrow.auctionSettled(auctionId));

        // 5. Winner claims NFT from NftEscrow
        nftEscrow.claimNft(auctionId);
        assertEq(nft.ownerOf(tokenId), winnerWallet);

        // 6. Verify deposit state
        (,,, NftEscrow.NftState state,) = nftEscrow.deposits(auctionId);
        assertEq(uint256(state), uint256(NftEscrow.NftState.CLAIMED));
    }

    function test_auctionWithoutNft_unaffected() public {
        // Run a complete auction flow WITHOUT any NftEscrow interaction.
        // This verifies existing auction + escrow flow is unchanged.

        // 1. Bond
        bytes32 txHash = keccak256(abi.encode(auctionId, winnerAgentId, "bond"));
        auctionEscrow.recordBond(auctionId, winnerAgentId, address(0xAAAA), bondAmount, txHash, 0);

        // 2. Close
        _closeAuction();

        // 3. Settle
        _settleViaCRE();

        // 4. Registry is SETTLED, escrow settled
        assertEq(uint256(registry.getAuctionState(auctionId)), uint256(IAuctionTypes.AuctionState.SETTLED));
        assertTrue(auctionEscrow.auctionSettled(auctionId));

        // 5. NftEscrow has no deposit for this auction
        (address nftContract,,, NftEscrow.NftState state,) = nftEscrow.deposits(auctionId);
        assertEq(nftContract, address(0));
        assertEq(uint256(state), uint256(NftEscrow.NftState.NONE));
    }
}
