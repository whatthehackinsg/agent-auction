// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title AgentPrivacyRegistry
/// @notice Sidecar to ERC-8004 IdentityRegistry — stores ZK privacy commitments.
///         NOT the identity authority. Never used for settlement authorization.
///         The DO sequencer reads getRoot() to verify membership proof public inputs.
contract AgentPrivacyRegistry {
    struct Agent {
        bytes32 registrationCommit; // keccak256(agentSecret, capabilityMerkleRoot, salt)
        uint256 registeredAt;
        address controller;         // can update the commitment
    }

    mapping(uint256 => Agent) public agents; // agentId => Agent
    bytes32 public registryRoot;             // Merkle root of all commitments

    uint256 public agentCount;
    bytes32[] private commitments;           // ordered list for Merkle tree computation

    event AgentRegistered(uint256 indexed agentId, bytes32 commit, address controller);
    event CommitmentUpdated(uint256 indexed agentId, bytes32 newCommit);
    event RootUpdated(bytes32 newRoot);

    error AlreadyRegistered(uint256 agentId);
    error NotController(uint256 agentId);
    error NotRegistered(uint256 agentId);

    /// @notice Register an agent's privacy commitment
    /// @param agentId The ERC-8004 agent token ID
    /// @param commit keccak256(agentSecret, capabilityMerkleRoot, salt)
    function register(uint256 agentId, bytes32 commit) external {
        if (agents[agentId].registeredAt != 0) revert AlreadyRegistered(agentId);

        agents[agentId] = Agent({
            registrationCommit: commit,
            registeredAt: block.timestamp,
            controller: msg.sender
        });

        commitments.push(commit);
        agentCount++;

        emit AgentRegistered(agentId, commit, msg.sender);
        _updateRoot();
    }

    /// @notice Update an agent's commitment (e.g., capability rotation)
    /// @param agentId The ERC-8004 agent token ID
    /// @param newCommit New keccak256(agentSecret, capabilityMerkleRoot, salt)
    function updateCommitment(uint256 agentId, bytes32 newCommit) external {
        if (agents[agentId].registeredAt == 0) revert NotRegistered(agentId);
        if (agents[agentId].controller != msg.sender) revert NotController(agentId);

        agents[agentId].registrationCommit = newCommit;
        emit CommitmentUpdated(agentId, newCommit);
        // Note: updateCommitment does not update the commitments array or root
        // because the Merkle tree is append-only for simplicity in MVP.
        // The commitment stored in `agents` mapping is the source of truth
        // for individual agent queries. The Merkle root covers registration commits only.
    }

    /// @notice Get the current Merkle root of all registration commitments
    function getRoot() external view returns (bytes32) {
        return registryRoot;
    }

    /// @notice Get total number of registered agents
    function getAgentCount() external view returns (uint256) {
        return agentCount;
    }

    /// @dev Recompute Merkle root from commitments array (keccak256 binary tree)
    function _updateRoot() internal {
        uint256 n = commitments.length;
        if (n == 0) {
            registryRoot = bytes32(0);
            return;
        }

        bytes32[] memory layer = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            layer[i] = commitments[i];
        }

        while (n > 1) {
            uint256 nextN = (n + 1) / 2;
            bytes32[] memory nextLayer = new bytes32[](nextN);
            for (uint256 i = 0; i < n / 2; i++) {
                nextLayer[i] = keccak256(abi.encodePacked(layer[2 * i], layer[2 * i + 1]));
            }
            if (n % 2 == 1) {
                nextLayer[nextN - 1] = layer[n - 1];
            }
            layer = nextLayer;
            n = nextN;
        }

        registryRoot = layer[0];
        emit RootUpdated(registryRoot);
    }
}
