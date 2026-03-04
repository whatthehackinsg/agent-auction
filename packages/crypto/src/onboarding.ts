/**
 * Agent onboarding: generate secrets, build capability tree,
 * register on AgentPrivacyRegistry, and save private state
 * needed for later ZK proof generation.
 *
 * Usage:
 *   PRIVATE_KEY=0x... PRIVACY_REGISTRY=0x... npx tsx scripts/onboard-agent.ts
 */
import { ethers } from "ethers";
import { poseidonHash } from "./poseidon-chain.js";

// ---------- Types ----------

export interface AgentCapability {
  capabilityId: bigint;
}

export interface AgentPrivateState {
  agentId: bigint;
  agentSecret: bigint;
  salt: bigint;
  capabilities: AgentCapability[];
  /** Poseidon leaf hashes (one per capability, indexed by leafIndex) */
  leafHashes: bigint[];
  /** Poseidon Merkle root of the capability tree */
  capabilityMerkleRoot: bigint;
  /** keccak256(agentSecret, capabilityMerkleRoot, salt) — stored on-chain */
  registrationCommit: string;
}

export interface MerkleProof {
  pathElements: bigint[];
  pathIndices: number[];
  root: bigint;
}

// ---------- Constants ----------

const PRIVACY_REGISTRY_ABI = [
  "function register(uint256 agentId, bytes32 commit, bytes32 poseidonRoot, bytes32 capCommitment) external",
  "function getRoot() external view returns (bytes32)",
  "function getAgentPoseidonRoot(uint256 agentId) external view returns (bytes32)",
  "function getAgentCapabilityCommitment(uint256 agentId) external view returns (bytes32)",
  "function getAgentCount() external view returns (uint256)",
  "function agents(uint256) external view returns (bytes32 registrationCommit, bytes32 capabilityPoseidonRoot, bytes32 capabilityCommitment, uint256 registeredAt, address controller)",
] as const;

/** How many levels for the off-chain Poseidon Merkle tree (matches circuit) */
const MERKLE_LEVELS = 20;

// ---------- Core Functions ----------

/** Generate a cryptographically random 256-bit secret as bigint */
export function generateSecret(): bigint {
  const bytes = ethers.randomBytes(32);
  return BigInt("0x" + Buffer.from(bytes).toString("hex"));
}

/**
 * Compute a Poseidon leaf: Poseidon(capabilityId, agentSecret, leafIndex)
 * Must match RegistryMembership.circom line 29-33.
 */
export async function computeLeaf(
  capabilityId: bigint,
  agentSecret: bigint,
  leafIndex: bigint
): Promise<bigint> {
  return poseidonHash([capabilityId, agentSecret, leafIndex]);
}

/**
 * Precompute the hash of an empty subtree at each level.
 * zeroHashes[0] = 0 (empty leaf)
 * zeroHashes[i] = Poseidon(zeroHashes[i-1], zeroHashes[i-1])
 */
async function computeZeroHashes(levels: number): Promise<bigint[]> {
  const zeroHashes: bigint[] = [0n];
  for (let i = 1; i <= levels; i++) {
    zeroHashes.push(await poseidonHash([zeroHashes[i - 1], zeroHashes[i - 1]]));
  }
  return zeroHashes;
}

/**
 * Build a sparse Poseidon Merkle tree from leaf hashes.
 * Only materializes nodes that differ from the "all-zero" subtree,
 * making it efficient even for 2^20 trees with a handful of leaves.
 *
 * Uses Poseidon(left, right) for internal nodes — matches circuit.
 */
export async function buildPoseidonMerkleTree(
  leaves: bigint[],
  levels: number = MERKLE_LEVELS
): Promise<{ root: bigint; layers: bigint[][] }> {
  const zeroHashes = await computeZeroHashes(levels);

  // Only store populated entries in sparse arrays
  const layers: bigint[][] = [];

  // Layer 0 = leaves (sparse: only indices with real data)
  const leafLayer: bigint[] = [];
  for (let i = 0; i < leaves.length; i++) {
    leafLayer[i] = leaves[i];
  }
  layers.push(leafLayer);

  // Build up: at each level, only compute nodes whose children aren't both zero
  let prevLayer = leafLayer;
  for (let level = 0; level < levels; level++) {
    const nextLayer: bigint[] = [];
    // Find all parent indices that have at least one non-zero child
    const parentIndices = new Set<number>();
    for (const idxStr of Object.keys(prevLayer)) {
      parentIndices.add(Math.floor(Number(idxStr) / 2));
    }

    for (const parentIdx of parentIndices) {
      const leftIdx = parentIdx * 2;
      const rightIdx = parentIdx * 2 + 1;
      const left = prevLayer[leftIdx] ?? zeroHashes[level];
      const right = prevLayer[rightIdx] ?? zeroHashes[level];
      nextLayer[parentIdx] = await poseidonHash([left, right]);
    }

    layers.push(nextLayer);
    prevLayer = nextLayer;
  }

  const root = layers[levels]?.[0] ?? zeroHashes[levels];
  return { root, layers, zeroHashes } as any;
}

