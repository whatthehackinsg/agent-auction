// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {AuctionRegistry} from "../src/AuctionRegistry.sol";
import {IAuctionTypes} from "../src/interfaces/IAuctionTypes.sol";

contract AuctionRegistryTest is Test {
    AuctionRegistry registry;

    uint256 sequencerPk = 0xA11CE;
    address sequencer;
    address owner;
    address escrow = address(0xE5C40);

    bytes32 auctionId = keccak256("auction-1");
    bytes32 manifestHash = keccak256("manifest");
    bytes32 roomConfigHash = keccak256("roomConfig");
    uint256 reservePrice = 100e6; // 100 USDC
    uint256 depositAmount = 10e6; // 10 USDC
    uint256 deadline;

    function setUp() public {
        sequencer = vm.addr(sequencerPk);
        owner = address(this);
        deadline = block.timestamp + 1 days;

        registry = new AuctionRegistry(sequencer);
        registry.setEscrow(escrow);
    }

    /* ── Helpers ──────────────────────────────────────────────────── */

    function _createAuction() internal {
        vm.prank(sequencer);
        registry.createAuction(auctionId, manifestHash, roomConfigHash, reservePrice, depositAmount, deadline);
    }

    function _buildPacket() internal view returns (IAuctionTypes.AuctionSettlementPacket memory) {
        return IAuctionTypes.AuctionSettlementPacket({
            auctionId: auctionId,
            manifestHash: manifestHash,
            finalLogHash: keccak256("finalLog"),
            replayContentHash: keccak256("replayContent"),
            winnerAgentId: 42,
            winnerWallet: address(0x1111111111111111111111111111111111111111),
            winningBidAmount: 200e6,
            closeTimestamp: uint64(block.timestamp)
        });
    }

    function _signPacket(IAuctionTypes.AuctionSettlementPacket memory packet) internal view returns (bytes memory) {
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
        return abi.encodePacked(r, s, v);
    }

    /* ── Constructor ──────────────────────────────────────────────── */

    function test_constructor_setsDomainSeparator() public view {
        bytes32 ds = registry.DOMAIN_SEPARATOR();
        assertTrue(ds != bytes32(0), "Domain separator should be set");
    }

    function test_constructor_setsSettlementTypehash() public view {
        bytes32 th = registry.SETTLEMENT_TYPEHASH();
        assertTrue(th != bytes32(0), "Settlement typehash should be set");
    }

    function test_constructor_revertsZeroSequencer() public {
        vm.expectRevert(AuctionRegistry.ZeroAddress.selector);
        new AuctionRegistry(address(0));
    }

    /* ── setEscrow ────────────────────────────────────────────────── */

    function test_setEscrow_onlyOnce() public {
        // Already set in setUp, second call should revert
        vm.expectRevert(AuctionRegistry.EscrowAlreadyBound.selector);
        registry.setEscrow(address(0xABC));
    }

    function test_setEscrow_revertsZeroAddress() public {
        // Deploy fresh registry (escrow not yet set)
        AuctionRegistry fresh = new AuctionRegistry(sequencer);
        vm.expectRevert(AuctionRegistry.ZeroAddress.selector);
        fresh.setEscrow(address(0));
    }

    /* ── setSequencer ─────────────────────────────────────────────── */

    function test_setSequencer() public {
        address newSeq = address(0xBEEF);
        registry.setSequencer(newSeq);
        assertEq(registry.sequencerAddress(), newSeq);
    }

    function test_setSequencer_revertsZeroAddress() public {
        vm.expectRevert(AuctionRegistry.ZeroAddress.selector);
        registry.setSequencer(address(0));
    }

    /* ── createAuction ────────────────────────────────────────────── */

    function test_createAuction_setsStateToOpen() public {
        _createAuction();
        assertEq(uint256(registry.getAuctionState(auctionId)), uint256(IAuctionTypes.AuctionState.OPEN));
    }

    function test_createAuction_revertsIfNotSequencer() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(AuctionRegistry.OnlySequencer.selector);
        registry.createAuction(auctionId, manifestHash, roomConfigHash, reservePrice, depositAmount, deadline);
    }

    function test_createAuction_revertsIfAlreadyExists() public {
        _createAuction();
        vm.prank(sequencer);
        vm.expectRevert(AuctionRegistry.AuctionAlreadyExists.selector);
        registry.createAuction(auctionId, manifestHash, roomConfigHash, reservePrice, depositAmount, deadline);
    }

    function test_createAuction_emitsEvent() public {
        vm.prank(sequencer);
        vm.expectEmit(true, false, false, true);
        emit AuctionRegistry.AuctionCreated(auctionId, manifestHash, reservePrice, depositAmount, deadline);
        registry.createAuction(auctionId, manifestHash, roomConfigHash, reservePrice, depositAmount, deadline);
    }

    /* ── recordResult (EIP-712 signatures) ────────────────────────── */

    function test_recordResult_closesAuction() public {
        _createAuction();

        IAuctionTypes.AuctionSettlementPacket memory packet = _buildPacket();
        bytes memory sig = _signPacket(packet);

        registry.recordResult(packet, sig);
        assertEq(uint256(registry.getAuctionState(auctionId)), uint256(IAuctionTypes.AuctionState.CLOSED));
    }

    function test_recordResult_storesWinner() public {
        _createAuction();

        IAuctionTypes.AuctionSettlementPacket memory packet = _buildPacket();
        bytes memory sig = _signPacket(packet);

        registry.recordResult(packet, sig);

        (uint256 agentId, address wallet, uint256 price) = registry.getWinner(auctionId);
        assertEq(agentId, 42);
        assertEq(wallet, address(0x1111111111111111111111111111111111111111));
        assertEq(price, 200e6);
    }

    function test_recordResult_emitsAuctionEnded() public {
        _createAuction();

        IAuctionTypes.AuctionSettlementPacket memory packet = _buildPacket();
        bytes memory sig = _signPacket(packet);

        vm.expectEmit(true, true, false, true);
        emit AuctionRegistry.AuctionEnded(
            auctionId,
            42,
            address(0x1111111111111111111111111111111111111111),
            200e6,
            keccak256("finalLog"),
            keccak256("replayContent")
        );
        registry.recordResult(packet, sig);
    }

    function test_recordResult_revertsIfNotOpen() public {
        // Auction doesn't exist → state is NONE
        IAuctionTypes.AuctionSettlementPacket memory packet = _buildPacket();
        bytes memory sig = _signPacket(packet);

        vm.expectRevert(AuctionRegistry.AuctionNotOpen.selector);
        registry.recordResult(packet, sig);
    }

    function test_recordResult_revertsInvalidSequencerSig() public {
        _createAuction();

        IAuctionTypes.AuctionSettlementPacket memory packet = _buildPacket();
        // Sign with wrong key using correct EIP-712 format
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
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBEEF, digest);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.expectRevert(AuctionRegistry.InvalidSequencerSig.selector);
        registry.recordResult(packet, badSig);
    }

    function test_recordResult_rejectsRawKeccakSig() public {
        _createAuction();

        IAuctionTypes.AuctionSettlementPacket memory packet = _buildPacket();
        // Old-style raw keccak256 signing (should now fail)
        bytes32 rawDigest = keccak256(abi.encode(packet));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sequencerPk, rawDigest);
        bytes memory oldSig = abi.encodePacked(r, s, v);

        vm.expectRevert(AuctionRegistry.InvalidSequencerSig.selector);
        registry.recordResult(packet, oldSig);
    }

    /* ── markSettled ──────────────────────────────────────────────── */

    function test_markSettled_changesStateToClosed() public {
        _createAuction();
        IAuctionTypes.AuctionSettlementPacket memory packet = _buildPacket();
        registry.recordResult(packet, _signPacket(packet));

        vm.prank(escrow);
        registry.markSettled(auctionId);
        assertEq(uint256(registry.getAuctionState(auctionId)), uint256(IAuctionTypes.AuctionState.SETTLED));
    }

    function test_markSettled_revertsIfNotEscrow() public {
        _createAuction();
        IAuctionTypes.AuctionSettlementPacket memory packet = _buildPacket();
        registry.recordResult(packet, _signPacket(packet));

        vm.expectRevert(AuctionRegistry.OnlyEscrow.selector);
        registry.markSettled(auctionId);
    }

    function test_markSettled_revertsIfNotClosed() public {
        _createAuction();
        // Still OPEN
        vm.prank(escrow);
        vm.expectRevert(AuctionRegistry.AuctionNotClosed.selector);
        registry.markSettled(auctionId);
    }

    /* ── cancelExpiredAuction ─────────────────────────────────────── */

    function test_cancelExpired_succeeds() public {
        _createAuction();
        // Warp past deadline + 72h
        vm.warp(deadline + 72 hours + 1);

        registry.cancelExpiredAuction(auctionId);
        assertEq(uint256(registry.getAuctionState(auctionId)), uint256(IAuctionTypes.AuctionState.CANCELLED));
    }

    function test_cancelExpired_revertsIfNotExpired() public {
        _createAuction();
        // Still within deadline + 72h
        vm.warp(deadline + 72 hours - 1);

        vm.expectRevert(AuctionRegistry.AuctionNotExpired.selector);
        registry.cancelExpiredAuction(auctionId);
    }

    function test_cancelExpired_revertsIfNotOpen() public {
        // Auction doesn't exist → state is NONE
        vm.expectRevert(AuctionRegistry.AuctionNotOpen.selector);
        registry.cancelExpiredAuction(auctionId);
    }

    /* ── updateWinnerWallet (EIP-712) ─────────────────────────────── */

    function test_updateWinnerWallet() public {
        _createAuction();

        // Use a proper key pair for the winner wallet
        uint256 winnerPk = 0xCA11;
        address winnerAddr = vm.addr(winnerPk);

        IAuctionTypes.AuctionSettlementPacket memory packet = _buildPacket();
        packet.winnerWallet = winnerAddr;
        registry.recordResult(packet, _signPacket(packet));

        // Compute EIP-712 digest for Domain 2 "AuctionRegistry"
        address newWallet = address(0x2222222222222222222222222222222222222222);

        bytes32 rotationDomainSep = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AuctionRegistry"),
                keccak256("1"),
                block.chainid,
                address(registry)
            )
        );

        bytes32 structHash = keccak256(
            abi.encode(keccak256("WalletRotation(bytes32 auctionId,address newWallet)"), auctionId, newWallet)
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", rotationDomainSep, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(winnerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        registry.updateWinnerWallet(auctionId, newWallet, sig);

        (, address wallet,) = registry.getWinner(auctionId);
        assertEq(wallet, newWallet);
    }

    function test_updateWinnerWallet_revertsIfWrongSigner() public {
        _createAuction();

        uint256 winnerPk = 0xCA11;
        address winnerAddr = vm.addr(winnerPk);

        IAuctionTypes.AuctionSettlementPacket memory packet = _buildPacket();
        packet.winnerWallet = winnerAddr;
        registry.recordResult(packet, _signPacket(packet));

        address newWallet = address(0x2222222222222222222222222222222222222222);

        bytes32 rotationDomainSep = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AuctionRegistry"),
                keccak256("1"),
                block.chainid,
                address(registry)
            )
        );

        bytes32 structHash = keccak256(
            abi.encode(keccak256("WalletRotation(bytes32 auctionId,address newWallet)"), auctionId, newWallet)
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", rotationDomainSep, structHash));
        // Sign with wrong key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBEEF, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.expectRevert(AuctionRegistry.InvalidEIP712Sig.selector);
        registry.updateWinnerWallet(auctionId, newWallet, sig);
    }

    /* ── isCancelled view ─────────────────────────────────────────── */

    function test_isCancelled_returnsTrueForCancelled() public {
        _createAuction();
        vm.warp(deadline + 72 hours + 1);
        registry.cancelExpiredAuction(auctionId);

        assertTrue(registry.isCancelled(auctionId), "Should be cancelled");
    }

    function test_isCancelled_returnsFalseForNonCancelled() public {
        _createAuction();
        assertFalse(registry.isCancelled(auctionId), "OPEN auction should not be cancelled");
    }

    function test_isCancelled_returnsFalseForNonExistent() public {
        assertFalse(registry.isCancelled(keccak256("nonexistent")), "Non-existent auction should not be cancelled");
    }

    /* ── recordResult manifestHash enforcement ────────────────────── */

    function test_recordResult_revertsManifestHashMismatch() public {
        _createAuction();

        IAuctionTypes.AuctionSettlementPacket memory packet = IAuctionTypes.AuctionSettlementPacket({
            auctionId: auctionId,
            manifestHash: keccak256("wrong-manifest"),
            finalLogHash: keccak256("finalLog"),
            replayContentHash: keccak256("replayContent"),
            winnerAgentId: 42,
            winnerWallet: address(0x1111111111111111111111111111111111111111),
            winningBidAmount: 200e6,
            closeTimestamp: uint64(block.timestamp)
        });

        bytes memory sig = _signPacket(packet);

        vm.expectRevert(AuctionRegistry.ManifestHashMismatch.selector);
        registry.recordResult(packet, sig);
    }

    function test_recordResult_succeedsWithCorrectManifestHash() public {
        _createAuction();

        IAuctionTypes.AuctionSettlementPacket memory packet = _buildPacket();
        bytes memory sig = _signPacket(packet);

        registry.recordResult(packet, sig);
        assertEq(uint256(registry.getAuctionState(auctionId)), uint256(IAuctionTypes.AuctionState.CLOSED));
    }
}
