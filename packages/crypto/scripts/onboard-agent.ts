#!/usr/bin/env npx tsx
/**
 * Agent Onboarding Script
 *
 * Generates a new agent identity, builds the capability Merkle tree,
 * and registers the privacy commitment on-chain.
 *
 * Usage:
 *   PRIVATE_KEY=0x...        \
 *   PRIVACY_REGISTRY=0x...   \
 *   AGENT_ID=1               \
 *   RPC_URL=https://sepolia.base.org \
 *   npx tsx scripts/onboard-agent.ts
 *
 * Optional:
 *   CAPABILITIES=1,2,3       (comma-separated capability IDs, default: 1)
 *   OUTPUT_FILE=agent-state.json  (save private state to file)
 */
import { ethers } from "ethers";
import { writeFile } from "fs/promises";
import {
  prepareOnboarding,
  registerOnChain,
} from "../src/onboarding.js";

// ---------- Config ----------

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PRIVACY_REGISTRY = process.env.PRIVACY_REGISTRY;
const AGENT_ID = process.env.AGENT_ID;
const RPC_URL = process.env.RPC_URL ?? "https://sepolia.base.org";
const CAPABILITIES = process.env.CAPABILITIES ?? "1";
const OUTPUT_FILE = process.env.OUTPUT_FILE;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    console.error(`ERROR: ${name} environment variable is required`);
    process.exit(1);
  }
  return value;
}

// ---------- Main ----------

async function main() {
  const privateKey = requireEnv("PRIVATE_KEY", PRIVATE_KEY);
  const registryAddress = requireEnv("PRIVACY_REGISTRY", PRIVACY_REGISTRY);
  const agentId = BigInt(requireEnv("AGENT_ID", AGENT_ID));
  const capabilityIds = CAPABILITIES.split(",").map((s) => BigInt(s.trim()));

  console.log("=== Agent Onboarding ===");
  console.log(`Agent ID:     ${agentId}`);
  console.log(`Capabilities: [${capabilityIds.join(", ")}]`);
  console.log(`Registry:     ${registryAddress}`);
  console.log(`RPC:          ${RPC_URL}`);
  console.log();

  // Step 1: Prepare onboarding (generate secrets, build tree)
  console.log("Step 1: Generating secrets and building capability tree...");
  const privateState = await prepareOnboarding(agentId, capabilityIds);
  console.log(`  agentSecret:           ${privateState.agentSecret.toString().slice(0, 20)}...`);
  console.log(`  capabilityMerkleRoot:  ${privateState.capabilityMerkleRoot.toString().slice(0, 20)}...`);
  console.log(`  leafHashes:            ${privateState.leafHashes.length} leaves`);
  console.log();

  // Step 2: Register on-chain
  console.log("Step 2: Registering on AgentPrivacyRegistry...");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(privateKey, provider);
  console.log(`  Signer:  ${signer.address}`);

  const receipt = await registerOnChain(privateState, registryAddress, signer);
  console.log(`  TX hash: ${receipt.hash}`);
  console.log(`  Block:   ${receipt.blockNumber}`);
  console.log(`  Gas:     ${receipt.gasUsed.toString()}`);
  console.log();

  // Step 3: Save private state
  const stateJson = {
    agentId: agentId.toString(),
    agentSecret: privateState.agentSecret.toString(),
    capabilities: capabilityIds.map((id) => id.toString()),
    leafHashes: privateState.leafHashes.map((h) => h.toString()),
    capabilityMerkleRoot: privateState.capabilityMerkleRoot.toString(),
    registryAddress,
    registeredAt: new Date().toISOString(),
  };

  if (OUTPUT_FILE) {
    await writeFile(OUTPUT_FILE, JSON.stringify(stateJson, null, 2));
    console.log(`Private state saved to: ${OUTPUT_FILE}`);
  } else {
    console.log("Private state (save this — needed for proof generation):");
    console.log(JSON.stringify(stateJson, null, 2));
  }

  console.log();
  console.log("=== Onboarding complete ===");
}

main().catch((err) => {
  console.error("Onboarding failed:", err);
  process.exit(1);
});
