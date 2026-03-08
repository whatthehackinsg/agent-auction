import { Runner, EVMClient, handler, getNetwork, hexToBase64 } from "@chainlink/cre-sdk";
import { keccak256, toBytes } from "viem";
import { z } from "zod";
import { onAuctionEnded, type Config } from "./helpers";
const configSchema = z.object({
  chainSelectorName: z.string(),
  auctionRegistryAddress: z.string(),
  auctionEscrowAddress: z.string(),
  replayBundleBaseUrl: z.string(),
  gasLimit: z.string(),
  skipReplayVerification: z.string().optional(),
  isTestnet: z.string().optional(),
  useFinalized: z.string().optional(),
});
const initWorkflow = (config: Config) => {
  const isTestnet = config.isTestnet !== "false";
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet,
  });
  if (!network) throw new Error("Network not found");
  const evmClient = new EVMClient(network.chainSelector.selector);
  const auctionEndedHash = keccak256(toBytes("AuctionEnded(bytes32,uint256,address,uint256,bytes32,bytes32)"));
  const logTrigger = evmClient.logTrigger({
    addresses: [hexToBase64(config.auctionRegistryAddress)],
    topics: [{ values: [hexToBase64(auctionEndedHash)] }],
    confidence: "CONFIDENCE_LEVEL_FINALIZED",
  });
  return [handler(logTrigger, onAuctionEnded)];
};
export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

main();
