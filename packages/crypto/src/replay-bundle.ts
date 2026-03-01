/**
 * ReplayBundleV1 canonical serialization.
 *
 * Runtime-universal: uses Web Crypto API (CF Workers, browsers) with Node crypto fallback.
 *
 * Format (per spec docs/full_contract_arch(amended).md):
 *   - Encoding: UTF-8, LF line separator, no trailing newline
 *   - Header: schema:v1\nauction_id:<0x64-hex>
 *   - Events: event:seq=<u64>|type=<TOKEN>|agent_id=<u256>|wallet=<0x40-hex>|amount=<u256>|
 *             prev_hash=<0x64-hex>|event_hash=<0x64-hex>|payload_hash=<0x64-hex>
 *   - replayContentHash = sha256(canonical_bytes)
 */

/** Compute SHA-256 using Web Crypto (universal) or Node crypto (fallback) */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
    return new Uint8Array(buf);
  }
  // Node.js fallback
  const { createHash } = await import("crypto");
  return createHash("sha256").update(data).digest();
}

/** Action type tokens (uppercase, per spec) */
export const ACTION_TOKENS: Record<number, string> = {
  1: "JOIN",
  2: "BID",
  3: "CLOSE",
  4: "CANCEL",
  5: "DELIVER",
  6: "WITHDRAW",
};

const TOKEN_TO_TYPE: Record<string, number> = {
  JOIN: 1,
  BID: 2,
  CLOSE: 3,
  CANCEL: 4,
  DELIVER: 5,
  WITHDRAW: 6,
};

export interface AuctionEvent {
  seq: bigint | number;
  actionType: number | string; // number (1,2,...) or string ("JOIN","BID",...)
  agentId: bigint | string;
  wallet: string; // 0x-prefixed, 40 hex chars
  amount: bigint | string;
  prevHash: string; // 0x-prefixed, 64 hex chars
  eventHash: string; // 0x-prefixed, 64 hex chars
  payloadHash: string; // 0x-prefixed, 64 hex chars
}

/** Format a bigint as base-10 ASCII (no leading zeros, no leading +) */
function fmtU256(val: bigint): string {
  return val.toString(10);
}

/** Ensure hex is lowercase, 0x-prefixed, and exactly the expected width */
function fmtHex(val: string, hexChars: number): string {
  const stripped = val.startsWith("0x") ? val.slice(2) : val;
  return "0x" + stripped.toLowerCase().padStart(hexChars, "0");
}

/** Get action token string from number or string input */
function resolveToken(actionType: number | string): string {
  if (typeof actionType === "string") {
    if (!TOKEN_TO_TYPE[actionType]) {
      throw new Error(`Unknown action token: ${actionType}`);
    }
    return actionType;
  }
  const token = ACTION_TOKENS[actionType];
  if (!token) {
    throw new Error(`Unknown action type number: ${actionType}`);
  }
  return token;
}

/**
 * Serialize an auction's event log into ReplayBundleV1 canonical bytes.
 * Events must be sorted by seq, contiguous, with no gaps.
 */
export function serializeReplayBundle(
  auctionId: string,
  events: AuctionEvent[]
): Uint8Array {
  const lines: string[] = [];

  // Header
  lines.push("schema:v1");
  lines.push(`auction_id:${fmtHex(auctionId, 64)}`);

  // Events (sorted by seq — coerce to BigInt for mixed-type comparison)
  const sorted = [...events].sort((a, b) => {
    const sa = BigInt(a.seq), sb = BigInt(b.seq);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });

  for (const e of sorted) {
    const token = resolveToken(e.actionType);
    const line = [
      `event:seq=${fmtU256(e.seq)}`,
      `type=${token}`,
      `agent_id=${fmtU256(e.agentId)}`,
      `wallet=${fmtHex(e.wallet, 40)}`,
      `amount=${fmtU256(e.amount)}`,
      `prev_hash=${fmtHex(e.prevHash, 64)}`,
      `event_hash=${fmtHex(e.eventHash, 64)}`,
      `payload_hash=${fmtHex(e.payloadHash, 64)}`,
    ].join("|");
    lines.push(line);
  }

  // Join with LF, no trailing newline
  const canonical = lines.join("\n");
  return new TextEncoder().encode(canonical);
}

/**
 * Compute SHA-256 of a replay bundle's canonical bytes.
 * Returns 0x-prefixed lowercase hex string.
 */
export async function computeContentHash(bundleBytes: Uint8Array): Promise<string> {
  const hash = await sha256(bundleBytes);
  return "0x" + Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compute SHA-256 as raw bytes.
 */
export async function computeContentHashBytes(bundleBytes: Uint8Array): Promise<Uint8Array> {
  return sha256(bundleBytes);
}

/**
 * Parse an action token to its numeric type.
 */
export function parseActionToken(token: string): number {
  const t = TOKEN_TO_TYPE[token];
  if (t === undefined) {
    throw new Error(`Unknown action token: ${token}`);
  }
  return t;
}
