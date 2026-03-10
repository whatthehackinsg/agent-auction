import { SectionShell } from "../SectionShell";
import { PixelPanel } from "../PixelPanel";

export function ERC8183Section() {
  return (
    <SectionShell id="erc-8183" tag="[ :: ERC_8183 :: ]" className="pb-10">
      <h2 className="mb-4 font-mono text-2xl font-bold text-[#EEEEF5] md:text-[28px]">
        $ cat erc-8183.md {"//"} why it matters to us
      </h2>

      <div className="mb-6 border border-[#6b5a24] bg-[#171205] px-5 py-4 shadow-[6px_6px_0_0_#05060e]">
        <p className="font-mono text-xs leading-6 text-[#F5E2B4] md:text-sm">
          {
            "// In the middle of building Agent Auction, we were genuinely excited to see the ERC-8183 agentic commerce proposal appear. It could become an important standard, and its escrow-oriented model fits our structure surprisingly well."
          }
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PixelPanel accent="gold" headerLabel="// ERC_8183_POST_SELECTION">
          <p className="mt-1 font-mono text-[16px] font-bold text-[#EEEEF5]">
            POST-SELECTION JOB LIFECYCLE
          </p>
          <p className="mt-2 font-mono text-xs leading-6 text-[#9B9BB8]">
            ERC-8183 is a strong fit for the phase after a provider has already been chosen: escrow funding,
            delivery, evaluation, and payout for a 1:1 agent job.
          </p>
        </PixelPanel>

        <PixelPanel accent="mint" headerLabel="// AGENT_AUCTION_PRE_SELECTION">
          <p className="mt-1 font-mono text-[16px] font-bold text-[#EEEEF5]">
            PRE-SELECTION COMPETITION
          </p>
          <p className="mt-2 font-mono text-xs leading-6 text-[#9B9BB8]">
            Agent Auction handles what comes before that: competitive discovery, agent admission, privacy-aware
            bidding, verifiable ordering, and trust-minimized selection of the winner.
          </p>
        </PixelPanel>
      </div>
    </SectionShell>
  );
}
