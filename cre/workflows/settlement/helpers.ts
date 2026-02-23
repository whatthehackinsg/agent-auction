import {
  bytesToHex,
  type Runtime,
  EVMClient,
  HTTPClient,
  hexToBase64,
  TxStatus,
  getNetwork,
  encodeCallMsg,
  LATEST_BLOCK_NUMBER,
} from "@chainlink/cre-sdk";
import {
  encodeAbiParameters,
  parseAbiParameters,
  decodeAbiParameters,
  keccak256,
  toHex,
  type Hex,
} from "viem";

export const AUCTION_ENDED_SIGNATURE = keccak256(
  toHex("AuctionEnded(bytes32,uint256,address,uint256,bytes32,bytes32)")
);

const GET_AUCTION_STATE_SELECTOR = keccak256(
  toHex("getAuctionState(bytes32)")
).slice(0, 10);

const GET_WINNER_SELECTOR = keccak256(
  toHex("getWinner(bytes32)")
).slice(0, 10);

const AUCTION_STATE_CLOSED = 2n;

type LogField = string | Uint8Array;

export type AuctionEndedLogInput = {
  topics: Array<LogField | undefined>;
  data: LogField | undefined;
};

export type Config = {
  chainSelectorName: string;
  auctionRegistryAddress: string;
  auctionEscrowAddress: string;
  identityRegistryAddress: string;
  replayBundleBaseUrl: string;
  gasLimit: string;
  skipReplayVerification?: string;
};

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

  const auctionId = toHexLogField(log.topics[1], "topics[1]");
  const winnerAgentId = BigInt(toHexLogField(log.topics[2], "topics[2]"));
  const dataHex = toHexLogField(log.data, "data");

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

  const event = decodeAuctionEndedLog(log);
  runtime.log(
    `[SETTLEMENT] auctionId=${event.auctionId} winner=${event.winnerAgentId} price=${event.finalPrice}`
  );

  // ── Phase A: Verify auction state is CLOSED ────────────────────

  const stateCallData = (GET_AUCTION_STATE_SELECTOR +
    event.auctionId.slice(2)) as Hex;

  const stateResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: "0x0000000000000000000000000000000000000000",
        to: runtime.config.auctionRegistryAddress,
        data: stateCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
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

  // ── Phase B: Cross-verify winner against on-chain state ────────

  const winnerCallData = (GET_WINNER_SELECTOR +
    event.auctionId.slice(2)) as Hex;

  const winnerResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: "0x0000000000000000000000000000000000000000",
        to: runtime.config.auctionRegistryAddress,
        data: winnerCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
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

  // ── Phase C: Replay bundle verification ────────────────────────

  if (runtime.config.skipReplayVerification === "true") {
    runtime.log(
      "[SETTLEMENT] Phase C: Replay verification SKIPPED (skipReplayVerification=true)"
    );
  } else {
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

    if (!bundleResponse.body || bundleResponse.body.length === 0) {
      throw new Error("Replay bundle is empty");
    }

    runtime.log(
      `[SETTLEMENT] Phase C: Replay bundle fetched (${bundleResponse.body.length} bytes)`
    );
  }

  // ── Phase D: Sign settlement report ────────────────────────────

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

  // ── Phase E: Write report to AuctionEscrow via forwarder ───────

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
