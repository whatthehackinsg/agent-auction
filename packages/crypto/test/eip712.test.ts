import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import {
  hashTypedData,
  encodeTypedData,
  verifyEIP712Signature,
  isValidEIP712Signature,
  DEFAULT_DOMAIN,
  type EIP712Domain,
} from "../src/eip712-typed-data.js";

const TEST_DOMAIN: EIP712Domain = {
  ...DEFAULT_DOMAIN,
  verifyingContract: "0x1234567890abcdef1234567890abcdef12345678",
};

describe("hashTypedData", () => {
  it("returns 32 bytes for a Join message", () => {
    const hash = hashTypedData(TEST_DOMAIN, "Join", {
      auctionId: 1,
      nullifier: 999,
      depositAmount: ethers.parseEther("0.1"),
      nonce: 0,
      deadline: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(hash.length).toBe(32);
  });

  it("is deterministic", () => {
    const msg = { auctionId: 1, amount: 500, nonce: 0, deadline: 9999999 };
    const a = hashTypedData(TEST_DOMAIN, "Bid", msg);
    const b = hashTypedData(TEST_DOMAIN, "Bid", msg);
    expect(Buffer.from(a).toString("hex")).toBe(Buffer.from(b).toString("hex"));
  });

  it("changes with different messages", () => {
    const a = hashTypedData(TEST_DOMAIN, "Bid", { auctionId: 1, amount: 500, nonce: 0, deadline: 9999999 });
    const b = hashTypedData(TEST_DOMAIN, "Bid", { auctionId: 1, amount: 501, nonce: 0, deadline: 9999999 });
    expect(Buffer.from(a).toString("hex")).not.toBe(Buffer.from(b).toString("hex"));
  });

  it("hashes all speech act types without error", () => {
    hashTypedData(TEST_DOMAIN, "Join", { auctionId: 1, nullifier: 0, depositAmount: 0, nonce: 0, deadline: 0 });
    hashTypedData(TEST_DOMAIN, "Bid", { auctionId: 1, amount: 0, nonce: 0, deadline: 0 });
    hashTypedData(TEST_DOMAIN, "BidCommit", {
      auctionId: 1, bidCommitment: 0, encryptedBidHash: ethers.ZeroHash,
      zkRangeProofHash: ethers.ZeroHash, nonce: 0, deadline: 0,
    });
    hashTypedData(TEST_DOMAIN, "Reveal", { auctionId: 1, bid: 0, salt: 0, nonce: 0 });
    hashTypedData(TEST_DOMAIN, "Deliver", {
      auctionId: 1, milestoneId: 0, deliveryHash: ethers.ZeroHash,
      executionLogHash: ethers.ZeroHash, nonce: 0, deadline: 0,
    });
    hashTypedData(TEST_DOMAIN, "Dispute", {
      auctionId: 1, evidencePackageHash: ethers.ZeroHash,
      respondent: ethers.ZeroAddress, nonce: 0,
    });
    hashTypedData(TEST_DOMAIN, "Withdraw", { auctionId: 1, reason: "test", nonce: 0, deadline: 0 });
  });
});

describe("sign and verify EIP-712", () => {
  it("roundtrips: sign with wallet, verify recovers signer", async () => {
    const wallet = ethers.Wallet.createRandom();
    const message = { auctionId: 1, amount: 500, nonce: 0, deadline: 9999999 };
    const { domain, types, value } = encodeTypedData(TEST_DOMAIN, "Bid", message);

    const sig = await wallet.signTypedData(domain, types, value);

    const recovered = verifyEIP712Signature(TEST_DOMAIN, "Bid", message, sig);
    expect(recovered.toLowerCase()).toBe(wallet.address.toLowerCase());
  });

  it("isValidEIP712Signature returns true for correct signer", async () => {
    const wallet = ethers.Wallet.createRandom();
    const message = { auctionId: 42, nullifier: 123, depositAmount: 0, nonce: 1, deadline: 9999999 };
    const { domain, types, value } = encodeTypedData(TEST_DOMAIN, "Join", message);

    const sig = await wallet.signTypedData(domain, types, value);

    expect(isValidEIP712Signature(TEST_DOMAIN, "Join", message, sig, wallet.address)).toBe(true);
  });

  it("isValidEIP712Signature returns false for wrong signer", async () => {
    const wallet = ethers.Wallet.createRandom();
    const other = ethers.Wallet.createRandom();
    const message = { auctionId: 1, amount: 500, nonce: 0, deadline: 9999999 };
    const { domain, types, value } = encodeTypedData(TEST_DOMAIN, "Bid", message);

    const sig = await wallet.signTypedData(domain, types, value);

    expect(isValidEIP712Signature(TEST_DOMAIN, "Bid", message, sig, other.address)).toBe(false);
  });
});
