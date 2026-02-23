import { describe, it, expect } from "vitest";
import { getMembershipVKey, getBidRangeVKey } from "../src/snarkjs-verify.js";

describe("snarkjs-verify", () => {
  it("loads membership vkey", async () => {
    const vkey = await getMembershipVKey();
    expect(vkey.protocol).toBe("groth16");
    expect(vkey.curve).toBe("bn128");
    expect(vkey.nPublic).toBe(3); // registryRoot, capabilityCommitment, nullifier
  });

  it("loads bid range vkey", async () => {
    const vkey = await getBidRangeVKey();
    expect(vkey.protocol).toBe("groth16");
    expect(vkey.curve).toBe("bn128");
    expect(vkey.nPublic).toBe(4); // rangeOk (output), bidCommitment, reservePrice, maxBudget
  });

  it("membership vkey has valid IC array", async () => {
    const vkey = await getMembershipVKey();
    // IC should have nPublic + 1 entries
    expect(vkey.IC.length).toBe(vkey.nPublic + 1);
  });

  it("bid range vkey has valid IC array", async () => {
    const vkey = await getBidRangeVKey();
    expect(vkey.IC.length).toBe(vkey.nPublic + 1);
  });
});
