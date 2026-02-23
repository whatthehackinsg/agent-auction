import { Runner, EVMClient, handler, getNetwork } from "@chainlink/cre-sdk";
import { keccak256, toHex } from "viem";
import { z } from "zod";
import { onAuctionEnded, type Config } from "./helpers";
const configSchema = z.object({
  chainSelectorName: z.string(),
  auctionRegistryAddress: z.string(),
  auctionEscrowAddress: z.string(),
  replayBundleBaseUrl: z.string(),
  gasLimit: z.string(),
  skipReplayVerification: z.string().optional(),
});
const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error("Network not found");
  const evmClient = new EVMClient(network.chainSelector.selector);
  const logTrigger = evmClient.logTrigger({
    addresses: [config.auctionRegistryAddress],
    topics: [{ values: [keccak256(toHex("AuctionEnded(bytes32,uint256,address,uint256,bytes32,bytes32)"))] }],
    confidence: "CONFIDENCE_LEVEL_FINALIZED",
  });
  return [handler(logTrigger, onAuctionEnded)];
};
export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

main();
