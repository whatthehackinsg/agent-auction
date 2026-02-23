/**
 * Shared test utilities for auction engine tests.
 * Provides helpers for D1 database setup, random ID generation, etc.
 *
 * NOTE: We use miniflare directly (not @cloudflare/vitest-pool-workers)
 * because vitest-pool-workers@0.12.14 requires vitest 2.0.x–3.2.x
 * but we run vitest 4.x. Miniflare gives us the same D1/DO simulation.
 */

import { Miniflare } from "miniflare";
import * as fs from "node:fs";
import * as path from "node:path";

process.env.ENGINE_ALLOW_INSECURE_STUBS = "true";

// ─── Schema ──────────────────────────────────────────────────────────

const SCHEMA_PATH = path.resolve(__dirname, "..", "schema.sql");

/** Read and return the raw schema SQL */
export function readSchema(): string {
  return fs.readFileSync(SCHEMA_PATH, "utf-8");
}

/**
 * Apply schema.sql to a D1 database instance.
 * Splits on semicolons and executes each statement individually.
 */
export async function applySchema(db: D1Database): Promise<void> {
  const raw = readSchema();
  // Strip SQL comments before splitting on semicolons
  const sql = raw
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await db.prepare(stmt).run();
  }
}

// ─── Miniflare Factory ──────────────────────────────────────────────

/** Create a Miniflare instance with D1 binding for testing */
export function createTestMiniflare(): Miniflare {
  return new Miniflare({
    modules: true,
    script: `export default { fetch() { return new Response('ok'); } }`,
    d1Databases: { AUCTION_DB: "test-auction-db" },
  });
}

// ─── Random Generators ──────────────────────────────────────────────

/** Generate a random auction ID (bytes32 hex string) */
export function randomAuctionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Generate a random wallet address (20 bytes hex) */
export function randomWallet(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Generate a random agent ID (uint256 as bigint) */
export function randomAgentId(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let result = 0n;
  for (const b of bytes) {
    result = (result << 8n) | BigInt(b);
  }
  return result;
}
