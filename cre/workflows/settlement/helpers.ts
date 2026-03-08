import {
  bytesToHex,
  type Runtime,
  type NodeRuntime,
  EVMClient,
  HTTPClient,
  hexToBase64,
  TxStatus,
  getNetwork,
  encodeCallMsg,
  LAST_FINALIZED_BLOCK_NUMBER,
} from "@chainlink/cre-sdk";
import {
  encodeAbiParameters,
  parseAbiParameters,
  decodeAbiParameters,
  keccak256,
  sha256,
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
  replayBundleBaseUrl: string;
  gasLimit: string;
  skipReplayVerification?: string;
  /** "true" for testnet chains, "false" for mainnet. Default: "true" */
  isTestnet?: string;
  /** "true" to use LAST_FINALIZED_BLOCK_NUMBER for callContract reads (production DON).
   *  "false" to omit blockNumber (simulation mode — avoids L2 finality lag). Default: "false" */
  useFinalized?: string;
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

function decodeReplayBody(body: string | Uint8Array): Uint8Array {
  if (body instanceof Uint8Array) {
    return body;
  }
  if (typeof body === "string") {
    if (body.length === 0) return new Uint8Array();
    return decodeBase64(body);
  }
  throw new Error("Replay bundle response body is missing or invalid");
}

function sha256Hex(bytes: Uint8Array): Hex {
  return sha256(bytes);
}

function decodeBase64(input: string): Uint8Array {
  const clean = input.replace(/\s+/g, "");
  if (clean.length % 4 !== 0) {
    throw new Error("Invalid base64 replay bundle");
  }

  const padding =
    clean.endsWith("==") ? 2 :
    clean.endsWith("=") ? 1 :
    0;
  const output = new Uint8Array((clean.length / 4) * 3 - padding);

  let out = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = decodeBase64Char(clean[i]);
    const c1 = decodeBase64Char(clean[i + 1]);
    const c2 = clean[i + 2] === "=" ? 0 : decodeBase64Char(clean[i + 2]);
    const c3 = clean[i + 3] === "=" ? 0 : decodeBase64Char(clean[i + 3]);
    const chunk = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;

    output[out++] = (chunk >> 16) & 0xff;
    if (clean[i + 2] !== "=") {
      output[out++] = (chunk >> 8) & 0xff;
    }
    if (clean[i + 3] !== "=") {
      output[out++] = chunk & 0xff;
    }
  }

  return output;
}

function decodeBase64Char(char: string): number {
  const code = char.charCodeAt(0);

  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 71;
  if (code >= 48 && code <= 57) return code + 4;
  if (char === "+") return 62;
  if (char === "/") return 63;

  throw new Error(`Invalid base64 character in replay bundle: ${char}`);
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

  const isTestnet = runtime.config.isTestnet !== "false";
  const useFinalized = runtime.config.useFinalized === "true";

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet,
  });
  if (!network) throw new Error("Network not found for chain selector");

  const evmClient = new EVMClient(network.chainSelector.selector);
  const httpClient = new HTTPClient();
  const readOpts = useFinalized ? { blockNumber: LAST_FINALIZED_BLOCK_NUMBER } : {};

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
        to: runtime.config.auctionRegistryAddress as Hex,
        data: stateCallData,
      }),
      ...readOpts,
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
        to: runtime.config.auctionRegistryAddress as Hex,
        data: winnerCallData,
      }),
      ...readOpts,
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
  if (storedPrice !== event.finalPrice) {
    throw new Error(
      `Price mismatch: event=${event.finalPrice} stored=${storedPrice}`
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
    const baseUrl = runtime.config.replayBundleBaseUrl;
    if (!baseUrl || baseUrl.includes("example.com")) {
      throw new Error(
        "replayBundleBaseUrl is not configured \u2014 set a real URL or enable skipReplayVerification"
      );
    }
    const bundleUrl = `${baseUrl}/auctions/${event.auctionId}/replay`;
    const bundleResponse = httpClient
      .sendRequest(runtime as unknown as NodeRuntime<Config>, {
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
    const replayBytes = decodeReplayBody(bundleResponse.body as string | Uint8Array);
    if (replayBytes.length === 0) {
      throw new Error("Replay bundle is empty");
    }
    const computedReplayHash = sha256Hex(replayBytes);
    if (computedReplayHash.toLowerCase() !== event.replayContentHash.toLowerCase()) {
      throw new Error(
        `Replay content hash mismatch: expected=${event.replayContentHash} computed=${computedReplayHash}`
      );
    }
    runtime.log(
      `[SETTLEMENT] Phase C: Replay bundle hash verified (${replayBytes.length} bytes)`
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
