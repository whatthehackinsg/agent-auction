import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { createClient, getWalletAddress, maybeCloseClient } from "./shared.mjs";

const client = createClient();
const address = getWalletAddress();
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org"),
});

try {
  const result = await client.evm.requestFaucet({
    address,
    network: "base-sepolia",
    token: "eth",
  });

  console.log("");
  console.log("Requested Base Sepolia faucet ETH");
  console.log("---------------------------------");
  console.log(`Address: ${address}`);
  console.log(`Transaction: ${result.transactionHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: result.transactionHash,
  });

  console.log(`Confirmed in block: ${receipt.blockNumber}`);
  console.log(
    `Basescan: https://sepolia.basescan.org/tx/${result.transactionHash}`,
  );
} finally {
  await maybeCloseClient(client);
}
