// Poseidon hashing & event chain
export {
  getPoseidon,
  toFr,
  bytesToFr,
  frToBytes,
  poseidonHash,
  computePayloadHash,
  computeEventHash,
  F_MODULUS,
} from "./poseidon-chain.js";

// Nullifier derivation
export {
  deriveNullifier,
  deriveNullifierBigInt,
  ActionType,
  type ActionTypeValue,
} from "./nullifier.js";

// ZK proof verification
export {
  verifyMembershipProof,
  verifyBidRangeProof,
  getMembershipVKey,
  getBidRangeVKey,
  type Groth16Proof,
} from "./snarkjs-verify.js";

// EIP-712 typed data
export {
  hashTypedData,
  encodeTypedData,
  verifyEIP712Signature,
  isValidEIP712Signature,
  TYPED_DATA_TYPES,
  DEFAULT_DOMAIN,
  type EIP712Domain,
  type SpeechActType,
} from "./eip712-typed-data.js";

// Replay bundle serialization
export {
  serializeReplayBundle,
  computeContentHash,
  computeContentHashBytes,
  parseActionToken,
  ACTION_TOKENS,
  type AuctionEvent,
} from "./replay-bundle.js";

// Proof generation (agent-side SDK)
export {
  generateMembershipProof,
  generateBidRangeProof,
  computeBidCommitment,
  computeCapabilityCommitment,
  computeLeafHash,
} from "./proof-generator.js";

// Agent onboarding
export {
  generateSecret,
  computeLeaf,
  buildPoseidonMerkleTree,
  getMerkleProof,
  computeRegistrationCommit,
  prepareOnboarding,
  registerOnChain,
  readRegistryRoot,
  MERKLE_LEVELS,
  type AgentCapability,
  type AgentPrivateState,
  type MerkleProof,
} from "./onboarding.js";
