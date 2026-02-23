import { describe, expect } from "bun:test";
import {
  test,
  newTestRuntime,
  EvmMock,
  HttpActionsMock,
} from "@chainlink/cre-sdk/test";
import { bytesToHex, hexToBase64, type Runtime } from "@chainlink/cre-sdk";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  hexToBytes,
  keccak256,
  parseAbiParameters,
  toHex,
  type Hex,
} from "viem";
import {
  decodeAuctionEndedLog,
  encodeSettlementReport,
  onAuctionEnded,
} from "./settlement/helpers";

const CHAIN_SELECTOR = 10344971235874465080n;
const CHAIN_SELECTOR_NAME = "ethereum-testnet-sepolia-base-1";

const MOCK_AUCTION_ID = (`0x${"ab".repeat(32)}`) as Hex;
const MOCK_WINNER_AGENT_ID = 42n;
const MOCK_WINNER_WALLET =
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Hex;
const MOCK_FINAL_PRICE = 1_000_000n;
const MOCK_FINAL_LOG_HASH = (`0x${"cd".repeat(32)}`) as Hex;
const MOCK_REPLAY_HASH = (`0x${"ef".repeat(32)}`) as Hex;
const MOCK_TX_HASH = (`0x${"11".repeat(32)}`) as Hex;

const GET_AUCTION_STATE_SELECTOR = keccak256(
  toHex("getAuctionState(bytes32)")
).slice(0, 10);
const GET_WINNER_SELECTOR = keccak256(toHex("getWinner(bytes32)")).slice(0, 10);

const AUCTION_ENDED_SIGNATURE = keccak256(
  toHex("AuctionEnded(bytes32,uint256,address,uint256,bytes32,bytes32)")
) as Hex;

const BASE_CONFIG = {
  chainSelectorName: CHAIN_SELECTOR_NAME,
  auctionRegistryAddress: "0xFEc7a05707AF85C6b248314E20FF8EfF590c3639",
  auctionEscrowAddress: "0x20944f46AB83F7eA40923D7543AF742Da829743c",
  identityRegistryAddress: "0x68E06c33D4957102362ACffC2BFF9E6b38199318",
  replayBundleBaseUrl: "https://api.auction.example.com",
  gasLimit: "500000",
};

function makeRuntime(): Runtime<typeof BASE_CONFIG> {
  const runtime = newTestRuntime() as unknown as Runtime<typeof BASE_CONFIG>;
  runtime.config = { ...BASE_CONFIG };
  return runtime;
}

function makeAuctionEndedLog() {
  const winnerAgentTopic = toHex(MOCK_WINNER_AGENT_ID, { size: 32 });
  const data = encodeAbiParameters(
    parseAbiParameters(
      "address winnerWallet, uint256 finalPrice, bytes32 finalLogHash, bytes32 replayContentHash"
    ),
    [
      MOCK_WINNER_WALLET,
      MOCK_FINAL_PRICE,
      MOCK_FINAL_LOG_HASH,
      MOCK_REPLAY_HASH,
    ]
  );

  return {
    topics: [
      hexToBytes(AUCTION_ENDED_SIGNATURE),
      hexToBytes(MOCK_AUCTION_ID),
      hexToBytes(winnerAgentTopic),
    ],
    data: hexToBytes(data),
  };
}

