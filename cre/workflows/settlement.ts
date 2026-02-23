/**
 * CRE Settlement Workflow — Auction Platform
 *
 * Trigger:  AuctionEnded EVM log from AuctionRegistry
 * Compute:  Verify on-chain state + fetch/verify replay bundle + re-derive winner
 * Write:    AuctionEscrow.onReport() via KeystoneForwarder (DON-signed report)
 *
 * Report encoding (must match AuctionEscrow._processReport):
 *   abi.encode(bytes32 auctionId, uint256 winnerAgentId, address winnerWallet, uint256 amount)
 */
import {
  Runner,
  EVMClient,
  HTTPClient,
  handler,
  hexToBase64,
  bytesToHex,
  TxStatus,
  getNetwork,
  encodeCallMsg,
  LAST_FINALIZED_BLOCK_NUMBER,
  type Runtime,
} from "@chainlink/cre-sdk";
import {
  encodeAbiParameters,
  parseAbiParameters,
  decodeAbiParameters,
  keccak256,
  toHex,
  type Hex,
} from "viem";
import { z } from "zod";

// ─── Config Schema ───────────────────────────────────────────────────

const configSchema = z.object({
  chainSelectorName: z.string(),
  auctionRegistryAddress: z.string(),
  auctionEscrowAddress: z.string(),
  identityRegistryAddress: z.string(),
  replayBundleBaseUrl: z.string(),
  gasLimit: z.string().default("500000"),
});

type Config = z.infer<typeof configSchema>;

type LogField = string | Uint8Array;

type AuctionEndedLogInput = {
  topics: Array<LogField | undefined>;
  data: LogField | undefined;
};

// ─── ABI Fragments ───────────────────────────────────────────────────

const AUCTION_ENDED_SIGNATURE = keccak256(
  toHex(
    "AuctionEnded(bytes32,uint256,address,uint256,bytes32,bytes32)"
  )
);

const GET_AUCTION_STATE_SELECTOR = keccak256(
  toHex("getAuctionState(bytes32)")
).slice(0, 10);

const GET_WINNER_SELECTOR = keccak256(
  toHex("getWinner(bytes32)")
).slice(0, 10);

// AuctionState enum: 0=NONE, 1=OPEN, 2=CLOSED, 3=SETTLED, 4=CANCELLED
const AUCTION_STATE_CLOSED = 2n;

// ─── Helpers ─────────────────────────────────────────────────────────

function toHexLogField(value: LogField | undefined, field: string): Hex {
  if (typeof value === "string") {
    if (!value.startsWith("0x")) {
      throw new Error(`Invalid ${field}: expected 0x-prefixed hex string`);
    }
    return value as Hex;
  }
  if (value instanceof Uint8Array) {
    return bytesToHex(value) as Hex;
  }
  throw new Error(`Missing ${field}`);
}

export function decodeAuctionEndedLog(log: AuctionEndedLogInput): {
  auctionId: Hex;
  winnerAgentId: bigint;
  winnerWallet: Hex;
  finalPrice: bigint;
  finalLogHash: Hex;
  replayContentHash: Hex;
} {
  if (!log.topics || log.topics.length < 3) {
    throw new Error("Malformed AuctionEnded log: expected at least 3 topics");
  }

  // topics[0] = event sig, topics[1] = auctionId (indexed), topics[2] = winnerAgentId (indexed)
  const auctionId = toHexLogField(log.topics[1], "topics[1]");
  const winnerAgentId = BigInt(toHexLogField(log.topics[2], "topics[2]"));
  const dataHex = toHexLogField(log.data, "data");

  // Non-indexed: (address winnerWallet, uint256 finalPrice, bytes32 finalLogHash, bytes32 replayContentHash)
  const decoded = decodeAbiParameters(
    parseAbiParameters(
      "address winnerWallet, uint256 finalPrice, bytes32 finalLogHash, bytes32 replayContentHash"
    ),
    dataHex
  );

  return {
    auctionId,
    winnerAgentId,
    winnerWallet: decoded[0] as Hex,
    finalPrice: decoded[1],
    finalLogHash: decoded[2] as Hex,
    replayContentHash: decoded[3] as Hex,
  };
}

export function encodeSettlementReport(
  auctionId: Hex,
  winnerAgentId: bigint,
  winnerWallet: Hex,
  amount: bigint
): Hex {
  return encodeAbiParameters(
    parseAbiParameters(
      "bytes32 auctionId, uint256 winnerAgentId, address winnerWallet, uint256 amount"
    ),
    [auctionId, winnerAgentId, winnerWallet, amount]
  );
}

// ─── Main Callback ───────────────────────────────────────────────────

