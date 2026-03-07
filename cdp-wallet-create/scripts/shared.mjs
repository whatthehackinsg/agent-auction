import dotenv from "dotenv";
import { CdpClient } from "@coinbase/cdp-sdk";

dotenv.config();

const REQUIRED_ENV = [
  "CDP_API_KEY_ID",
  "CDP_API_KEY_SECRET",
  "CDP_WALLET_SECRET",
];

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function validateBaseEnv() {
  for (const name of REQUIRED_ENV) {
    requireEnv(name);
  }
}

export function getNetworkId() {
  return process.env.CDP_NETWORK_ID || "base-sepolia";
}

export function getWalletAddress() {
  const address = process.env.CDP_WALLET_ADDRESS;
  if (!address) {
    throw new Error(
      "Missing required env var: CDP_WALLET_ADDRESS. Run create-wallet first or set an existing wallet address.",
    );
  }
  return address;
}

export function createClient() {
  validateBaseEnv();

  return new CdpClient({
    apiKeyId: process.env.CDP_API_KEY_ID,
    apiKeySecret: process.env.CDP_API_KEY_SECRET,
    walletSecret: process.env.CDP_WALLET_SECRET,
  });
}

export async function maybeCloseClient(client) {
  if (client && typeof client.close === "function") {
    await client.close();
  }
}
