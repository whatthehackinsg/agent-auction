// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BasePaymaster} from "@account-abstraction/core/BasePaymaster.sol";
import {IEntryPoint} from "@account-abstraction/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/interfaces/PackedUserOperation.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal interface for ERC-8004 identity registry (ownerOf check only)
interface IERC8004Registry {
    function ownerOf(uint256 agentId) external view returns (address);
}

/// @notice Minimal interface for AuctionEscrow bond lookup
interface IAuctionEscrowBonds {
    function getBondAmount(bytes32 auctionId, uint256 agentId) external view returns (uint256);
}

/// @title AgentPaymaster — EIP-4337 Paymaster for agent gas sponsorship
/// @notice Sponsors gas for registered ERC-8004 agents. Method-based gating:
///         - USDC.transfer to escrow (bond deposit): only requires ERC-8004 registration
///         - Other ops: requires existing bond in escrow
/// @dev Extends BasePaymaster (inherits Ownable, stake/deposit helpers).
///      MVP postOp: log gas cost only, no escrow deduction.
contract AgentPaymaster is BasePaymaster {
    /* ── Immutables ─────────────────────────────────────────────── */

    IERC20 public immutable USDC;
    IERC8004Registry public immutable IDENTITY_REGISTRY;

    /* ── Mutable state ──────────────────────────────────────────── */

    IAuctionEscrowBonds public escrow;

    /// @notice Mapping from AgentAccount address → ERC-8004 agentId (set by admin)
    mapping(address => uint256) public accountToAgentId;

    /* ── Events ─────────────────────────────────────────────────── */

    event EscrowUpdated(address indexed oldEscrow, address indexed newEscrow);
    event AgentRegistered(address indexed account, uint256 indexed agentId);
    event GasSponsored(address indexed account, uint256 actualGasCost);

    /* ── Errors ─────────────────────────────────────────────────── */

    error EscrowNotSet();
    error TransferMustTargetEscrow();
    error AgentNotRegistered();
    error InsufficientBond();
    error UnsupportedOperation();
    error AgentIdNotMapped();

    /* ── Constructor ────────────────────────────────────────────── */

    constructor(
        IEntryPoint entryPoint_,
        IERC20 usdc_,
        IERC8004Registry identityRegistry_
    ) BasePaymaster(entryPoint_) {
        USDC = usdc_;
        IDENTITY_REGISTRY = identityRegistry_;
    }

    /* ── Admin setters ──────────────────────────────────────────── */

    /// @notice Set the escrow contract address (can be updated by owner)
    function setEscrow(address escrow_) external onlyOwner {
        address old = address(escrow);
        escrow = IAuctionEscrowBonds(escrow_);
        emit EscrowUpdated(old, escrow_);
    }

    /// @notice Register mapping from AgentAccount → agentId (batch-friendly)
    function registerAgent(address account, uint256 agentId) external onlyOwner {
        accountToAgentId[account] = agentId;
        emit AgentRegistered(account, agentId);
    }

    /* ── Core: validatePaymasterUserOp ──────────────────────────── */

    /// @dev Method-based gating per spec Section 3:
    ///      - Bond deposit (USDC.transfer → escrow): ERC-8004 registration check only
    ///      - Other ops: require existing bond
    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32, /* userOpHash */
        uint256 /* maxCost */
    ) internal view override returns (bytes memory context, uint256 validationData) {
        // userOp.callData is AgentAccount.execute(target, value, data) or similar
        if (userOp.callData.length < 4) revert UnsupportedOperation();
        bytes4 outerSelector = bytes4(userOp.callData[:4]);
        // Only sponsor AgentAccount.execute() calls
        // execute(address,uint256,bytes) selector = 0xb61d27f6
        if (outerSelector != bytes4(0xb61d27f6)) revert UnsupportedOperation();
        (address target,, bytes memory innerData) = abi.decode(userOp.callData[4:], (address, uint256, bytes));
        if (innerData.length < 4) revert UnsupportedOperation();
        bytes4 innerSelector = _extractSelector(innerData);
        // Resolve agent identity (used in both paths)
        uint256 agentId = accountToAgentId[userOp.sender];
        if (agentId == 0) revert AgentIdNotMapped();
        // BOND DEPOSIT PATH: USDC.transfer(to, amount) → escrow
        // transfer(address,uint256) selector = 0xa9059cbb
        if (target == address(USDC) && innerSelector == bytes4(0xa9059cbb)) {
            if (address(escrow) == address(0)) revert EscrowNotSet();
            (address to,) = abi.decode(_sliceBytes(innerData, 4), (address, uint256));
            if (to != address(escrow)) revert TransferMustTargetEscrow();
            if (IDENTITY_REGISTRY.ownerOf(agentId) == address(0)) revert AgentNotRegistered();
            return (abi.encode(userOp.sender), 0); // SIG_VALIDATION_SUCCESS = 0
        }
        // ALL OTHER OPS: require existing bond
        // For non-bond ops, we need the auctionId from paymasterAndData
        // paymasterAndData layout: [20 bytes paymaster addr][16 bytes gas limits][paymaster data...]
        // PAYMASTER_DATA_OFFSET = 52 in v0.7 BasePaymaster
        if (userOp.paymasterAndData.length < PAYMASTER_DATA_OFFSET + 32) revert UnsupportedOperation();

        bytes32 auctionId = bytes32(userOp.paymasterAndData[PAYMASTER_DATA_OFFSET:PAYMASTER_DATA_OFFSET + 32]);
        uint256 bondAmount = escrow.getBondAmount(auctionId, agentId);
        if (bondAmount == 0) revert InsufficientBond();
        return (abi.encode(userOp.sender), 0); // SIG_VALIDATION_SUCCESS = 0
    }

    /* ── Core: postOp (MVP: log only) ───────────────────────────── */

    /// @dev MVP: emit gas cost for analytics. P1: deduct from escrow balance.
    function _postOp(
        PostOpMode, /* mode */
        bytes calldata context,
        uint256 actualGasCost,
        uint256 /* actualUserOpFeePerGas */
    ) internal override {
        address account = abi.decode(context, (address));
        emit GasSponsored(account, actualGasCost);
    }

    /* ── Helpers ─────────────────────────────────────────────────── */

    function _extractSelector(bytes memory data) internal pure returns (bytes4 sel) {
        assembly {
            sel := mload(add(data, 32))
        }
    }

    function _sliceBytes(bytes memory data, uint256 start) internal pure returns (bytes memory) {
        require(data.length >= start, "slice out of bounds");
        bytes memory result = new bytes(data.length - start);
        for (uint256 i = 0; i < result.length; i++) {
            result[i] = data[i + start];
        }
        return result;
    }
}
