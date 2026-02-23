/**
 * Smoke test — proves the test infrastructure works:
 * 1. vitest runs
 * 2. crypto API available (Node.js compat)
 * 3. miniflare can simulate D1
 * 4. setup utilities work
 * 5. engine types are importable
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Miniflare } from "miniflare";
import {
  createTestMiniflare,
  applySchema,
  randomAuctionId,
  randomWallet,
  randomAgentId,
} from "./setup";

// ─── Basic Infrastructure ────────────────────────────────────────────

describe("Test Infrastructure Smoke", () => {
  it("vitest is working", () => {
    expect(1 + 1).toBe(2);
  });

  it("crypto API is available", () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    expect(bytes.length).toBe(32);
    // At least one byte should be non-zero (probabilistically certain)
    expect(bytes.some((b) => b !== 0)).toBe(true);
  });

  it("can import engine types", async () => {
    const { AuctionState } = await import("../src/types/contracts");
    expect(AuctionState.OPEN).toBe(1);
    expect(AuctionState.SETTLED).toBe(3);
    expect(AuctionState.CANCELLED).toBe(4);
  });
});

// ─── Setup Utilities ─────────────────────────────────────────────────

describe("Setup Utilities", () => {
  it("randomAuctionId returns 66-char hex string", () => {
    const id = randomAuctionId();
    expect(id).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("randomWallet returns 42-char hex string", () => {
    const wallet = randomWallet();
    expect(wallet).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it("randomAgentId returns a bigint", () => {
    const agentId = randomAgentId();
    expect(typeof agentId).toBe("bigint");
    expect(agentId).toBeGreaterThanOrEqual(0n);
  });

  it("random generators produce unique values", () => {
    const ids = new Set(Array.from({ length: 10 }, () => randomAuctionId()));
    expect(ids.size).toBe(10);
  });
});

// ─── Miniflare D1 Simulation ─────────────────────────────────────────

describe("Miniflare D1 Simulation", () => {
  let mf: Miniflare;
  let db: D1Database;

  beforeAll(async () => {
    mf = createTestMiniflare();
    db = await mf.getD1Database("AUCTION_DB");
    await applySchema(db);
  });

  afterAll(async () => {
    await mf.dispose();
  });

  it("D1 database is accessible", () => {
    expect(db).toBeDefined();
  });

  it("schema creates auctions table", async () => {
    const result = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='auctions'"
      )
      .first<{ name: string }>();
    expect(result).not.toBeNull();
    expect(result!.name).toBe("auctions");
  });

  it("schema creates events table", async () => {
    const result = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='events'"
      )
      .first<{ name: string }>();
    expect(result).not.toBeNull();
    expect(result!.name).toBe("events");
  });

  it("can insert and query auction data", async () => {
    const auctionId = "smoke-test-001";
    const res = await db
      .prepare(
        `INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(auctionId, "0xdeadbeef", 1, "1000000", "500000", 1700000000)
      .run();
    expect(res.success).toBe(true);

    const row = await db
      .prepare("SELECT * FROM auctions WHERE auction_id = ?")
      .bind(auctionId)
      .first();
    expect(row).not.toBeNull();
    expect((row as Record<string, unknown>).status).toBe(1);
  });

  it("can insert and query events with seq ordering", async () => {
    const auctionId = "smoke-test-001";

    // Insert two events
    for (const seq of [1, 2]) {
      await db
        .prepare(
          `INSERT INTO events (auction_id, seq, prev_hash, event_hash, payload_hash, action_type, agent_id, wallet, amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          auctionId,
          seq,
          "0x0000",
          `0xevent${seq}`,
          `0xpayload${seq}`,
          "BID",
          `agent-${seq}`,
          `0xwallet${seq}`,
          `${seq * 100000}`
        )
        .run();
    }

    const { results } = await db
      .prepare(
        "SELECT * FROM events WHERE auction_id = ? ORDER BY seq"
      )
      .bind(auctionId)
      .all();

    expect(results.length).toBe(2);
    expect((results[0] as Record<string, unknown>).seq).toBe(1);
    expect((results[1] as Record<string, unknown>).seq).toBe(2);
  });
});
