import { describe, it, expect } from "vitest";
import { poseidonHash, toFr, computePayloadHash, computeEventHash, F_MODULUS, bytesToFr, frToBytes } from "../src/poseidon-chain.js";
import vectors from "./poseidon-vectors.json";

describe("poseidonHash", () => {
  for (const v of vectors) {
    it(`matches test vector: ${v.name}`, async () => {
      const inputs = v.inputs.map((x: string) => BigInt(x));
      const result = await poseidonHash(inputs);
      expect(result.toString()).toBe(v.expectedOutput);
    });
  }
});

describe("toFr", () => {
  it("reduces values >= F", () => {
    // F + 1 should reduce to 1
    expect(toFr(F_MODULUS + 1n)).toBe(1n);
  });

  it("leaves small values unchanged", () => {
    expect(toFr(42n)).toBe(42n);
  });

  it("handles zero", () => {
    expect(toFr(0n)).toBe(0n);
  });
});

describe("bytesToFr / frToBytes roundtrip", () => {
  it("roundtrips a field element", () => {
    const val = 123456789012345678901234567890n;
    const bytes = frToBytes(val);
    expect(bytesToFr(bytes)).toBe(toFr(val));
  });
});

describe("computePayloadHash", () => {
  it("returns 32 bytes", () => {
    const hash = computePayloadHash(1, 42n, "0x0000000000000000000000000000000000000001", 1000n);
    expect(hash.length).toBe(32);
  });

  it("is deterministic", () => {
    const a = computePayloadHash(1, 42n, "0x0000000000000000000000000000000000000001", 1000n);
    const b = computePayloadHash(1, 42n, "0x0000000000000000000000000000000000000001", 1000n);
    expect(Buffer.from(a).toString("hex")).toBe(Buffer.from(b).toString("hex"));
  });

  it("changes with different inputs", () => {
    const a = computePayloadHash(1, 42n, "0x0000000000000000000000000000000000000001", 1000n);
    const b = computePayloadHash(2, 42n, "0x0000000000000000000000000000000000000001", 1000n);
    expect(Buffer.from(a).toString("hex")).not.toBe(Buffer.from(b).toString("hex"));
  });
});

describe("computeEventHash", () => {
  it("returns 32 bytes", async () => {
    const prevHash = new Uint8Array(32);
    const payloadHash = computePayloadHash(1, 1n, "0x0000000000000000000000000000000000000001", 100n);
    const result = await computeEventHash(1n, prevHash, payloadHash);
    expect(result.length).toBe(32);
  });

  it("chain changes when seq increments", async () => {
    const prevHash = new Uint8Array(32);
    const payloadHash = computePayloadHash(1, 1n, "0x0000000000000000000000000000000000000001", 100n);
    const a = await computeEventHash(1n, prevHash, payloadHash);
    const b = await computeEventHash(2n, prevHash, payloadHash);
    expect(Buffer.from(a).toString("hex")).not.toBe(Buffer.from(b).toString("hex"));
  });
});
