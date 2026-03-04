// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal interface for the ERC-8004 identity registry.
interface IIdentityRegistry {
    function ownerOf(uint256 agentId) external view returns (address);
}

/// @title AgentPrivacyRegistry
/// @notice Sidecar to ERC-8004 IdentityRegistry — stores ZK privacy commitments.
///         NOT the identity authority. Never used for settlement authorization.
///         The DO sequencer reads getAgentPoseidonRoot() per-agent to verify
///         membership proof public inputs (Phase 3 fix: per-agent Poseidon root).
contract AgentPrivacyRegistry {
    struct Agent {
        bytes32 registrationCommit;     // keccak256(agentSecret, capabilityMerkleRoot, salt)
        bytes32 capabilityPoseidonRoot; // Poseidon Merkle root of capability tree (circuit-native)
        bytes32 capabilityCommitment;   // Poseidon(capabilityId, agentSecret) for Issue 6
        uint256 registeredAt;
        address controller;             // can update the commitment
    }

    IIdentityRegistry public immutable identityRegistry;

    mapping(uint256 => Agent) public agents; // agentId => Agent
    bytes32 public registryRoot;             // keccak256 Merkle root of all registration commits

    uint256 public agentCount;
    bytes32[] private commitments;           // ordered list for keccak256 Merkle tree computation

    event AgentRegistered(uint256 indexed agentId, bytes32 commit, bytes32 poseidonRoot, address controller);
    event CommitmentUpdated(uint256 indexed agentId, bytes32 newCommit);
    event RootUpdated(bytes32 newRoot);

    error AlreadyRegistered(uint256 agentId);
    error NotController(uint256 agentId);
    error NotRegistered(uint256 agentId);
    error NotOwner(uint256 agentId);

    constructor(address _identityRegistry) {
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    /// @notice Register an agent's privacy commitment.
    ///         Caller must be the ERC-8004 owner of agentId.
    /// @param agentId        The ERC-8004 agent token ID
    /// @param commit         keccak256(agentSecret, capabilityMerkleRoot, salt)
    /// @param poseidonRoot   Poseidon Merkle root of the agent's capability tree
    /// @param capCommitment  Poseidon(capabilityId, agentSecret) — optional, pass bytes32(0) to skip
    function register(
        uint256 agentId,
        bytes32 commit,
        bytes32 poseidonRoot,
        bytes32 capCommitment
    ) external {
        // Issue 4: ownership check — only the ERC-8004 owner may register
        if (identityRegistry.ownerOf(agentId) != msg.sender) revert NotOwner(agentId);
        if (agents[agentId].registeredAt != 0) revert AlreadyRegistered(agentId);

        agents[agentId] = Agent({
            registrationCommit: commit,
            capabilityPoseidonRoot: poseidonRoot,
            capabilityCommitment: capCommitment,
            registeredAt: block.timestamp,
            controller: msg.sender
        });

        commitments.push(commit);
        agentCount++;

        emit AgentRegistered(agentId, commit, poseidonRoot, msg.sender);
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
    }

    /// @notice Get the current keccak256 Merkle root of all registration commitments
    function getRoot() external view returns (bytes32) {
        return registryRoot;
    }

    /// @notice Get the per-agent Poseidon Merkle root of the capability tree.
    ///         The engine uses this to cross-check ZK membership proof registryRoot.
    function getAgentPoseidonRoot(uint256 agentId) external view returns (bytes32) {
        return agents[agentId].capabilityPoseidonRoot;
    }

    /// @notice Get the per-agent capability commitment Poseidon(capabilityId, agentSecret).
    ///         The engine uses this to cross-check ZK membership proof capabilityCommitment.
    function getAgentCapabilityCommitment(uint256 agentId) external view returns (bytes32) {
        return agents[agentId].capabilityCommitment;
    }

    /// @notice Get total number of registered agents
    function getAgentCount() external view returns (uint256) {
        return agentCount;
    }

    /// @dev Recompute keccak256 Merkle root from commitments array
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