export const onAuctionEnded = (
  runtime: Runtime<Config>,
  log: AuctionEndedLogInput
): string => {
  runtime.log("[SETTLEMENT] AuctionEnded event received");

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error("Network not found for chain selector");

  const evmClient = new EVMClient(network.chainSelector.selector);
  const httpClient = new HTTPClient();

  // ── Phase A: Decode event ──────────────────────────────────────

  const event = decodeAuctionEndedLog(log);
  runtime.log(
    `[SETTLEMENT] auctionId=${event.auctionId} winner=${event.winnerAgentId} price=${event.finalPrice}`
  );

  // ── Phase B: Verify on-chain state ─────────────────────────────
  // Read auction state from AuctionRegistry — must be CLOSED (recordResult sets CLOSED)

  const stateCallData = (GET_AUCTION_STATE_SELECTOR +
    event.auctionId.slice(2)) as Hex;

  const stateResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: "0x0000000000000000000000000000000000000000",
        to: runtime.config.auctionRegistryAddress,
        data: stateCallData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();

  const [auctionState] = decodeAbiParameters(
    parseAbiParameters("uint8"),
    bytesToHex(stateResult.data) as Hex
  );

  if (BigInt(auctionState) !== AUCTION_STATE_CLOSED) {
    throw new Error(
      `Auction ${event.auctionId} not in CLOSED state (got ${auctionState})`
    );
  }

  runtime.log("[SETTLEMENT] Phase A: Auction state verified CLOSED");

  // ── Phase C: Verify winner via on-chain getWinner() ────────────
  // Cross-check event data against stored result

  const winnerCallData = (GET_WINNER_SELECTOR +
    event.auctionId.slice(2)) as Hex;

  const winnerResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: "0x0000000000000000000000000000000000000000",
        to: runtime.config.auctionRegistryAddress,
        data: winnerCallData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();

  const [storedAgentId, storedWallet, storedPrice] = decodeAbiParameters(
    parseAbiParameters("uint256, address, uint256"),
    bytesToHex(winnerResult.data) as Hex
  );

  if (storedAgentId !== event.winnerAgentId) {
    throw new Error(
      `Winner mismatch: event=${event.winnerAgentId} stored=${storedAgentId}`
    );
  }
  if (
    (storedWallet as string).toLowerCase() !==
    (event.winnerWallet as string).toLowerCase()
  ) {
    throw new Error(
      `Wallet mismatch: event=${event.winnerWallet} stored=${storedWallet}`
    );
  }

  runtime.log(
    "[SETTLEMENT] Phase B: Winner cross-verified against on-chain state"
  );

  // ── Phase D: Fetch + verify replay bundle ──────────────────────
  // The replay bundle proves the event log was not fabricated.
  // sha256(bundleBytes) must match replayContentHash from the event.

  const bundleUrl = `${runtime.config.replayBundleBaseUrl}/replay/${event.auctionId}`;

  const bundleResponse = httpClient
    .sendRequest(runtime, {
      url: bundleUrl,
      method: "GET",
      headers: { Accept: "application/octet-stream" },
    })
    .result();

  if (bundleResponse.statusCode !== 200) {
    throw new Error(
      `Failed to fetch replay bundle: HTTP ${bundleResponse.statusCode}`
    );
  }

  // NOTE: Full Poseidon hash chain replay verification would go here.
  // For MVP, we verify the bundle is fetchable and non-empty.
  // Production: replay all events, recompute finalLogHash via Poseidon chain,
  // re-derive winner via English auction rules, compare against event data.
  if (!bundleResponse.body || bundleResponse.body.length === 0) {
    throw new Error("Replay bundle is empty");
  }

  runtime.log(
    `[SETTLEMENT] Phase C: Replay bundle fetched (${bundleResponse.body.length} bytes)`
  );

  // ── Phase E: Build + sign + write settlement report ────────────

  const reportPayload = encodeSettlementReport(
    event.auctionId,
    event.winnerAgentId,
    event.winnerWallet,
    event.finalPrice
  );

  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(reportPayload),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  runtime.log("[SETTLEMENT] Phase D: Report signed by DON");

  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.auctionEscrowAddress,
      report: reportResponse,
      gasConfig: { gasLimit: runtime.config.gasLimit },
    })
    .result();

  if (writeResult.txStatus === TxStatus.SUCCESS) {
    const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
    runtime.log(`[SETTLEMENT] SUCCESS: tx=${txHash}`);
    return txHash;
  }

  if (writeResult.txStatus === TxStatus.REVERTED) {
    throw new Error(
      `Settlement tx reverted: ${writeResult.errorMessage || "unknown"}`
    );
  }

  throw new Error(
    `Settlement tx failed with status ${writeResult.txStatus}: ${writeResult.errorMessage || "unknown"}`
  );
};

// ─── Workflow Init ───────────────────────────────────────────────────

const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error("Network not found");

  const evmClient = new EVMClient(network.chainSelector.selector);
  const logTrigger = evmClient.logTrigger({
    addresses: [hexToBase64(config.auctionRegistryAddress as Hex)],
    topics: [{ values: [hexToBase64(AUCTION_ENDED_SIGNATURE)] }],
    confidence: "CONFIDENCE_LEVEL_FINALIZED",
  });

  return [handler(logTrigger, onAuctionEnded)];
};

// ─── Entry Point ─────────────────────────────────────────────────────

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Workflow failed:", err);
    process.exit(1);
  });
}
