#!/usr/bin/env node
/**
 * One-shot script: registers 3 test agents on Base Sepolia AgentPrivacyRegistry.
 *
 * Run once:
 *   npx tsx packages/crypto/scripts/register-test-agents.ts
 *
 * Env vars required:
 *   BASE_SEPOLIA_RPC — RPC endpoint (e.g. https://sepolia.base.org or Alchemy/Infura)
 *   PRIVATE_KEY     — Funded account private key (needs ETH for gas on Base Sepolia)
 *
 * Output: packages/crypto/test-agents/agent-{1,2,3}.json
 *
 * WARNING: Do NOT run in CI — this costs gas and agents stay registered permanently.
 * Re-running is safe: AlreadyRegistered errors are caught and skipped.
 */
import { prepareOnboarding, registerOnChain } from "../src/onboarding.js";
import { ethers } from "ethers";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- Config ----------

const REGISTRY = "0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff";
const BASE_SEPOLIA_CHAIN_ID = 84532n;

// Test agent definitions: bidder, competitor, observer
const AGENTS: Array<{ agentId: bigint; capabilityIds: bigint[]; label: string }> = [
  { agentId: 1n, capabilityIds: [1n], label: "bidder" },
  { agentId: 2n, capabilityIds: [1n], label: "competitor" },
  { agentId: 3n, capabilityIds: [1n], label: "observer" },
];

// ---------- Serialization ----------

/**
 * Serialize AgentPrivateState to JSON.
 * BigInt fields are stored as numeric strings suffixed with 'n' (e.g. "12345n")
 * so they can be reconstructed with BigInt(str.replace('n', '')) or BigInt(str.slice(0, -1)).
 */
function serializeBigInt(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString() + "n";
  }
  return value;
}

function serializeState(state: unknown): string {
  return JSON.stringify(state, serializeBigInt, 2);
}

// ---------- Main ----------

async function main(): Promise<void> {
  const rpc = process.env.BASE_SEPOLIA_RPC;
  const key = process.env.PRIVATE_KEY;

  if (!rpc) {
    throw new Error("BASE_SEPOLIA_RPC env var is required (e.g. https://sepolia.base.org)");
  }
  if (!key) {
    throw new Error("PRIVATE_KEY env var is required (funded Base Sepolia account for gas)");
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const signer = new ethers.Wallet(key, provider);

  const network = await provider.getNetwork();
  console.log(`Connected to chainId ${network.chainId} via ${rpc}`);
  if (network.chainId !== BASE_SEPOLIA_CHAIN_ID) {
    throw new Error(
      `Expected Base Sepolia (chainId=${BASE_SEPOLIA_CHAIN_ID}), got chainId=${network.chainId}`
    );
  }
  console.log(`Signer: ${signer.address}`);

  // Ensure output directory exists
  const outDir = join(__dirname, "..", "test-agents");
  mkdirSync(outDir, { recursive: true });

  for (const { agentId, capabilityIds, label } of AGENTS) {
    console.log(`\n--- Agent ${agentId} (${label}) ---`);
    console.log(`  Preparing onboarding (generating secrets + capability tree)...`);

    const state = await prepareOnboarding(agentId, capabilityIds);
    console.log(
      `  capabilityMerkleRoot: ${state.capabilityMerkleRoot.toString().slice(0, 20)}...`
    );

    console.log(`  Registering on AgentPrivacyRegistry at ${REGISTRY}...`);
    try {
      const receipt = await registerOnChain(state, REGISTRY, signer);
      console.log(`  TX: ${receipt.hash}`);
      console.log(`  Block: ${receipt.blockNumber}  Gas used: ${receipt.gasUsed}`);
      console.log(`  Agent ${agentId} registered.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.toLowerCase().includes("alreadyregistered") ||
        msg.toLowerCase().includes("already registered") ||
        msg.toLowerCase().includes("already")
      ) {
        console.log(`  Agent ${agentId} already registered — skipping on-chain TX.`);
      } else {
        throw err;
      }
    }

    // Persist private state
    const outPath = join(outDir, `agent-${agentId}.json`);
    writeFileSync(outPath, serializeState(state), "utf8");
    console.log(`  Private state saved to ${outPath}`);
  }

  console.log("\nDone. All 3 test agents registered (or already registered).");
  console.log(`State files in: ${outDir}`);
}

main().catch((err: unknown) => {
  console.error("Registration failed:", err);
  process.exit(1);
});
