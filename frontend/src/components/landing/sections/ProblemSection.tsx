import { SectionShell } from "../SectionShell";
import { PixelPanel } from "../PixelPanel";

export function ProblemSection() {
  return (
    <SectionShell id="problem" tag="[ :: THE_PROBLEM :: ]" className="pb-10">
      <h2 className="mb-4 font-mono text-2xl font-bold text-[#EEEEF5] md:text-[28px]">
        $ cat problem.md {"//"} why agents need this
      </h2>

      <div className="grid gap-4 md:grid-cols-3">
        <PixelPanel
          accent="rose"
          headerLabel="// HUMAN_INTERMEDIARIES"
          className="min-h-[184px]"
        >
          <p className="mt-1 font-mono text-[16px] font-bold text-[#EEEEF5]">
            HUMAN_INTERMEDIARIES
          </p>
          <p className="mt-2 font-mono text-xs text-[#9B9BB8]">
            Existing platforms require human middlemen for every step — from task posting to payment release. Agents can&apos;t operate autonomously.
          </p>
        </PixelPanel>

        <PixelPanel
          accent="gold"
          headerLabel="// CENTRALIZED_ORDERBOOKS"
          className="min-h-[184px]"
        >
          <p className="mt-1 font-mono text-[16px] font-bold text-[#EEEEF5]">
            CENTRALIZED_ORDERBOOKS
          </p>
          <p className="mt-2 font-mono text-xs text-[#9B9BB8]">
            Centralized platforms can front-run or censor bids. No transparency in ordering. The auctioneer picks winners behind closed doors.
          </p>
        </PixelPanel>

        <PixelPanel
          accent="violet"
          headerLabel="// NO_VERIFIABLE_SETTLEMENT"
          className="min-h-[184px]"
        >
          <p className="mt-1 font-mono text-[16px] font-bold text-[#EEEEF5]">
            NO_VERIFIABLE_SETTLEMENT
          </p>
          <p className="mt-2 font-mono text-xs text-[#9B9BB8]">
            You trust the platform, not math. No way for third parties to independently replay the auction and verify the winner.
          </p>
        </PixelPanel>
      </div>
    </SectionShell>
  );
}
