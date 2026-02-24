import { SectionShell } from "../SectionShell";
import { PixelPanel } from "../PixelPanel";

export function CRESection() {
  return (
    <SectionShell id="cre" tag="[ :: CHAINLINK_CRE :: ]" className="pb-10">
      <h2 className="mb-8 font-mono text-2xl font-bold text-[#EEEEF5] md:text-[28px]">
        $ cre workflow simulate {"//"} the core integration
      </h2>

      <div className="mb-12 flex flex-col items-center">
        <div className="w-full max-w-3xl border border-[#355387] bg-[#0d1326] p-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4">
              <div className="flex h-8 w-24 shrink-0 items-center justify-center bg-[#F5C46E] font-mono text-xs font-bold text-[#0C0C1D]">
                TRIGGER
              </div>
              <p className="font-mono text-sm text-[#EEEEF5]">EVM Log — AuctionEnded event (FINALIZED confidence)</p>
            </div>
            
            <div className="ml-11 h-4 w-0.5 bg-[#355387]" />
            
            <div className="flex items-center gap-4">
              <div className="flex h-8 w-24 shrink-0 items-center justify-center border border-[#6EE7B7] bg-[#101b27] font-mono text-xs font-bold text-[#6EE7B7]">
                PHASE_A
              </div>
              <p className="font-mono text-sm text-[#EEEEF5]">State Check — verify auction is CLOSED on-chain</p>
            </div>

            <div className="ml-11 h-4 w-0.5 bg-[#355387]" />
            
            <div className="flex items-center gap-4">
              <div className="flex h-8 w-24 shrink-0 items-center justify-center border border-[#6EE7B7] bg-[#101b27] font-mono text-xs font-bold text-[#6EE7B7]">
                PHASE_B
              </div>
              <p className="font-mono text-sm text-[#EEEEF5]">Winner Cross-Verification — compare agentId + wallet + finalPrice</p>
            </div>

            <div className="ml-11 h-4 w-0.5 bg-[#355387]" />
            
            <div className="flex items-center gap-4">
              <div className="flex h-8 w-24 shrink-0 items-center justify-center border border-[#6EE7B7] bg-[#101b27] font-mono text-xs font-bold text-[#6EE7B7]">
                PHASE_C
              </div>
              <p className="font-mono text-sm text-[#EEEEF5]">Replay Bundle — fetch from platform API, verify non-empty</p>
            </div>

            <div className="ml-11 h-4 w-0.5 bg-[#355387]" />
            
            <div className="flex items-center gap-4">
              <div className="flex h-8 w-24 shrink-0 items-center justify-center border border-[#A78BFA] bg-[#17132d] font-mono text-xs font-bold text-[#A78BFA]">
                PHASE_D+E
              </div>
              <p className="font-mono text-sm text-[#EEEEF5]">DON signs report → writeReport → KeystoneForwarder → AuctionEscrow.onReport()</p>
            </div>

            <div className="ml-11 h-4 w-0.5 bg-[#355387]" />
            
            <div className="flex items-center gap-4">
              <div className="flex h-8 w-24 shrink-0 items-center justify-center bg-[#6EE7B7] font-mono text-xs font-bold text-[#0C0C1D]">
                RESULT
              </div>
              <p className="font-mono text-sm text-[#EEEEF5]">Winner&apos;s bond released, losers can self-claim refunds</p>
            </div>
          </div>
        </div>
      </div>

      <h3 className="mb-6 font-mono text-xl font-bold text-[#EEEEF5]">
        {"// WHY CRE MATTERS"}
      </h3>

      <div className="grid gap-4 md:grid-cols-3">
        <PixelPanel accent="mint" headerLabel="// VERIFIABLE_COMPUTATION">
          <p className="mt-2 font-mono text-sm text-[#9B9BB8]">
            Settlement logic runs off-chain but result is cryptographically verified on-chain via DON consensus
          </p>
        </PixelPanel>
        <PixelPanel accent="gold" headerLabel="// AUTOMATION">
          <p className="mt-2 font-mono text-sm text-[#9B9BB8]">
            No manual trigger needed — AuctionEnded event kicks off the entire flow automatically
          </p>
        </PixelPanel>
        <PixelPanel accent="violet" headerLabel="// DECOUPLED_TRUST">
          <p className="mt-2 font-mono text-sm text-[#9B9BB8]">
            Sequencer orders bids, but CRE independently verifies the outcome. Malicious sequencer cannot fabricate winners
          </p>
        </PixelPanel>
      </div>
    </SectionShell>
  );
}
