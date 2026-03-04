/**
 * EIP-712 typed data hashing and signature verification
 * for all auction speech act structs.
 *
 * Uses ethers v6 for EIP-712 encoding.
 */
import { ethers } from "ethers";

// ----- Domain -----

export interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

/** Default domain for Base Sepolia deployment */
export const DEFAULT_DOMAIN: EIP712Domain = {
  name: "AgentAuction",
  version: "1",
  chainId: 84532, // Base Sepolia
  verifyingContract: ethers.ZeroAddress, // overridden at runtime with AuctionRegistry address
};

// ----- Type Definitions (matching docs/full_contract_arch) -----

export const TYPED_DATA_TYPES = {
  Join: [
    { name: "auctionId", type: "uint256" },
    { name: "nullifier", type: "uint256" },
    { name: "depositAmount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  Bid: [
    { name: "auctionId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  BidCommit: [
    { name: "auctionId", type: "uint256" },
    { name: "bidCommitment", type: "uint256" },
    { name: "encryptedBidHash", type: "bytes32" },
    { name: "zkRangeProofHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  Reveal: [
    { name: "auctionId", type: "uint256" },
    { name: "bid", type: "uint256" },
    { name: "salt", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  Deliver: [
    { name: "auctionId", type: "uint256" },
    { name: "milestoneId", type: "uint256" },
    { name: "deliveryHash", type: "bytes32" },
    { name: "executionLogHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  Dispute: [
    { name: "auctionId", type: "uint256" },
    { name: "evidencePackageHash", type: "bytes32" },
    { name: "respondent", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
  Withdraw: [
    { name: "auctionId", type: "uint256" },
    { name: "reason", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export type SpeechActType = keyof typeof TYPED_DATA_TYPES;

type TypedDataField = { name: string; type: string };
type TypedDataMap = Record<string, readonly TypedDataField[]>;

// ----- Core Functions -----

/**
 * Compute the EIP-712 typed data hash for a speech act.
 * Returns the 32-byte digest that gets signed.
 */
export function hashTypedData(
  domain: EIP712Domain,
  primaryType: SpeechActType,
  message: Record<string, any>
): Uint8Array {
  const types = { [primaryType]: TYPED_DATA_TYPES[primaryType] };
  const hash = ethers.TypedDataEncoder.hash(
    domain,
    types as any,
    message
  );
  return ethers.getBytes(hash);
}

/**
 * Encode the full EIP-712 typed data payload (for signing with ethers Wallet).
 * Returns { domain, types, value } suitable for wallet.signTypedData().
 */
export function encodeTypedData(
  domain: EIP712Domain,
  primaryType: SpeechActType,
  message: Record<string, any>
) {
  return {
    domain,
    types: { [primaryType]: TYPED_DATA_TYPES[primaryType] } as TypedDataMap,
    primaryType,
    value: message,
  };
}

/**
 * Verify an EIP-712 signature and return the recovered signer address.
 */
export function verifyEIP712Signature(
  domain: EIP712Domain,
  primaryType: SpeechActType,
  message: Record<string, any>,
  signature: string | Uint8Array
): string {
  const types = { [primaryType]: TYPED_DATA_TYPES[primaryType] };
  const signatureHex =
    typeof signature === "string" ? signature : ethers.hexlify(signature);
  const recovered = ethers.verifyTypedData(
    domain,
    types as any,
    message,
    signatureHex
  );
  return recovered;
}

/**
 * Check if a signature was produced by the expected signer.
 */
export function isValidEIP712Signature(
  domain: EIP712Domain,
  primaryType: SpeechActType,
  message: Record<string, any>,
  signature: string | Uint8Array,
  expectedSigner: string
): boolean {
  const recovered = verifyEIP712Signature(domain, primaryType, message, signature);
  return recovered.toLowerCase() === expectedSigner.toLowerCase();
}
