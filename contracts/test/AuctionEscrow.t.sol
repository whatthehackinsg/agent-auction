// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AuctionEscrow} from "../src/AuctionEscrow.sol";
import {AuctionRegistry} from "../src/AuctionRegistry.sol";
import {MockKeystoneForwarder} from "../src/MockKeystoneForwarder.sol";
import {IAuctionTypes} from "../src/interfaces/IAuctionTypes.sol";

/// @dev Minimal mock ERC-20 for testing
contract MockUSDC {
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

contract AuctionEscrowTest is Test {
    MockUSDC usdc;
    MockKeystoneForwarder forwarder;
    AuctionEscrow escrow;
    AuctionRegistry registry;

    address admin;
    address owner;

    uint256 sequencerPk = 0xA11CE;
    address sequencer;

    // CRE config
    bytes32 workflowId = keccak256("settlement-workflow");
    bytes10 workflowName = bytes10("settlement");
    address workflowOwner = address(0x4444444444444444444444444444444444444444);

    // Auction data
    bytes32 auctionId = keccak256("auction-1");
    uint256 winnerAgentId = 42;
    uint256 loserAgentId = 99;
    address winnerWallet = address(0x1111111111111111111111111111111111111111);
    uint256 bondAmount = 100e6; // 100 USDC

    function setUp() public {
        admin = address(this);
        owner = address(this);
        sequencer = vm.addr(sequencerPk);

        // Deploy mock USDC
        usdc = new MockUSDC();

        // Deploy mock forwarder
        forwarder = new MockKeystoneForwarder(workflowId, workflowName, workflowOwner);

        // Deploy escrow
        escrow = new AuctionEscrow(IERC20(address(usdc)), address(forwarder));

        // Deploy registry and bind
        registry = new AuctionRegistry(sequencer);
        registry.setEscrow(address(escrow));
        escrow.setRegistry(address(registry));

        // Configure CRE
        escrow.configureCRE(workflowId, "settlement", workflowOwner);

        // Create an auction in the registry
        vm.prank(sequencer);
        registry.createAuction(auctionId, keccak256("manifest"), keccak256("room"), 100e6, 10e6, block.timestamp + 1 days);

        // Fund the escrow with USDC (simulating bond deposits already transferred)
        usdc.mint(address(escrow), 1000e6);
    }

    /* ── Helpers ──────────────────────────────────────────────────── */

    function _recordBond(bytes32 _auctionId, uint256 agentId, address depositor, uint256 amount) internal {
        bytes32 txHash = keccak256(abi.encode(_auctionId, agentId, "bond"));
        escrow.recordBond(_auctionId, agentId, depositor, amount, txHash, 0);
    }

    function _closeAuction() internal {
        IAuctionTypes.AuctionSettlementPacket memory packet = IAuctionTypes.AuctionSettlementPacket({
            auctionId: auctionId,
            manifestHash: keccak256("manifest"),
            finalLogHash: keccak256("finalLog"),
            winnerAgentId: winnerAgentId,
            winnerWallet: winnerWallet,
            winningBidAmount: 200e6,
            closeTimestamp: uint64(block.timestamp)
        });
        bytes32 digest = keccak256(abi.encode(packet));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sequencerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        registry.recordResult(packet, sig);
    }

    function _buildReport() internal view returns (bytes memory) {
        return abi.encode(auctionId, winnerAgentId, winnerWallet, 200e6);
    }

    /* ── recordBond ──────────────────────────────────────────────── */

    function test_recordBond_success() public {
        _recordBond(auctionId, winnerAgentId, address(0x6666666666666666666666666666666666666666), bondAmount);

        assertEq(escrow.getBondAmount(auctionId, winnerAgentId), bondAmount);
        assertEq(escrow.totalBonded(), bondAmount);
    }

    function test_recordBond_emitsEvent() public {
        bytes32 txHash = keccak256(abi.encode(auctionId, winnerAgentId, "bond"));
        vm.expectEmit(true, true, false, true);
        emit AuctionEscrow.BondRecorded(auctionId, winnerAgentId, address(0x6666666666666666666666666666666666666666), bondAmount);
        escrow.recordBond(auctionId, winnerAgentId, address(0x6666666666666666666666666666666666666666), bondAmount, txHash, 0);
    }

    function test_recordBond_revertsOnDuplicate() public {
        bytes32 txHash = keccak256("tx1");
        escrow.recordBond(auctionId, winnerAgentId, address(0x6666666666666666666666666666666666666666), bondAmount, txHash, 0);

        vm.expectRevert(AuctionEscrow.BondAlreadyProcessed.selector);
        escrow.recordBond(auctionId, 99, address(0x7777777777777777777777777777777777777777), bondAmount, txHash, 0);
    }

    function test_recordBond_revertsOnSameAgentSameAuction() public {
        _recordBond(auctionId, winnerAgentId, address(0x6666666666666666666666666666666666666666), bondAmount);

        bytes32 txHash2 = keccak256("different-tx");
        vm.expectRevert(AuctionEscrow.BondAlreadyExists.selector);
        escrow.recordBond(auctionId, winnerAgentId, address(0x6666666666666666666666666666666666666666), bondAmount, txHash2, 1);
    }

    function test_recordBond_revertsZeroAmount() public {
        vm.expectRevert(AuctionEscrow.ZeroAmount.selector);
        escrow.recordBond(auctionId, winnerAgentId, address(0x6666666666666666666666666666666666666666), 0, keccak256("tx"), 0);
    }

    function test_recordBond_revertsIfNotAdmin() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(AuctionEscrow.OnlyAdmin.selector);
        escrow.recordBond(auctionId, winnerAgentId, address(0x6666666666666666666666666666666666666666), bondAmount, keccak256("tx"), 0);
    }

    /* ── onReport (CRE settlement via MockKeystoneForwarder) ────── */

    function test_onReport_settlesAuction() public {
        // Record bonds for winner and loser
        _recordBond(auctionId, winnerAgentId, address(0xAAAA), bondAmount);
        _recordBond(auctionId, loserAgentId, address(0xBBBB), bondAmount);

        // Close auction in registry so markSettled works
        _closeAuction();

        // Forward report through mock forwarder
        bytes memory report = _buildReport();
        forwarder.forwardReport(address(escrow), report);

        // Verify settlement
        assertTrue(escrow.auctionSettled(auctionId), "Auction should be settled");
        assertEq(escrow.withdrawable(winnerAgentId), bondAmount, "Winner should have withdrawable balance");
        assertEq(escrow.totalBonded(), bondAmount, "Only loser bond remains in bonded pool");
        assertEq(escrow.totalWithdrawable(), bondAmount, "Winner bond moved to withdrawable");

        // Registry should show SETTLED
        assertEq(uint256(registry.getAuctionState(auctionId)), uint256(IAuctionTypes.AuctionState.SETTLED));
    }

    function test_onReport_revertsIfNotForwarder() public {
        bytes memory metadata = abi.encodePacked(workflowId, workflowName, workflowOwner, bytes2(0x0001));
        bytes memory report = _buildReport();

        vm.prank(address(0xDEAD));
        vm.expectRevert(AuctionEscrow.OnlyForwarder.selector);
        escrow.onReport(metadata, report);
    }

    function test_onReport_revertsIfAlreadySettled() public {
        _recordBond(auctionId, winnerAgentId, address(0xAAAA), bondAmount);
        _closeAuction();

        bytes memory report = _buildReport();
        forwarder.forwardReport(address(escrow), report);

        // Second settlement should revert
        vm.expectRevert(AuctionEscrow.AlreadySettled.selector);
        forwarder.forwardReport(address(escrow), report);
    }

    function test_onReport_revertsInvalidMetadata() public {
        bytes memory shortMetadata = hex"0011"; // too short
        bytes memory report = _buildReport();

        vm.prank(address(forwarder));
        vm.expectRevert(AuctionEscrow.InvalidReport.selector);
        escrow.onReport(shortMetadata, report);
    }

    function test_onReport_revertsWrongWorkflowId() public {
        _recordBond(auctionId, winnerAgentId, address(0xAAAA), bondAmount);
        _closeAuction();

        bytes memory report = _buildReport();

        // Build metadata with wrong workflowId
        bytes memory badMetadata =
            abi.encodePacked(keccak256("wrong"), workflowName, workflowOwner, bytes2(0x0001));

        vm.prank(address(forwarder));
        vm.expectRevert(AuctionEscrow.InvalidReport.selector);
        escrow.onReport(badMetadata, report);
    }

    function test_onReport_revertsWrongAuthor() public {
        _recordBond(auctionId, winnerAgentId, address(0xAAAA), bondAmount);
        _closeAuction();

        bytes memory report = _buildReport();

        // Build metadata with wrong author
        bytes memory badMetadata =
            abi.encodePacked(workflowId, workflowName, address(0xBAD), bytes2(0x0001));

        vm.prank(address(forwarder));
        vm.expectRevert(AuctionEscrow.InvalidReport.selector);
        escrow.onReport(badMetadata, report);
    }

    /* ── claimRefund ──────────────────────────────────────────────── */

    function test_claimRefund_success() public {
        _recordBond(auctionId, winnerAgentId, address(0xAAAA), bondAmount);
        _recordBond(auctionId, loserAgentId, address(0xBBBB), bondAmount);
        _closeAuction();

        // Settle
        forwarder.forwardReport(address(escrow), _buildReport());

        // Loser claims refund
        escrow.claimRefund(auctionId, loserAgentId);

        assertEq(escrow.withdrawable(loserAgentId), bondAmount);
        assertEq(escrow.totalBonded(), 0, "No bonds remaining");
        assertEq(escrow.totalWithdrawable(), bondAmount * 2, "Winner + loser withdrawable");
    }

    function test_claimRefund_revertsIfNotSettled() public {
        _recordBond(auctionId, winnerAgentId, address(0xAAAA), bondAmount);

        vm.expectRevert(AuctionEscrow.NotSettled.selector);
        escrow.claimRefund(auctionId, winnerAgentId);
    }

    function test_claimRefund_revertsIfNoBond() public {
        _recordBond(auctionId, winnerAgentId, address(0xAAAA), bondAmount);
        _closeAuction();
        forwarder.forwardReport(address(escrow), _buildReport());

        // Agent 777 never bonded
        vm.expectRevert(AuctionEscrow.NoBondFound.selector);
        escrow.claimRefund(auctionId, 777);
    }

    function test_claimRefund_revertsIfAlreadyRefunded() public {
        _recordBond(auctionId, loserAgentId, address(0xBBBB), bondAmount);
        _recordBond(auctionId, winnerAgentId, address(0xAAAA), bondAmount);
        _closeAuction();
        forwarder.forwardReport(address(escrow), _buildReport());

        escrow.claimRefund(auctionId, loserAgentId);

        vm.expectRevert(AuctionEscrow.AlreadyRefunded.selector);
        escrow.claimRefund(auctionId, loserAgentId);
    }

    /* ── withdraw ─────────────────────────────────────────────────── */

    function test_withdraw_success() public {
        _recordBond(auctionId, winnerAgentId, address(0xAAAA), bondAmount);
        _closeAuction();
        forwarder.forwardReport(address(escrow), _buildReport());

        // Winner withdraws
        address recipient = makeAddr("recipient");
        escrow.withdraw(winnerAgentId, recipient);

        assertEq(usdc.balanceOf(recipient), bondAmount);
        assertEq(escrow.withdrawable(winnerAgentId), 0);
        assertEq(escrow.totalWithdrawable(), 0);
    }

    function test_withdraw_revertsIfNothingToWithdraw() public {
        vm.expectRevert(AuctionEscrow.NothingToWithdraw.selector);
        escrow.withdraw(winnerAgentId, makeAddr("recipient"));
    }

    /* ── adminRefund ──────────────────────────────────────────────── */

    function test_adminRefund_success() public {
        address depositor = address(0x6666666666666666666666666666666666666666);
        _recordBond(auctionId, winnerAgentId, depositor, bondAmount);

        // Admin emergency refund
        escrow.adminRefund(auctionId, winnerAgentId);

        assertEq(usdc.balanceOf(depositor), bondAmount, "USDC should go back to depositor");
        assertEq(escrow.totalBonded(), 0);
    }

    function test_adminRefund_revertsIfNotAdmin() public {
        _recordBond(auctionId, winnerAgentId, address(0x6666666666666666666666666666666666666666), bondAmount);

        vm.prank(address(0xDEAD));
        vm.expectRevert(AuctionEscrow.OnlyAdmin.selector);
        escrow.adminRefund(auctionId, winnerAgentId);
    }

    function test_adminRefund_revertsIfNoBond() public {
        vm.expectRevert(AuctionEscrow.NoBondFound.selector);
        escrow.adminRefund(auctionId, 999);
    }

    function test_adminRefund_revertsIfAlreadyRefunded() public {
        _recordBond(auctionId, winnerAgentId, address(0x6666666666666666666666666666666666666666), bondAmount);
        escrow.adminRefund(auctionId, winnerAgentId);

        vm.expectRevert(AuctionEscrow.AlreadyRefunded.selector);
        escrow.adminRefund(auctionId, winnerAgentId);
    }

    /* ── Solvency ─────────────────────────────────────────────────── */

    function test_checkSolvency_trueWhenFunded() public {
        _recordBond(auctionId, winnerAgentId, address(0xAAAA), bondAmount);
        assertTrue(escrow.checkSolvency(), "Should be solvent with enough USDC");
    }

    /* ── CRE configuration ────────────────────────────────────────── */

    function test_configureCRE() public {
        bytes32 newId = keccak256("new-workflow");
        escrow.configureCRE(newId, "newflow", address(0x2222222222222222222222222222222222222222));

        assertEq(escrow.expectedWorkflowId(), newId);
        assertEq(escrow.expectedAuthor(), address(0x2222222222222222222222222222222222222222));
    }

    function test_setAdmin() public {
        address newAdmin = makeAddr("admin2");
        escrow.setAdmin(newAdmin);

        // Old admin can no longer record bonds
        vm.expectRevert(AuctionEscrow.OnlyAdmin.selector);
        escrow.recordBond(auctionId, 1, address(0x1), 1e6, keccak256("tx"), 0);

        // New admin can
        vm.prank(newAdmin);
        escrow.recordBond(auctionId, 1, address(0x1), 1e6, keccak256("tx"), 0);
    }

    function test_setRegistry() public {
        address newReg = makeAddr("registry2");
        escrow.setRegistry(newReg);
        assertEq(address(escrow.registry()), newReg);
    }

    function test_setRegistry_revertsZeroAddress() public {
        vm.expectRevert(AuctionEscrow.ZeroAddress.selector);
        escrow.setRegistry(address(0));
    }

    function test_setAdmin_revertsZeroAddress() public {
        vm.expectRevert(AuctionEscrow.ZeroAddress.selector);
        escrow.setAdmin(address(0));
    }

    /* ── Full E2E flow ────────────────────────────────────────────── */

    function test_fullFlow_bondSettleRefundWithdraw() public {
        // 1. Two agents bond
        _recordBond(auctionId, winnerAgentId, address(0xAAAA), bondAmount);
        _recordBond(auctionId, loserAgentId, address(0xBBBB), bondAmount);
        assertEq(escrow.totalBonded(), bondAmount * 2);

        // 2. Close auction in registry
        _closeAuction();

        // 3. CRE settles via forwarder
        forwarder.forwardReport(address(escrow), _buildReport());
        assertTrue(escrow.auctionSettled(auctionId));

        // 4. Loser claims refund
        escrow.claimRefund(auctionId, loserAgentId);

        // 5. Both withdraw
        address winnerDest = address(0x8888888888888888888888888888888888888888);
        address loserDest = address(0x9999999999999999999999999999999999999999);
        escrow.withdraw(winnerAgentId, winnerDest);
        escrow.withdraw(loserAgentId, loserDest);

        assertEq(usdc.balanceOf(winnerDest), bondAmount);
        assertEq(usdc.balanceOf(loserDest), bondAmount);
        assertEq(escrow.totalBonded(), 0);
        assertEq(escrow.totalWithdrawable(), 0);

        // 6. Registry shows SETTLED
        assertEq(uint256(registry.getAuctionState(auctionId)), uint256(IAuctionTypes.AuctionState.SETTLED));
    }
}
