// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockEntryPoint — Minimal EIP-4337 EntryPoint for local testing
/// @notice Implements supportsInterface + fallback to satisfy BasePaymaster construction.
///         NOT for production use — use the canonical EntryPoint v0.7 on real networks.
contract MockEntryPoint {
    mapping(address => uint256) public deposits;
    mapping(address => uint256) public stakes;

    function supportsInterface(bytes4) external pure returns (bool) {
        return true;
    }

    /// @notice Track deposits (simulates IStakeManager.depositTo)
    function depositTo(address account) external payable {
        deposits[account] += msg.value;
    }

    /// @notice Get deposit info (minimal IStakeManager compatibility)
    function getDepositInfo(address account)
        external
        view
        returns (uint256 deposit, bool staked, uint112 stake, uint32 unstakeDelaySec, uint48 withdrawTime)
    {
        deposit = deposits[account];
        stake = uint112(stakes[account]);
        staked = stake > 0;
        unstakeDelaySec = 0;
        withdrawTime = 0;
    }

    /// @notice Accept ETH for staking (simulates IStakeManager.addStake)
    function addStake(uint32) external payable {
        stakes[msg.sender] += msg.value;
    }

    /// @notice Accept arbitrary calls (BasePaymaster may call other IEntryPoint methods)
    fallback() external payable {}
    receive() external payable {}
}
