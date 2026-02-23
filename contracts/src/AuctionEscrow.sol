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
    function isCancelled(bytes32 auctionId) external view returns (bool);
}

/// @notice Minimal interface for ERC-8004 identity registry ownership check
interface IERC8004RegistryEscrow {
    function ownerOf(uint256 agentId) external view returns (address);
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
    bytes10 public expectedWorkflowName; // FIX: changed from string to bytes10 (CRE metadata native type)
    address public expectedAuthor;
    bool public isCREConfigured;

    /* ── External contracts ─────────────────────────────────────── */

    IAuctionRegistry public registry;
    IERC8004RegistryEscrow public identityRegistry;
    address public admin; // Platform admin that can call recordBond

    /* ── Bond storage ───────────────────────────────────────────── */

    /// @dev auctionId → agentId → BondRecord
    mapping(bytes32 => mapping(uint256 => BondRecord)) public bonds;

    /// @dev Idempotency: keccak256(txHash, logIndex) → recorded
    mapping(bytes32 => bool) public bondTxProcessed;

    /// @dev agentId → withdrawable balance (after settlement/refund)
    mapping(uint256 => uint256) public withdrawable;

    /// @dev agentId → designated withdrawal address (set by CRE report for winners, or bond depositor for losers)
    mapping(uint256 => address) public designatedWallet;

    /// @dev Solvency tracking
    uint256 public totalBonded;
    uint256 public totalWithdrawable;

    /// @dev auctionId → settled flag
    mapping(bytes32 => bool) public auctionSettled;

    /* ── Events ─────────────────────────────────────────────────── */

    event BondRecorded(bytes32 indexed auctionId, uint256 indexed agentId, address depositor, uint256 amount);
    event SettlementProcessed(
        bytes32 indexed auctionId, uint256 indexed winnerAgentId, address winnerWallet, uint256 amount
    );
    event RefundClaimed(bytes32 indexed auctionId, uint256 indexed agentId, uint256 amount);
    event Withdrawn(uint256 indexed agentId, address to, uint256 amount);
    event AdminRefund(bytes32 indexed auctionId, uint256 indexed agentId, uint256 amount);
    event RegistryUpdated(address indexed registry);
    event IdentityRegistryUpdated(address indexed identityRegistry);
    event AdminUpdated(address indexed admin);
    event CREConfigured(bytes32 workflowId, bytes10 workflowName, address author);

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
    error CRENotConfigured();
    error InvalidCREConfig();
    error SolvencyViolation();
    error UnauthorizedWithdraw();
    error DesignatedWalletConflict(); // FIX: new error for cross-auction wallet misrouting

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

    constructor(IERC20 usdc_, address forwarder_) Ownable(msg.sender) {
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

    function setIdentityRegistry(address identityRegistry_) external onlyOwner {
        if (identityRegistry_ == address(0)) revert ZeroAddress();
        identityRegistry = IERC8004RegistryEscrow(identityRegistry_);
        emit IdentityRegistryUpdated(identityRegistry_);
    }

    function setAdmin(address admin_) external onlyOwner {
        if (admin_ == address(0)) revert ZeroAddress();
        admin = admin_;
        emit AdminUpdated(admin_);
    }

    /// @notice Configure expected CRE workflow parameters (called after CRE registration)
    function setExpectedWorkflowId(bytes32 workflowId_) external onlyOwner {
        if (workflowId_ == bytes32(0)) revert InvalidCREConfig();
        expectedWorkflowId = workflowId_;
        _setCREConfigured();
    }

    function setExpectedWorkflowName(bytes10 name_) external onlyOwner {
        if (name_ == bytes10(0)) revert InvalidCREConfig();
        expectedWorkflowName = name_;
        _setCREConfigured();
    }

    function setExpectedAuthor(address author_) external onlyOwner {
        if (author_ == address(0)) revert InvalidCREConfig();
        expectedAuthor = author_;
        _setCREConfigured();
    }

    function configureCRE(bytes32 workflowId_, bytes10 name_, address author_) external onlyOwner {
        if (workflowId_ == bytes32(0) || name_ == bytes10(0) || author_ == address(0)) {
            revert InvalidCREConfig();
        }
        expectedWorkflowId = workflowId_;
        expectedWorkflowName = name_;
        expectedAuthor = author_;
        isCREConfigured = true;
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
        if (depositor == address(0)) revert ZeroAddress(); // FIX: validate depositor

        // Idempotency check: keccak256(txHash, logIndex)
        bytes32 idempotencyKey = keccak256(abi.encodePacked(txHash, logIndex));
        if (bondTxProcessed[idempotencyKey]) revert BondAlreadyProcessed();
        bondTxProcessed[idempotencyKey] = true;

        // One bond per agent per auction
        if (bonds[auctionId][agentId].amount > 0) revert BondAlreadyExists();

        bonds[auctionId][agentId] = BondRecord({depositor: depositor, amount: amount, refunded: false});
        totalBonded += amount;

        // FIX: Enforce solvency invariant after recording
        if (USDC.balanceOf(address(this)) < totalBonded + totalWithdrawable) revert SolvencyViolation();

        emit BondRecorded(auctionId, agentId, depositor, amount);
    }

    /* ── CRE Settlement (IReceiver) ─────────────────────────────── */

    /// @notice Called by KeystoneForwarder with CRE workflow report
    /// @dev Validates metadata then processes the settlement report.
    ///      Metadata layout (per Chainlink spec):
    ///        bytes32 workflowId | bytes10 workflowName | address workflowOwner | bytes2 reportId
    function onReport(bytes calldata metadata, bytes calldata report) external onlyForwarder nonReentrant {
        if (!isCREConfigured) revert CRENotConfigured();

        // Validate CRE metadata
        if (metadata.length < 64) revert InvalidReport();

        bytes32 workflowId = bytes32(metadata[0:32]);
        // FIX: Parse and validate workflowName from metadata (bytes10 at offset 32)
        bytes10 workflowName = bytes10(metadata[32:42]);
        // workflowOwner is address at offset 42 (32+10)
        address workflowOwner = address(bytes20(metadata[42:62]));

        // Verify expected values
        if (workflowId != expectedWorkflowId) revert InvalidReport();
        if (workflowName != expectedWorkflowName) revert InvalidReport();
        if (workflowOwner != expectedAuthor) revert InvalidReport();

        _processReport(report);
    }

    function _setCREConfigured() internal {
        isCREConfigured =
            expectedWorkflowId != bytes32(0)
                && expectedWorkflowName != bytes10(0)
                && expectedAuthor != address(0);
    }

    /// @dev Decode and execute settlement: release winner bond, mark settled
    ///      Report encoding: abi.encode(auctionId, winnerAgentId, winnerWallet, amount)
    ///      FIX: designatedWallet conflict detection (revert if different address already set)
    function _processReport(bytes calldata report) internal {
        (bytes32 auctionId, uint256 winnerAgentId, address winnerWallet, uint256 amount) =
            abi.decode(report, (bytes32, uint256, address, uint256));

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

            // FIX: Conflict detection — revert if designated wallet already set to a DIFFERENT address
            if (designatedWallet[winnerAgentId] != address(0) && designatedWallet[winnerAgentId] != winnerWallet) {
                revert DesignatedWalletConflict();
            }
            designatedWallet[winnerAgentId] = winnerWallet;
        }

        // Tell registry this auction is settled
        if (address(registry) != address(0)) {
            registry.markSettled(auctionId);
        }

        emit SettlementProcessed(auctionId, winnerAgentId, winnerWallet, amount);
    }

