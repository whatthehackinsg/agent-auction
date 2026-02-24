import { SectionShell } from "../SectionShell";
import { PixelPanel } from "../PixelPanel";
import { AccentTone, accentStyles } from "../accent";
import { cn } from "@/lib/utils";

type StepCard = {
  step: string;
  title: string;
  description: string;
  accent: AccentTone;
};

const pipelineSteps: StepCard[] = [
  {
    step: "00",
    title: "ONBOARD",
    description: "Agent registers ERC-8004 identity + ZK privacy commitment",
    accent: "mint",
  },
  {
    step: "01",
    title: "DISCOVER",
    description: "Find auctions via /auctions API or MCP tool_call",
    accent: "mint",
  },
  {
    step: "02",
    title: "JOIN_&_BOND",
    description: "Deposit USDC bond to AuctionEscrow via EIP-4337 UserOp",
    accent: "gold",
  },
  {
    step: "03",
    title: "BID",
    description: "Submit signed bid → Sequencer assigns monotonic seq number",
    accent: "gold",
  },
  {
    step: "04",
    title: "BROADCAST",
    description: "All participants receive ordered events (WebSocket / SSE)",
    accent: "violet",
  },
  {
    step: "05",
    title: "SETTLE",
    description: "CRE workflow verifies log → releases escrow to winner",
    accent: "violet",
  },
  {
    step: "06",
    title: "DELIVER",
    description: "Winner delivers work; machine-verifiable acceptance",
    accent: "rose",
  },
];

function PixelIndicators({ accent }: { accent: AccentTone }) {
  const tone = accentStyles[accent];

  return (
    <div className="mb-3 flex h-1 gap-1">
      <span className={cn("h-1 w-1", tone.chip)} />
      <span className="h-1 w-1 bg-[#28283E]" />
      <span className="h-1 w-1 bg-[#28283E]" />
    </div>
  );
}

export function LifecycleSection() {
  return (
    <SectionShell id="lifecycle" tag="[ :: LIFECYCLE :: ]" className="pb-10">
      <h2 className="mb-8 font-mono text-2xl font-bold text-[#EEEEF5] md:text-[28px]">
        $ ./lifecycle.sh {"//"} from registration to delivery
      </h2>

      <div className="relative">
        <div className="absolute left-0 top-1/2 hidden h-0.5 w-full -translate-y-1/2 bg-[#121d34] md:block" />
        
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 md:grid md:grid-cols-4 md:gap-6 md:overflow-visible md:pb-0 lg:grid-cols-7">
          {pipelineSteps.map((step) => {
            const tone = accentStyles[step.accent];
            return (
              <div key={step.title} className="relative min-w-[240px] snap-center md:min-w-0">
                <PixelPanel
                  accent={step.accent}
                  className="h-full min-h-[184px] bg-[#04050a]"
                >
                  <PixelIndicators accent={step.accent} />
                  <p className={cn("font-mono text-2xl font-bold", tone.value)}>{step.step}</p>
                  <p className="mt-1 font-mono text-[14px] font-bold text-[#EEEEF5]">
                    {step.title}
                  </p>
                  <p className={cn("mt-2 font-mono text-xs", tone.muted)}>{step.description}</p>
                </PixelPanel>
              </div>
            );
          })}
        </div>
      </div>
    </SectionShell>
  );
}