/**
 * Generate a Merkle proof for a specific leaf index.
 * Uses zeroHashes for missing siblings in the sparse tree.
 */
export function getMerkleProof(
  leafIndex: number,
  layers: bigint[][],
  zeroHashes?: bigint[]
): MerkleProof {
  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];
  let idx = leafIndex;

  for (let i = 0; i < layers.length - 1; i++) {
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    const defaultZero = zeroHashes ? zeroHashes[i] : 0n;

    pathElements.push(layers[i][siblingIdx] ?? defaultZero);
    pathIndices.push(isRight ? 1 : 0);

    idx = Math.floor(idx / 2);
  }

  const levels = layers.length - 1;
  const root = layers[levels]?.[0] ?? (zeroHashes ? zeroHashes[levels] : 0n);

  return {
    pathElements,
    pathIndices,
    root,
  };
}

/**
 * Compute the on-chain registration commitment.
 * registrationCommit = keccak256(abi.encodePacked(agentSecret, capabilityMerkleRoot, salt))
 */
export function computeRegistrationCommit(
  agentSecret: bigint,
  capabilityMerkleRoot: bigint,
  salt: bigint
): string {
  return ethers.solidityPackedKeccak256(
    ["uint256", "uint256", "uint256"],
    [agentSecret, capabilityMerkleRoot, salt]
  );
}

/**
 * Full onboarding flow: generate keys, build tree, compute commitment.
 * Does NOT send any transaction — returns the private state for the caller to register.
 */
export async function prepareOnboarding(
  agentId: bigint,
  capabilityIds: bigint[]
): Promise<AgentPrivateState> {
  const agentSecret = generateSecret();
  const salt = generateSecret();

  // Compute leaf hashes
  const leafHashes: bigint[] = [];
  for (let i = 0; i < capabilityIds.length; i++) {
    const leaf = await computeLeaf(capabilityIds[i], agentSecret, BigInt(i));
    leafHashes.push(leaf);
  }

  // Build Poseidon Merkle tree
  const { root: capabilityMerkleRoot } = await buildPoseidonMerkleTree(leafHashes);

  // Compute on-chain commitment
  const registrationCommit = computeRegistrationCommit(
    agentSecret,
    capabilityMerkleRoot,
    salt
  );

  return {
    agentId,
    agentSecret,
    salt,
    capabilities: capabilityIds.map((id) => ({ capabilityId: id })),
    leafHashes,
    capabilityMerkleRoot,
    registrationCommit,
  };
}

/**
 * Register an agent on the AgentPrivacyRegistry contract.
 *
 * Passes the Poseidon capability tree root and capability commitment on-chain
 * so the engine can cross-check ZK membership proof public signals.
 */
export async function registerOnChain(
  privateState: AgentPrivateState,
  registryAddress: string,
  signer: ethers.Signer
): Promise<ethers.TransactionReceipt> {
  const registry = new ethers.Contract(
    registryAddress,
    PRIVACY_REGISTRY_ABI,
    signer
  );

  // Convert Poseidon root (bigint) to bytes32 hex
  const poseidonRootHex = ethers.zeroPadValue(
    ethers.toBeHex(privateState.capabilityMerkleRoot),
    32
  );

  // Compute capabilityCommitment = Poseidon(capabilityId, agentSecret) for first capability
  const { poseidonHash } = await import("./poseidon-chain.js");
  const capCommitmentBig = await poseidonHash([
    privateState.capabilities[0].capabilityId,
    privateState.agentSecret,
  ]);
  const capCommitmentHex = ethers.zeroPadValue(
    ethers.toBeHex(capCommitmentBig),
    32
  );

  const tx = await registry.register(
    privateState.agentId,
    privateState.registrationCommit,
    poseidonRootHex,
    capCommitmentHex,
  );
  const receipt = await tx.wait();
  return receipt;
}

/**
 * Read the current registry root from the contract.
 */
export async function readRegistryRoot(
  registryAddress: string,
  provider: ethers.Provider
): Promise<string> {
  const registry = new ethers.Contract(
    registryAddress,
    PRIVACY_REGISTRY_ABI,
    provider
  );
  return registry.getRoot();
}

export { MERKLE_LEVELS, PRIVACY_REGISTRY_ABI };