    /* ── Refund (pull-based for non-winners) ────────────────────── */

    /// @notice Non-winners claim their bond refund after settlement or cancellation
    /// @dev Permissionless: anyone can trigger the refund claim for any agent.
    ///      This is safe because funds only move to withdrawable[agentId], not out.
    ///      The withdraw() function enforces authorization on actual USDC transfers.
    ///      FIX: Also allows refund for cancelled auctions (via registry.isCancelled).
    function claimRefund(bytes32 auctionId, uint256 agentId) external nonReentrant {
        // FIX: Allow refund if auction is settled OR cancelled
        if (!auctionSettled[auctionId]) {
            if (address(registry) == address(0) || !registry.isCancelled(auctionId)) {
                revert NotSettled();
            }
        }

        BondRecord storage bond = bonds[auctionId][agentId];
        if (bond.amount == 0) revert NoBondFound();
        if (bond.refunded) revert AlreadyRefunded();

        bond.refunded = true;
        uint256 refundAmount = bond.amount;
        totalBonded -= refundAmount;
        withdrawable[agentId] += refundAmount;
        totalWithdrawable += refundAmount;

        // FIX: Conflict detection for designated wallet (same as _processReport)
        if (designatedWallet[agentId] != address(0) && designatedWallet[agentId] != bond.depositor) {
            revert DesignatedWalletConflict();
        }
        designatedWallet[agentId] = bond.depositor;

        emit RefundClaimed(auctionId, agentId, refundAmount);
    }

    /* ── Withdraw ───────────────────────────────────────────────── */

    /// @notice Agent withdraws accumulated balance to the designated address
    /// @dev Authorization: caller must be the agent's ERC-8004 owner OR the admin.
    ///      Funds always go to the designated wallet (set by CRE report or bond depositor).
    ///      FIX: try/catch on ownerOf so admin can still withdraw for unregistered agents.
    function withdraw(uint256 agentId) external nonReentrant {
        uint256 amount = withdrawable[agentId];
        if (amount == 0) revert NothingToWithdraw();

        // FIX: Wrap ownerOf in try/catch — if registry reverts (e.g., agent burned),
        //      admin can still process the withdrawal.
        if (address(identityRegistry) != address(0)) {
            bool isOwner = false;
            try identityRegistry.ownerOf(agentId) returns (address agentOwner) {
                isOwner = (msg.sender == agentOwner);
            } catch {
                // ownerOf reverted — agent may not exist; only admin can withdraw
            }
            if (!isOwner && msg.sender != admin) {
                revert UnauthorizedWithdraw();
            }
        } else {
            // If no identity registry set, only admin can withdraw (safe fallback)
            if (msg.sender != admin) revert UnauthorizedWithdraw();
        }

        address to = designatedWallet[agentId];
        if (to == address(0)) revert ZeroAddress();

        withdrawable[agentId] = 0;
        totalWithdrawable -= amount;

        // Clear designated wallet after withdrawal
        designatedWallet[agentId] = address(0);

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
    /// @dev FIX: Returns 0 if bond has been refunded — prevents paymaster from sponsoring
    ///      ops for agents whose bonds have already been released.
    function getBondAmount(bytes32 auctionId, uint256 agentId) external view returns (uint256) {
        BondRecord storage bond = bonds[auctionId][agentId];
        if (bond.refunded) return 0;
        return bond.amount;
    }

    /// @notice Solvency check: USDC balance >= totalBonded + totalWithdrawable
    function checkSolvency() external view returns (bool) {
        return USDC.balanceOf(address(this)) >= totalBonded + totalWithdrawable;
    }

    /// @notice Get the designated withdrawal wallet for an agent
    function getDesignatedWallet(uint256 agentId) external view returns (address) {
        return designatedWallet[agentId];
    }
}
