import {
  buildX402AccessTypedData,
  X402_ACCESS_ISSUED_AT_HEADER,
  X402_ACCESS_SIGNATURE_HEADER,
  type X402AccessScope,
} from '@agent-auction/crypto/x402-access'
import { getAddress, recoverTypedDataAddress } from 'viem'

export const DEFAULT_X402_ACCESS_MAX_AGE_SEC = 300

export interface VerifiedX402AccessHeaders {
  payerWallet: `0x${string}`
  issuedAt: number
}

export async function verifyX402AccessHeaders(args: {
  headers: Headers
  scope: X402AccessScope
  engineOrigin: string
  chainId?: number
  nowSec?: number
  maxAgeSec?: number
}): Promise<VerifiedX402AccessHeaders | null> {
  const issuedAtRaw = args.headers.get(X402_ACCESS_ISSUED_AT_HEADER)
  const signature = args.headers.get(X402_ACCESS_SIGNATURE_HEADER) as `0x${string}` | null
  if (!issuedAtRaw || !signature) {
    return null
  }

  if (!/^\d+$/.test(issuedAtRaw)) {
    return null
  }

  const issuedAt = Number.parseInt(issuedAtRaw, 10)
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) {
    return null
  }

  const nowSec = args.nowSec ?? Math.floor(Date.now() / 1000)
  const maxAgeSec = args.maxAgeSec ?? DEFAULT_X402_ACCESS_MAX_AGE_SEC
  if (issuedAt > nowSec + 30) {
    return null
  }
  if (nowSec - issuedAt > maxAgeSec) {
    return null
  }

  const typedData = buildX402AccessTypedData({
    scope: args.scope,
    engineOrigin: args.engineOrigin,
    issuedAt,
    chainId: args.chainId,
  })

  try {
    const payerWallet = await recoverTypedDataAddress({
      ...typedData,
      signature,
    })

    return {
      payerWallet: getAddress(payerWallet),
      issuedAt,
    }
  } catch {
    return null
  }
}
