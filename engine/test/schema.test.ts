import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Miniflare } from "miniflare";
import * as fs from "node:fs";
import * as path from "node:path";

const SCHEMA_SQL = fs.readFileSync(
  path.resolve(__dirname, "..", "schema.sql"),
  "utf-8"
);

describe("D1 Schema", () => {
  let mf: Miniflare;
  let db: D1Database;

  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } }",
      d1Databases: { AUCTION_DB: "test-auction-db" },
    });
    db = await mf.getD1Database("AUCTION_DB");

    // Strip SQL comments, then split on semicolons
    const stripped = SCHEMA_SQL.replace(/--.*$/gm, "");
    const statements = stripped.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
    for (const stmt of statements) {
      await db.prepare(stmt).run();
    }
  });

  afterAll(async () => {
    await mf.dispose();
  });

  it("creates auctions table", async () => {
    const result = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='auctions'"
      )
      .first<{ name: string }>();
    expect(result).not.toBeNull();
    expect(result!.name).toBe("auctions");
  });

  it("creates events table", async () => {
    const result = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='events'"
      )
      .first<{ name: string }>();
    expect(result).not.toBeNull();
    expect(result!.name).toBe("events");
  });

  it("creates idx_events_auction_seq index", async () => {
    const result = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_events_auction_seq'"
      )
      .first<{ name: string }>();
    expect(result).not.toBeNull();
    expect(result!.name).toBe("idx_events_auction_seq");
  });

  it("inserts into auctions", async () => {
    const res = await db
      .prepare(
        `INSERT INTO auctions (auction_id, manifest_hash, status, reserve_price, deposit_amount, deadline)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind("auction-001", "0xabc123", 1, "1000000", "500000", 1700000000)
      .run();
    expect(res.success).toBe(true);

    const row = await db
      .prepare("SELECT * FROM auctions WHERE auction_id = ?")
      .bind("auction-001")
      .first();
    expect(row).not.toBeNull();
    expect((row as Record<string, unknown>).manifest_hash).toBe("0xabc123");
    expect((row as Record<string, unknown>).status).toBe(1);
    expect((row as Record<string, unknown>).reserve_price).toBe("1000000");
  });

  it("inserts into events", async () => {
    const res = await db
      .prepare(
        `INSERT INTO events (auction_id, seq, prev_hash, event_hash, payload_hash, action_type, agent_id, wallet, amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        "auction-001",
        1,
        "0x0000",
        "0xevent1",
        "0xpayload1",
        "BID",
        "agent-42",
        "0xWallet1",
        "100000"
      )
      .run();
    expect(res.success).toBe(true);

    const row = await db
      .prepare(
        "SELECT * FROM events WHERE auction_id = ? AND seq = ?"
      )
      .bind("auction-001", 1)
      .first();
    expect(row).not.toBeNull();
    expect((row as Record<string, unknown>).action_type).toBe("BID");
    expect((row as Record<string, unknown>).agent_id).toBe("agent-42");
  });

  it("enforces UNIQUE(auction_id, seq) constraint", async () => {
    // Insert first event with seq=99
    await db
      .prepare(
        `INSERT INTO events (auction_id, seq, prev_hash, event_hash, payload_hash, action_type, agent_id, wallet, amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        "auction-001",
        99,
        "0x0000",
        "0xeventA",
        "0xpayloadA",
        "BID",
        "agent-1",
        "0xWalletA",
        "200000"
      )
      .run();

    // Duplicate (auction_id, seq) should fail
    await expect(
      db
        .prepare(
          `INSERT INTO events (auction_id, seq, prev_hash, event_hash, payload_hash, action_type, agent_id, wallet, amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          "auction-001",
          99,
          "0x0000",
          "0xeventB",
          "0xpayloadB",
          "BID",
          "agent-2",
          "0xWalletB",
          "300000"
        )
        .run()
    ).rejects.toThrow();
  });

  it("queries events by auction_id and seq using index", async () => {
    // Insert a second event for a different auction
    await db
      .prepare(
        `INSERT INTO events (auction_id, seq, prev_hash, event_hash, payload_hash, action_type, agent_id, wallet, amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        "auction-002",
        1,
        "0x0000",
        "0xevent2",
        "0xpayload2",
        "JOIN",
        "agent-99",
        "0xWallet99",
        "0"
      )
      .run();

    // Query specific auction+seq
    const row = await db
      .prepare(
        "SELECT * FROM events WHERE auction_id = ? AND seq = ?"
      )
      .bind("auction-002", 1)
      .first();
    expect(row).not.toBeNull();
    expect((row as Record<string, unknown>).action_type).toBe("JOIN");
    expect((row as Record<string, unknown>).agent_id).toBe("agent-99");

    // Query all events for auction-001 ordered by seq
    const { results } = await db
      .prepare(
        "SELECT * FROM events WHERE auction_id = ? ORDER BY seq"
      )
      .bind("auction-001")
      .all();
    expect(results.length).toBeGreaterThanOrEqual(2);
    // Verify ordering
    for (let i = 1; i < results.length; i++) {
      expect(
        (results[i] as Record<string, unknown>).seq
      ).toBeGreaterThan(
        (results[i - 1] as Record<string, unknown>).seq as number
      );
    }
  });
});
