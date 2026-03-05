import type { EngineClient } from './engine.js'
import { toolError } from './tool-response.js'

interface VerifyIdentityResponse {
  verified: boolean
  resolvedWallet: string | null
  privacyRegistered: boolean
  poseidonRoot: string | null
  errorCode?: string
}

type IdentityPreFlightResult =
  | { ok: true }
  | { ok: false; error: ReturnType<typeof toolError> }

export async function verifyIdentityPreFlight(
  engine: EngineClient,
  agentId: string,
  wallet: string,
): Promise<IdentityPreFlightResult> {
  let data: VerifyIdentityResponse
  try {
    data = await engine.post<VerifyIdentityResponse>('/verify-identity', {
      agentId,
      wallet,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: toolError(
        'IDENTITY_CHECK_FAILED',
        `Could not reach engine to verify identity: ${msg}`,
        'Ensure ENGINE_URL is correct and engine is running. Use check_identity after recovery. Cannot proceed without identity verification (fail-closed).',
      ),
    }
  }

  if (!data.verified && (data.errorCode === 'AGENT_NOT_REGISTERED' || !data.resolvedWallet)) {
    return {
      ok: false,
      error: toolError(
        'AGENT_NOT_REGISTERED',
        `agentId ${agentId} is not registered on ERC-8004 identity registry`,
        'Register your agent identity first. Use the register_identity MCP tool, then confirm with check_identity.',
      ),
    }
  }

  if (!data.verified && data.resolvedWallet) {
    return {
      ok: false,
      error: toolError(
        'WALLET_MISMATCH',
        `Wallet ${wallet} does not match on-chain owner ${data.resolvedWallet} for agentId ${agentId}`,
        `Use the wallet that owns agentId ${agentId} on ERC-8004, or transfer ownership and re-run check_identity.`,
      ),
    }
  }

  if (data.verified && !data.privacyRegistered) {
    return {
      ok: false,
      error: toolError(
        'PRIVACY_NOT_REGISTERED',
        `agentId ${agentId} is not registered on AgentPrivacyRegistry`,
        'Register privacy membership first by running prepareOnboarding() then registerOnChain() from @agent-auction/crypto, then confirm with check_identity.',
      ),
    }
  }

  if (data.verified && data.privacyRegistered) {
    return { ok: true }
  }

  return {
    ok: false,
    error: toolError(
      'IDENTITY_CHECK_FAILED',
      `Unexpected identity verification response for agentId ${agentId}`,
      'Re-run check_identity and verify ENGINE_URL/AGENT_ID configuration.',
    ),
  }
}
