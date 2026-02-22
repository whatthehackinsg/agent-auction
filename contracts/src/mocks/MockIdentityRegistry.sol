// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockIdentityRegistry — Testnet ERC-8004 identity registry
/// @notice Simulates ERC-8004 ownerOf for AgentPaymaster integration testing.
///         NOT for production use.
contract MockIdentityRegistry {
    mapping(uint256 => address) private _owners;
    uint256 private _nextId = 1;

    event AgentRegistered(uint256 indexed agentId, address indexed owner);

    /// @notice Register a new agent identity, returns the agentId
    function register(address owner) external returns (uint256 agentId) {
        agentId = _nextId++;
        _owners[agentId] = owner;
        emit AgentRegistered(agentId, owner);
    }

    /// @notice Register with a specific agentId (for deterministic testing)
    function registerWithId(uint256 agentId, address owner) external {
        require(_owners[agentId] == address(0), "Already registered");
        _owners[agentId] = owner;
        if (agentId >= _nextId) {
            _nextId = agentId + 1;
        }
        emit AgentRegistered(agentId, owner);
    }

    /// @notice ERC-8004 compatible ownerOf
    function ownerOf(uint256 agentId) external view returns (address) {
        address owner = _owners[agentId];
        require(owner != address(0), "Agent not registered");
        return owner;
    }

    /// @notice Check if an agentId is registered
    function exists(uint256 agentId) external view returns (bool) {
        return _owners[agentId] != address(0);
    }

    /// @notice Get next available agentId
    function nextId() external view returns (uint256) {
        return _nextId;
    }
}
