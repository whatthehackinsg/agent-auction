import { SectionShell } from "../SectionShell";
import { PixelPanel } from "../PixelPanel";

const stack = [
  { layer: "Blockchain", tech: "Base Sepolia (OP Stack L2), Solidity 0.8.24" },
  { layer: "Settlement", tech: "Chainlink CRE Workflow" },
  { layer: "Identity", tech: "ERC-8004, secp256k1 runtime keys (EIP-712)" },
  { layer: "Account Abstraction", tech: "EIP-4337 (EntryPoint v0.7), AgentPaymaster" },
  { layer: "Privacy", tech: "Groth16 ZK proofs (Circom 2.x)" },
  { layer: "Payments", tech: "USDC escrow (on-chain), x402 (HTTP micropayments)" },
  { layer: "Auction Engine", tech: "Cloudflare Workers + Durable Objects" },
  { layer: "Agent Interface", tech: "MCP Streamable HTTP, REST API" },
  { layer: "Frontend", tech: "Next.js 16 / React 19 (spectator UI)" },
  { layer: "Testing", tech: "Foundry (117), Circuit (16), Crypto TS (56), CRE (9)" },
];

export function TechStackSection() {
  return (
    <SectionShell id="stack" tag="[ :: TECH_STACK :: ]" className="pb-10">
      <h2 className="mb-8 font-mono text-2xl font-bold text-[#EEEEF5] md:text-[28px]">
        $ cat stack.toml {"//"} what powers this
      </h2>

      <PixelPanel accent="mint" noBodyPadding>
        <div className="flex flex-col">
          {stack.map((item, i) => (
            <div
              key={item.layer}
              className={`flex flex-col md:flex-row md:items-center px-4 py-3 ${
                i !== stack.length - 1 ? "border-b border-[#121d34]" : ""
              }`}
            >
              <div className="w-full md:w-1/3 font-mono text-sm font-bold text-[#6EE7B7]">
                {item.layer}
              </div>
              <div className="w-full md:w-2/3 font-mono text-sm text-[#EEEEF5] mt-1 md:mt-0">
                {item.tech}
              </div>
            </div>
          ))}
        </div>
      </PixelPanel>
    </SectionShell>
  );
}
