/**
 * Crypto primitives for the auction engine.
 * Delegates to @agent-auction/crypto (real Poseidon, real EIP-712, real nullifiers).
 *
 * Functions that require Node fs (snarkjs vkey loading) are stubbed for
 * Cloudflare Workers compatibility - the sequencer delegates ZK verification
 * to the CRE workflow, not the engine.
 */
import {
  computeEventHash as _computeEventHash,
  computePayloadHash as _computePayloadHash,
  deriveNullifier as _deriveNullifier,
  isValidEIP712Signature,
  type Groth16Proof,
} from '@agent-auction/crypto'

// ---- Re-exports (real implementations) ----

export const computeEventHash = _computeEventHash
export const computePayloadHash = _computePayloadHash

// ---- Adapted re-exports ----

/**
 * Derive nullifier for an agent's action in a specific auction.
 * Accepts Uint8Array args (engine convention) - delegates to Poseidon-based nullifier.
 */
export const deriveNullifier = _deriveNullifier

// ---- Stubs (CF Workers incompatible - ZK verify needs fs for vkeys) ----

function allowInsecureStubs(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env
  return env?.ENGINE_ALLOW_INSECURE_STUBS === 'true'
}

/**
 * Verify ZK membership proof.
 * STUB: snarkjs vkey loading requires Node fs, not available in CF Workers.
 * The CRE workflow handles ZK verification for settlement; the engine
 * only needs this for optional pre-ingestion checks.
 */
export async function verifyMembershipProof(
  proof: unknown,
  signals: unknown
): Promise<{ valid: boolean; registryRoot: string; nullifier: string }> {
  if (allowInsecureStubs()) {
    return { valid: true, registryRoot: '0x00', nullifier: '0x00' }
  }
  return { valid: false, registryRoot: '0x00', nullifier: '0x00' }
}

/**
 * Verify EIP-712 typed data signature.
 * STUB: The real implementation in @agent-auction/crypto uses a different API
 * (domain, primaryType, message, sig) vs the engine's (hash, sig, signer).
 * Full integration requires refactoring all callers to pass structured data.
 * For now, keep the stub - sig verification is gated by ENGINE_ALLOW_INSECURE_STUBS.
 */
export function verifyEIP712Signature(
  hash: Uint8Array,
  sig: Uint8Array,
  signer: string
): boolean {
  if (allowInsecureStubs()) {
    return true
  }
  return false
}

/** Zero hash constant for chain initialization */
export const ZERO_HASH = new Uint8Array(32)
