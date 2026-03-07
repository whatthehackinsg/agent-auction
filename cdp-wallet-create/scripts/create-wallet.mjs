import { createClient, getNetworkId, maybeCloseClient } from "./shared.mjs";

const client = createClient();
const networkId = getNetworkId();

try {
  const account = await client.evm.createAccount();

  console.log("");
  console.log("Created CDP Server Wallet account");
  console.log("--------------------------------");
  console.log(`Address: ${account.address}`);
  console.log(`Network: ${networkId}`);
  console.log("");
  console.log("Use this in your MCP env file:");
  console.log(`MCP_WALLET_BACKEND=agentkit`);
  console.log(`CDP_API_KEY_ID=${process.env.CDP_API_KEY_ID}`);
  console.log(`CDP_API_KEY_SECRET=<reuse your current value>`);
  console.log(`CDP_WALLET_SECRET=<reuse your current value>`);
  console.log(`CDP_WALLET_ADDRESS=${account.address}`);
  console.log(`CDP_NETWORK_ID=${networkId}`);
  console.log("BASE_SEPOLIA_RPC=<your Base Sepolia RPC>");
  console.log("ENGINE_URL=http://localhost:8787");
  console.log("");
  console.log("Next:");
  console.log("1. Save the new CDP_WALLET_ADDRESS to your MCP env file.");
  console.log("2. Run npm run request-faucet in this folder to get Base Sepolia ETH.");
  console.log("3. Fund Base Sepolia USDC before bidding.");
} finally {
  await maybeCloseClient(client);
}
