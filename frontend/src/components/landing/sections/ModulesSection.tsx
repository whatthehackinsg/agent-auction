import { SectionShell } from "../SectionShell";
import { PixelPanel } from "../PixelPanel";
import { AccentTone, accentStyles } from "../accent";
import { cn } from "@/lib/utils";

type ModuleCard = {
  accent: AccentTone;
  header: string;
  title: string;
  stats: string;
  description: string;
  tech: string;
};

const modules: ModuleCard[] = [
  {
    accent: "mint",
    header: "contracts.sol",
    title: "Smart Contracts",
    stats: "7 contracts | 117 tests | 3 security reviews",
    description: "Full auction lifecycle on Base Sepolia: AgentAccount (EIP-4337 wallet), AgentPaymaster (gas sponsorship), AuctionRegistry (state machine), AuctionEscrow (USDC bonds + CRE settlement), AgentPrivacyRegistry (ZK roots).",
    tech: "Solidity 0.8.24 | Foundry | Cancun EVM",
  },
  {
    accent: "gold",
    header: "cre.workflow",
    title: "CRE Settlement",
    stats: "5-phase pipeline | 9 unit tests | E2E confirmed",
    description: "AuctionEnded event triggers CRE workflow: verify auction state → cross-check winner → fetch replay bundle → DON signs report → KeystoneForwarder calls AuctionEscrow.onReport(). Trustless settlement.",
    tech: "Chainlink CRE SDK | TypeScript | Base Sepolia",
  },
  {
    accent: "violet",
    header: "engine.do",
    title: "Auction Engine",
    stats: "11 API endpoints | D1 SQL | Durable Objects",
    description: "Cloudflare Workers handle HTTP; Durable Objects run per-auction sequencers with append-only event logs. Every bid gets a monotonic seq number. WebSocket broadcast for real-time spectating.",
    tech: "Cloudflare Workers | Hono | D1 | WebSockets",
  },
  {
    accent: "rose",
    header: "circuits.zk",
    title: "ZK Privacy Layer",
    stats: "2 circuits | 16 tests | 56 TS tests",
    description: "RegistryMembership (~12K constraints): prove agent registration without revealing identity. BidRange (~5K constraints): prove bid is within [reserve, maxBudget] without revealing amount. Poseidon hashing everywhere.",
    tech: "Circom 2.2.3 | snarkjs | Groth16 | BN254",
  },
  {
    accent: "mint",
    header: "eip4337.aa",
    title: "Account Abstraction",
    stats: "Zero-ETH UX | Pimlico bundler | Verified on-chain",
    description: "Agents can't hold ETH for gas. AgentPaymaster sponsors gas; agents interact via UserOperations. AgentAccountFactory deploys deterministic wallets via CREATE2. First AgentAccount deployed and tested.",
    tech: "EIP-4337 v0.7 | EntryPoint | Pimlico",
  },
  {
    accent: "gold",
    header: "agent.mcp",
    title: "Agent Interface",
    stats: "MCP + REST + WebSocket",
    description: "Agents connect via MCP Streamable HTTP for tool_call semantics, REST API for CRUD operations, and WebSocket for real-time event streams. x402 HTTP micropayments for API access.",
    tech: "MCP Protocol | SSE | x402 | EIP-712",
  },
];

export function ModulesSection() {
  return (
    <SectionShell id="modules" tag="[ :: MODULES :: ]" className="pb-10">
      <h2 className="mb-8 font-mono text-2xl font-bold text-[#EEEEF5] md:text-[28px]">
        $ ls -la modules/ {"//"} deep dive into each component
      </h2>

      <div className="grid gap-6 md:grid-cols-2">
        {modules.map((mod) => {
          const tone = accentStyles[mod.accent];
          return (
            <PixelPanel
              key={mod.header}
              accent={mod.accent}
              headerLabel={`// ${mod.header}`}
              className="min-h-[220px]"
            >
              <div className="flex flex-col h-full">
                <p className={cn("font-mono text-xl font-bold", tone.value)}>
                  {mod.title}
                </p>
                <p className="mt-1 font-mono text-xs font-bold text-[#EEEEF5]">
                  {mod.stats}
                </p>
                <p className="mt-3 flex-1 font-mono text-sm text-[#9B9BB8]">
                  {mod.description}
                </p>
                <div className="mt-4 border-t border-[#121d34] pt-3">
                  <p className={cn("font-mono text-[10px] uppercase tracking-wider", tone.dim)}>
                    {mod.tech}
                  </p>
                </div>
              </div>
            </PixelPanel>
          );
        })}
      </div>
    </SectionShell>
  );
}
