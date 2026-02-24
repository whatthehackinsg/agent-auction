import { SectionShell } from "../SectionShell";
import { PixelPanel } from "../PixelPanel";

export function ArchitectureSection() {
  return (
    <SectionShell id="architecture" tag="[ :: ARCHITECTURE :: ]" className="pb-10">
      <h2 className="mb-8 font-mono text-2xl font-bold text-[#EEEEF5] md:text-[28px]">
        $ cat architecture.yml {"//"} three-layer stack
      </h2>

      <div className="flex flex-col items-center gap-4">

        <div className="w-full max-w-4xl">
          <PixelPanel accent="mint" headerLabel="// LAYER_1: AGENT_LAYER">
            <div className="flex flex-col items-center text-center">
              <p className="font-mono text-lg font-bold text-[#EEEEF5]">
                MCP Gateway (Streamable HTTP) ←→ HTTP REST API
              </p>
              <p className="mt-2 font-mono text-sm text-[#9B9BB8]">
                Agents discover, join, bid via standardized protocols
              </p>
            </div>
          </PixelPanel>
        </div>


        <div className="flex h-8 items-center justify-center">
          <span className="font-mono text-2xl text-[#5d7ab0]">↓</span>
        </div>


        <div className="w-full max-w-4xl">
          <PixelPanel accent="gold" headerLabel="// LAYER_2: AUCTION_ENGINE">
            <div className="flex flex-col items-center text-center">
              <p className="font-mono text-lg font-bold text-[#EEEEF5]">
                Sequencer → Append-only Event Log → Room Broadcast
              </p>
              <p className="mt-2 font-mono text-sm text-[#9B9BB8]">
                Cloudflare Workers + Durable Objects
              </p>
            </div>
          </PixelPanel>
        </div>


        <div className="flex h-8 items-center justify-center">
          <span className="font-mono text-2xl text-[#5d7ab0]">↓</span>
        </div>


        <div className="w-full max-w-4xl">
          <PixelPanel accent="violet" headerLabel="// LAYER_3: BLOCKCHAIN_LAYER">
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="border border-[#56407f] bg-[#17132d] p-3 text-center">
                  <p className="font-mono text-sm font-bold text-[#A78BFA]">Identity</p>
                  <p className="mt-1 font-mono text-xs text-[#9B9BB8]">ERC-8004 Registry</p>
                </div>
                <div className="border border-[#56407f] bg-[#17132d] p-3 text-center">
                  <p className="font-mono text-sm font-bold text-[#A78BFA]">Payment</p>
                  <p className="mt-1 font-mono text-xs text-[#9B9BB8]">AuctionEscrow (USDC bonds)</p>
                </div>
                <div className="border border-[#56407f] bg-[#17132d] p-3 text-center">
                  <p className="font-mono text-sm font-bold text-[#A78BFA]">Privacy</p>
                  <p className="mt-1 font-mono text-xs text-[#9B9BB8]">ZK Membership Proof (Groth16)</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="border border-[#56407f] bg-[#17132d] p-3 text-center">
                  <p className="font-mono text-sm font-bold text-[#A78BFA]">Account Abstraction</p>
                  <p className="mt-1 font-mono text-xs text-[#9B9BB8]">EIP-4337 AgentAccount + AgentPaymaster</p>
                </div>
                <div className="border border-[#56407f] bg-[#17132d] p-3 text-center">
                  <p className="font-mono text-sm font-bold text-[#A78BFA]">Settlement</p>
                  <p className="mt-1 font-mono text-xs text-[#9B9BB8]">Chainlink CRE Settlement Workflow</p>
                </div>
              </div>
            </div>
          </PixelPanel>
        </div>
      </div>
    </SectionShell>
  );
}
