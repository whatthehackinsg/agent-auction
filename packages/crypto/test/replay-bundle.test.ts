import { describe, it, expect } from "vitest";
import {
  serializeReplayBundle,
  computeContentHash,
  parseActionToken,
  type AuctionEvent,
} from "../src/replay-bundle.js";

describe("ReplayBundleV1 serialization", () => {
  it("Vector A: single JOIN event", () => {
    const auctionId =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const events: AuctionEvent[] = [
      {
        seq: 1n,
        actionType: "JOIN",
        agentId: 101n,
        wallet: "0x1111111111111111111111111111111111111111",
        amount: 0n,
        prevHash:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        eventHash:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
        payloadHash:
          "0x3333333333333333333333333333333333333333333333333333333333333333",
      },
    ];

    const bundle = serializeReplayBundle(auctionId, events);
    const hash = computeContentHash(bundle);
    expect(hash).toBe(
      "0xab8971d7ea24703e893bde6d94080df82dd1906e43fae580f5857ee8d93a62df"
    );
  });

  it("Vector B: JOIN + BID events", () => {
    const auctionId =
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const events: AuctionEvent[] = [
      {
        seq: 1n,
        actionType: "JOIN",
        agentId: 201n,
        wallet: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        amount: 0n,
        prevHash:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        eventHash:
          "0x4444444444444444444444444444444444444444444444444444444444444444",
        payloadHash:
          "0x5555555555555555555555555555555555555555555555555555555555555555",
      },
      {
        seq: 2n,
        actionType: "BID",
        agentId: 201n,
        wallet: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        amount: 7000000n,
        prevHash:
          "0x4444444444444444444444444444444444444444444444444444444444444444",
        eventHash:
          "0x6666666666666666666666666666666666666666666666666666666666666666",
        payloadHash:
          "0x7777777777777777777777777777777777777777777777777777777777777777",
      },
    ];

    const bundle = serializeReplayBundle(auctionId, events);
    const hash = computeContentHash(bundle);
    expect(hash).toBe(
      "0x4f695aa5b8a96673ca6e7e67ccc863de0e62c0782eaeab86c49a2fb41126979a"
    );
  });

  it("produces no trailing newline", () => {
    const bundle = serializeReplayBundle(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      []
    );
    const text = new TextDecoder().decode(bundle);
    expect(text.endsWith("\n")).toBe(false);
  });

  it("sorts events by seq", () => {
    const events: AuctionEvent[] = [
      {
        seq: 2n,
        actionType: 2,
        agentId: 1n,
        wallet: "0x0000000000000000000000000000000000000001",
        amount: 500n,
        prevHash: "0x" + "aa".repeat(32),
        eventHash: "0x" + "bb".repeat(32),
        payloadHash: "0x" + "cc".repeat(32),
      },
      {
        seq: 1n,
        actionType: 1,
        agentId: 1n,
        wallet: "0x0000000000000000000000000000000000000001",
        amount: 0n,
        prevHash: "0x" + "00".repeat(32),
        eventHash: "0x" + "aa".repeat(32),
        payloadHash: "0x" + "dd".repeat(32),
      },
    ];

    const bundle = serializeReplayBundle(
      "0x" + "ff".repeat(32),
      events
    );
    const text = new TextDecoder().decode(bundle);
    const lines = text.split("\n");
    expect(lines[2]).toContain("seq=1");
    expect(lines[3]).toContain("seq=2");
  });
});

describe("parseActionToken", () => {
  it("maps known tokens", () => {
    expect(parseActionToken("JOIN")).toBe(1);
    expect(parseActionToken("BID")).toBe(2);
    expect(parseActionToken("CLOSE")).toBe(3);
    expect(parseActionToken("CANCEL")).toBe(4);
  });

  it("rejects unknown tokens", () => {
    expect(() => parseActionToken("UNKNOWN")).toThrow();
  });
});
