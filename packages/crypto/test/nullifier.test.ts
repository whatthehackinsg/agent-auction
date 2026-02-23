import { describe, it, expect } from "vitest";
import { deriveNullifier, deriveNullifierBigInt, ActionType } from "../src/nullifier.js";
import { poseidonHash } from "../src/poseidon-chain.js";

describe("deriveNullifier", () => {
  it("matches manual Poseidon(secret, auctionId, actionType)", async () => {
    const secret = 12345678901234567890n;
    const auctionId = 11256099n;
    const expected = await poseidonHash([secret, auctionId, BigInt(ActionType.JOIN)]);

    const result = await deriveNullifierBigInt(secret, auctionId, ActionType.JOIN);
    expect(result).toBe(expected);
  });

  it("matches test vector for nullifier derivation", async () => {
    // From poseidon-vectors.json: inputs [12345678901234567890, 11256099, 1]
    const result = await deriveNullifierBigInt(12345678901234567890n, 11256099n, 1);
    expect(result.toString()).toBe(
      "4822836588534362775676420069659217888710235890615398961413930308758039682866"
    );
  });

  it("returns 32-byte Uint8Array", async () => {
    const result = await deriveNullifier(42n, 100n, ActionType.JOIN);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(32);
  });

  it("different action types produce different nullifiers", async () => {
    const a = await deriveNullifierBigInt(42n, 100n, ActionType.JOIN);
    const b = await deriveNullifierBigInt(42n, 100n, ActionType.BID);
    expect(a).not.toBe(b);
  });

  it("accepts Uint8Array inputs", async () => {
    const secretBytes = new Uint8Array(32);
    secretBytes[31] = 42;
    const auctionBytes = new Uint8Array(32);
    auctionBytes[31] = 100;

    const fromBytes = await deriveNullifier(secretBytes, auctionBytes, ActionType.JOIN);
    const fromBigint = await deriveNullifier(42n, 100n, ActionType.JOIN);
    expect(Buffer.from(fromBytes).toString("hex")).toBe(
      Buffer.from(fromBigint).toString("hex")
    );
  });
});