describe("settlement workflow", () => {
  test("decodeAuctionEndedLog decodes event fields", () => {
    const decoded = decodeAuctionEndedLog(makeAuctionEndedLog());

    expect(decoded.auctionId).toBe(MOCK_AUCTION_ID);
    expect(decoded.winnerAgentId).toBe(MOCK_WINNER_AGENT_ID);
    expect(decoded.winnerWallet.toLowerCase()).toBe(
      MOCK_WINNER_WALLET.toLowerCase()
    );
    expect(decoded.finalPrice).toBe(MOCK_FINAL_PRICE);
    expect(decoded.finalLogHash).toBe(MOCK_FINAL_LOG_HASH);
    expect(decoded.replayContentHash).toBe(MOCK_REPLAY_HASH);
  });

  test("encodeSettlementReport encodes expected payload", () => {
    const encoded = encodeSettlementReport(
      MOCK_AUCTION_ID,
      MOCK_WINNER_AGENT_ID,
      MOCK_WINNER_WALLET,
      MOCK_FINAL_PRICE
    );

    const [auctionId, winnerAgentId, winnerWallet, amount] = decodeAbiParameters(
      parseAbiParameters(
        "bytes32 auctionId, uint256 winnerAgentId, address winnerWallet, uint256 amount"
      ),
      encoded
    );

    expect(auctionId).toBe(MOCK_AUCTION_ID);
    expect(winnerAgentId).toBe(MOCK_WINNER_AGENT_ID);
    expect((winnerWallet as string).toLowerCase()).toBe(
      MOCK_WINNER_WALLET.toLowerCase()
    );
    expect(amount).toBe(MOCK_FINAL_PRICE);
  });

  test("settles auction successfully", () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR);
    const httpMock = HttpActionsMock.testInstance();

    evmMock.callContract = (input) => {
      const callData = bytesToHex(input.call?.data ?? new Uint8Array());

      if (callData.startsWith(GET_AUCTION_STATE_SELECTOR)) {
        const encodedState = encodeAbiParameters(parseAbiParameters("uint8"), [2]);
        return { data: hexToBase64(encodedState) };
      }

      if (callData.startsWith(GET_WINNER_SELECTOR)) {
        const encodedWinner = encodeAbiParameters(
          parseAbiParameters("uint256, address, uint256"),
          [MOCK_WINNER_AGENT_ID, MOCK_WINNER_WALLET, MOCK_FINAL_PRICE]
        );
        return { data: hexToBase64(encodedWinner) };
      }

      throw new Error(`Unexpected call data: ${callData}`);
    };

    evmMock.writeReport = () => ({
      txStatus: "TX_STATUS_SUCCESS",
      txHash: hexToBase64(MOCK_TX_HASH),
    });

    httpMock.sendRequest = () => ({
      statusCode: 200,
      body: Buffer.from("mock-replay-bundle", "utf8").toString("base64"),
    });

    const runtime = makeRuntime();
    const txHash = onAuctionEnded(runtime, makeAuctionEndedLog());
    expect(txHash).toBe(MOCK_TX_HASH);
  });

  test("throws when auction is not CLOSED", () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR);

    evmMock.callContract = () => {
      const encodedState = encodeAbiParameters(parseAbiParameters("uint8"), [1]);
      return { data: hexToBase64(encodedState) };
    };

    const runtime = makeRuntime();
    expect(() => onAuctionEnded(runtime, makeAuctionEndedLog())).toThrow(
      "not in CLOSED state"
    );
  });

  test("throws when winner mismatches on-chain state", () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR);
    let callCount = 0;

    evmMock.callContract = () => {
      callCount += 1;

      if (callCount === 1) {
        const encodedState = encodeAbiParameters(parseAbiParameters("uint8"), [2]);
        return { data: hexToBase64(encodedState) };
      }

      const encodedWinner = encodeAbiParameters(
        parseAbiParameters("uint256, address, uint256"),
        [999n, MOCK_WINNER_WALLET, MOCK_FINAL_PRICE]
      );
      return { data: hexToBase64(encodedWinner) };
    };

    const runtime = makeRuntime();
    expect(() => onAuctionEnded(runtime, makeAuctionEndedLog())).toThrow(
      "Winner mismatch"
    );
  });

  test("throws when replay bundle fetch fails", () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR);
    const httpMock = HttpActionsMock.testInstance();
    let callCount = 0;

    evmMock.callContract = () => {
      callCount += 1;

      if (callCount === 1) {
        const encodedState = encodeAbiParameters(parseAbiParameters("uint8"), [2]);
        return { data: hexToBase64(encodedState) };
      }

      const encodedWinner = encodeAbiParameters(
        parseAbiParameters("uint256, address, uint256"),
        [MOCK_WINNER_AGENT_ID, MOCK_WINNER_WALLET, MOCK_FINAL_PRICE]
      );
      return { data: hexToBase64(encodedWinner) };
    };

    httpMock.sendRequest = () => ({ statusCode: 500, body: "" });

    const runtime = makeRuntime();
    expect(() => onAuctionEnded(runtime, makeAuctionEndedLog())).toThrow(
      "Failed to fetch replay bundle"
    );
  });

  test("throws when writeReport reverts", () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR);
    const httpMock = HttpActionsMock.testInstance();
    let callCount = 0;

    evmMock.callContract = () => {
      callCount += 1;

      if (callCount === 1) {
        const encodedState = encodeAbiParameters(parseAbiParameters("uint8"), [2]);
        return { data: hexToBase64(encodedState) };
      }

      const encodedWinner = encodeAbiParameters(
        parseAbiParameters("uint256, address, uint256"),
        [MOCK_WINNER_AGENT_ID, MOCK_WINNER_WALLET, MOCK_FINAL_PRICE]
      );
      return { data: hexToBase64(encodedWinner) };
    };

    httpMock.sendRequest = () => ({
      statusCode: 200,
      body: Buffer.from("mock-replay-bundle", "utf8").toString("base64"),
    });

    evmMock.writeReport = () => ({
      txStatus: "TX_STATUS_REVERTED",
      errorMessage: "receiver revert",
    });

    const runtime = makeRuntime();
    expect(() => onAuctionEnded(runtime, makeAuctionEndedLog())).toThrow(
      "Settlement tx reverted"
    );
  });
});
