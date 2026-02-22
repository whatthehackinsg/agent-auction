// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReceiver} from "@chainlink/contracts/src/v0.8/keystone/interfaces/IReceiver.sol";

/// @title MockKeystoneForwarder — Test helper for local CRE settlement
/// @notice Simulates KeystoneForwarder by calling onReport() directly on target.
///         Used by WS-2 Foundry tests and WS-3 local development.
/// @dev Constructs metadata matching Chainlink's expected layout:
///      bytes32 workflowId | bytes10 workflowName | address workflowOwner | bytes2 reportId
contract MockKeystoneForwarder {
    /* ── Configurable metadata ──────────────────────────────────── */

    bytes32 public workflowId;
    bytes10 public workflowName;
    address public workflowOwner;
    bytes2 public reportId;

    /* ── Events ─────────────────────────────────────────────────── */

    event ReportForwarded(address indexed target, bytes32 workflowId, bool success);

    /* ── Errors ─────────────────────────────────────────────────── */

    error ForwardFailed(bytes reason);

    /* ── Constructor ────────────────────────────────────────────── */

    constructor(bytes32 workflowId_, bytes10 workflowName_, address workflowOwner_) {
        workflowId = workflowId_;
        workflowName = workflowName_;
        workflowOwner = workflowOwner_;
        reportId = bytes2(0x0001);
    }

    /* ── Forward report ─────────────────────────────────────────── */

    /// @notice Forward a report to a target IReceiver contract
    /// @param target The contract that implements IReceiver (e.g., AuctionEscrow)
    /// @param report The encoded report data
    function forwardReport(address target, bytes calldata report) external {
        bytes memory metadata = _buildMetadata();
        IReceiver(target).onReport(metadata, report);
        emit ReportForwarded(target, workflowId, true);
    }

    /// @notice Forward with custom metadata (for testing edge cases)
    function forwardReportWithMetadata(address target, bytes calldata metadata, bytes calldata report) external {
        IReceiver(target).onReport(metadata, report);
        emit ReportForwarded(target, workflowId, true);
    }

    /* ── Configuration ──────────────────────────────────────────── */

    function setWorkflowId(bytes32 workflowId_) external {
        workflowId = workflowId_;
    }

    function setWorkflowName(bytes10 workflowName_) external {
        workflowName = workflowName_;
    }

    function setWorkflowOwner(address workflowOwner_) external {
        workflowOwner = workflowOwner_;
    }

    function setReportId(bytes2 reportId_) external {
        reportId = reportId_;
    }

    /* ── Internal ───────────────────────────────────────────────── */

    /// @dev Build metadata matching Chainlink KeystoneForwarder layout:
    ///      [0:32]  bytes32 workflowId
    ///      [32:42] bytes10 workflowName
    ///      [42:62] address workflowOwner (as bytes20)
    ///      [62:64] bytes2  reportId
    function _buildMetadata() internal view returns (bytes memory) {
        return abi.encodePacked(workflowId, workflowName, workflowOwner, reportId);
    }
}
