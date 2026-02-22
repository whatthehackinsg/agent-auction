// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IReceiver} from "@chainlink/contracts/src/v0.8/keystone/interfaces/IReceiver.sol";
import {IAuctionTypes} from "./interfaces/IAuctionTypes.sol";

/// @notice Minimal interface for AuctionRegistry callback
interface IAuctionRegistry {
    function markSettled(bytes32 auctionId) external;
}

/// @title AuctionEscrow — USDC bond escrow with CRE settlement
/// @notice Holds agent bonds (USDC), settles via Chainlink CRE onReport,
///         provides pull-based refunds for non-winners.
/// @dev Implements IReceiver for KeystoneForwarder integration.
///      Solvency invariant: usdc.balanceOf(this) >= totalBonded + totalWithdrawable
///      Ref: full_contract_arch(amended).md Section 8
contract AuctionEscrow is IReceiver, Ownable, ReentrancyGuard, IAuctionTypes {
    using SafeERC20 for IERC20;

    /* ── Immutables ─────────────────────────────────────────────── */

    IERC20 public immutable USDC;
    address public immutable FORWARDER; // KeystoneForwarder address

    /* ── CRE configuration (set post-deploy by owner) ───────────── */

    bytes32 public expectedWorkflowId;
    string public expectedWorkflowName;
    address public expectedAuthor;

    /* ── External contracts ─────────────────────────────────────── */

    IAuctionRegistry public registry;
    address public admin; // Platform admin that can call recordBond

    /* ── Bond storage ───────────────────────────────────────────── */

    /// @dev auctionId → agentId → BondRecord
    mapping(bytes32 => mapping(uint256 => BondRecord)) public bonds;

    /// @dev Idempotency: keccak256(txHash, logIndex) → recorded
    mapping(bytes32 => bool) public bondTxProcessed;

    /// @dev agentId → withdrawable balance (after settlement/refund)
    mapping(uint256 => uint256) public withdrawable;

    /// @dev Solvency tracking
    uint256 public totalBonded;
    uint256 public totalWithdrawable;

    /// @dev auctionId → settled flag
    mapping(bytes32 => bool) public auctionSettled;

    /* ── Events ─────────────────────────────────────────────────── */

    event BondRecorded(
        bytes32 indexed auctionId,
        uint256 indexed agentId,
        address depositor,
        uint256 amount
    );
    event SettlementProcessed(bytes32 indexed auctionId, uint256 indexed winnerAgentId, uint256 amount);
    event RefundClaimed(bytes32 indexed auctionId, uint256 indexed agentId, uint256 amount);
    event Withdrawn(uint256 indexed agentId, address to, uint256 amount);
    event AdminRefund(bytes32 indexed auctionId, uint256 indexed agentId, uint256 amount);
    event RegistryUpdated(address indexed registry);
    event AdminUpdated(address indexed admin);
    event CREConfigured(bytes32 workflowId, string workflowName, address author);

    /* ── Errors ─────────────────────────────────────────────────── */

    error OnlyForwarder();
    error OnlyAdmin();
    error BondAlreadyProcessed();
    error BondAlreadyExists();
    error AlreadySettled();
    error NotSettled();
    error NoBondFound();
    error AlreadyRefunded();
    error NothingToWithdraw();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidReport();
    error SolvencyViolation();

    /* ── Modifiers ──────────────────────────────────────────────── */

    modifier onlyAdmin() {
        _checkAdmin();
        _;
    }
    modifier onlyForwarder() {
        _checkForwarder();
        _;
    }

    function _checkAdmin() internal view {
        if (msg.sender != admin) revert OnlyAdmin();
    }

    function _checkForwarder() internal view {
        if (msg.sender != FORWARDER) revert OnlyForwarder();
    }

    /* ── Constructor ────────────────────────────────────────────── */

    constructor(
        IERC20 usdc_,
        address forwarder_
    ) Ownable(msg.sender) {
        USDC = usdc_;
        FORWARDER = forwarder_;
        admin = msg.sender;
    }

    /* ── Admin configuration (post-deploy) ──────────────────────── */

    function setRegistry(address registry_) external onlyOwner {
        if (registry_ == address(0)) revert ZeroAddress();
        registry = IAuctionRegistry(registry_);
        emit RegistryUpdated(registry_);
    }

    function setAdmin(address admin_) external onlyOwner {
        if (admin_ == address(0)) revert ZeroAddress();
        admin = admin_;
        emit AdminUpdated(admin_);
    }

    /// @notice Configure expected CRE workflow parameters (called after CRE registration)
    function setExpectedWorkflowId(bytes32 workflowId_) external onlyOwner {
        expectedWorkflowId = workflowId_;
    }

    function setExpectedWorkflowName(string calldata name_) external onlyOwner {
        expectedWorkflowName = name_;
    }

    function setExpectedAuthor(address author_) external onlyOwner {
        expectedAuthor = author_;
    }

    function configureCRE(bytes32 workflowId_, string calldata name_, address author_) external onlyOwner {
        expectedWorkflowId = workflowId_;
        expectedWorkflowName = name_;
        expectedAuthor = author_;
        emit CREConfigured(workflowId_, name_, author_);
    }

    /* ── Bond recording ─────────────────────────────────────────── */

    /// @notice Record a bond deposit (called by admin/platform after observing on-chain transfer)
    /// @param auctionId The auction this bond is for
    /// @param agentId ERC-8004 agent ID
    /// @param depositor Address that made the USDC transfer
    /// @param amount Bond amount in USDC
    /// @param txHash Transaction hash of the bond transfer (for idempotency)
    /// @param logIndex Log index within the tx (for idempotency)
    function recordBond(
        bytes32 auctionId,
        uint256 agentId,
        address depositor,
        uint256 amount,
        bytes32 txHash,
        uint256 logIndex
    ) external onlyAdmin {
        if (amount == 0) revert ZeroAmount();

        // Idempotency check: keccak256(txHash, logIndex)
        bytes32 idempotencyKey = keccak256(abi.encodePacked(txHash, logIndex));
        if (bondTxProcessed[idempotencyKey]) revert BondAlreadyProcessed();
        bondTxProcessed[idempotencyKey] = true;

        // One bond per agent per auction
        if (bonds[auctionId][agentId].amount > 0) revert BondAlreadyExists();

        bonds[auctionId][agentId] = BondRecord({
            depositor: depositor,
            amount: amount,
            refunded: false
        });
        totalBonded += amount;

        emit BondRecorded(auctionId, agentId, depositor, amount);
    }

    /* ── CRE Settlement (IReceiver) ─────────────────────────────── */

    /// @notice Called by KeystoneForwarder with CRE workflow report
    /// @dev Validates metadata then processes the settlement report.
    ///      Metadata layout (per Chainlink spec):
    ///        bytes32 workflowId | bytes10 workflowName | address workflowOwner | bytes2 reportId
    function onReport(bytes calldata metadata, bytes calldata report) external onlyForwarder {
        // Validate CRE metadata
        if (metadata.length < 64) revert InvalidReport();

        bytes32 workflowId = bytes32(metadata[0:32]);
        // workflowName is bytes10 at offset 32
        // workflowOwner is address at offset 42 (32+10)
        address workflowOwner = address(bytes20(metadata[42:62]));

        // Verify expected values (skip workflowId check if not configured)
        if (expectedWorkflowId != bytes32(0) && workflowId != expectedWorkflowId) revert InvalidReport();
        if (expectedAuthor != address(0) && workflowOwner != expectedAuthor) revert InvalidReport();

        _processReport(report);
    }

    /// @dev Decode and execute settlement: release winner bond, mark settled
    ///      Report encoding: abi.encode(auctionId, winnerAgentId, winnerWallet, amount)
    function _processReport(bytes calldata report) internal {
        (
            bytes32 auctionId,
            uint256 winnerAgentId,
            address winnerWallet,
            uint256 amount
        ) = abi.decode(report, (bytes32, uint256, address, uint256));

        if (auctionSettled[auctionId]) revert AlreadySettled();
        auctionSettled[auctionId] = true;

        // Release winner's bond to their withdrawable balance
        BondRecord storage winnerBond = bonds[auctionId][winnerAgentId];
        if (winnerBond.amount > 0) {
            uint256 releaseAmount = winnerBond.amount;
            winnerBond.refunded = true;
            totalBonded -= releaseAmount;
            withdrawable[winnerAgentId] += releaseAmount;
            totalWithdrawable += releaseAmount;
        }

        // Tell registry this auction is settled
        if (address(registry) != address(0)) {
            registry.markSettled(auctionId);
        }

        emit SettlementProcessed(auctionId, winnerAgentId, amount);
    }

    /* ── Refund (pull-based for non-winners) ────────────────────── */

    /// @notice Non-winners claim their bond refund after settlement
    function claimRefund(bytes32 auctionId, uint256 agentId) external nonReentrant {
        if (!auctionSettled[auctionId]) revert NotSettled();

        BondRecord storage bond = bonds[auctionId][agentId];
        if (bond.amount == 0) revert NoBondFound();
        if (bond.refunded) revert AlreadyRefunded();

        bond.refunded = true;
        uint256 refundAmount = bond.amount;
        totalBonded -= refundAmount;
        withdrawable[agentId] += refundAmount;
        totalWithdrawable += refundAmount;

        emit RefundClaimed(auctionId, agentId, refundAmount);
    }

    /* ── Withdraw ───────────────────────────────────────────────── */

    /// @notice Agent withdraws accumulated balance to a specified address
    function withdraw(uint256 agentId, address to) external nonReentrant {
        uint256 amount = withdrawable[agentId];
        if (amount == 0) revert NothingToWithdraw();

        withdrawable[agentId] = 0;
        totalWithdrawable -= amount;

        USDC.safeTransfer(to, amount);
        emit Withdrawn(agentId, to, amount);
    }

    /* ── Emergency admin refund ──────────────────────────────────── */

    /// @notice Emergency refund by admin (e.g., cancelled auction)
    function adminRefund(bytes32 auctionId, uint256 agentId) external onlyAdmin nonReentrant {
        BondRecord storage bond = bonds[auctionId][agentId];
        if (bond.amount == 0) revert NoBondFound();
        if (bond.refunded) revert AlreadyRefunded();

        bond.refunded = true;
        uint256 refundAmount = bond.amount;
        totalBonded -= refundAmount;

        USDC.safeTransfer(bond.depositor, refundAmount);
        emit AdminRefund(auctionId, agentId, refundAmount);
    }

    /* ── Views ──────────────────────────────────────────────────── */

    /// @notice Get bond amount for paymaster lookup
    function getBondAmount(bytes32 auctionId, uint256 agentId) external view returns (uint256) {
        return bonds[auctionId][agentId].amount;
    }

    /// @notice Solvency check: USDC balance >= totalBonded + totalWithdrawable
    function checkSolvency() external view returns (bool) {
        return USDC.balanceOf(address(this)) >= totalBonded + totalWithdrawable;
    }
}
