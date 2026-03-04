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
///         All-Poseidon: no keccak256 registration commits or Merkle trees.
contract AgentPrivacyRegistry {
    struct Agent {
        bytes32 capabilityPoseidonRoot; // Poseidon Merkle root of capability tree (circuit-native)
        bytes32 capabilityCommitment; // Poseidon(capabilityId, agentSecret) for Issue 6
        uint256 registeredAt;
        address controller; // can update Poseidon roots
    }

    IIdentityRegistry public immutable identityRegistry;

    mapping(uint256 => Agent) public agents; // agentId => Agent

    uint256 public agentCount;

    event AgentRegistered(uint256 indexed agentId, bytes32 poseidonRoot, address controller);

    error AlreadyRegistered(uint256 agentId);
    error NotOwner(uint256 agentId);

    constructor(address _identityRegistry) {
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    /// @notice Register an agent's Poseidon privacy commitment.
    ///         Caller must be the ERC-8004 owner of agentId.
    /// @param agentId        The ERC-8004 agent token ID
    /// @param poseidonRoot   Poseidon Merkle root of the agent's capability tree
    /// @param capCommitment  Poseidon(capabilityId, agentSecret) — optional, pass bytes32(0) to skip
    function register(uint256 agentId, bytes32 poseidonRoot, bytes32 capCommitment) external {
        // Issue 4: ownership check — only the ERC-8004 owner may register
        if (identityRegistry.ownerOf(agentId) != msg.sender) revert NotOwner(agentId);
        if (agents[agentId].registeredAt != 0) revert AlreadyRegistered(agentId);

        agents[agentId] = Agent({
            capabilityPoseidonRoot: poseidonRoot,
            capabilityCommitment: capCommitment,
            registeredAt: block.timestamp,
            controller: msg.sender
        });

        agentCount++;

        emit AgentRegistered(agentId, poseidonRoot, msg.sender);
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
}
