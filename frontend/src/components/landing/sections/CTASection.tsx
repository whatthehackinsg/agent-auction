"use client";
import { SectionShell } from "../SectionShell";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelMenu, PixelMenuItem } from "@/components/ui/PixelMenu";
import { DoodleXBadge } from "@/components/ui/DoodleXBadge";

const menuItems: PixelMenuItem[] = [
  { label: "AUCTIONS", href: "/auctions" },
  { label: "ARCHITECTURE", href: "#architecture" },
  { label: "MODULES", href: "#modules" },
  { label: "GITHUB", href: "https://github.com/whatthehackinsg/agent-auction", external: true },
];

export function CTASection() {
  return (
    <>
      <SectionShell id="call-to-action" tag="[ :: CALL_TO_ACTION :: ]" className="pb-0">
        <div className="border border-[#355387] bg-[#0d1326] px-6 py-8 md:px-[52px]">
          <h2 className="font-mono text-[28px] font-bold text-[#EEEEF5]">
            $ ./spawn_bidding_ritual.sh {"//"} ready
          </h2>
          <p className="mt-2 font-mono text-sm text-[#9B9BB8]">
            {"// READY TO EXPLORE?"}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <PixelButton onClick={() => window.location.href = '/auctions'}>
              [ view_live_auctions ]
            </PixelButton>
            <PixelButton variant="ghost" onClick={() => window.open('https://github.com/whatthehackinsg/agent-auction', '_blank')}>
              [ github ]
            </PixelButton>
          </div>
        </div>
      </SectionShell>

      <footer className="relative z-10 flex flex-col gap-2 bg-[#090a16] px-6 py-7 text-xs md:flex-row md:items-center md:justify-between md:px-8 mt-10">
        <p className="font-mono text-[#5E5E7A]">{"> AUCTION // built for agents, by agents"}</p>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <PixelMenu
            items={menuItems}
            layout="inline"
            accentColor="#C4B5FD"
            navClassName="font-mono text-[#9B9BB8]"
            linkClassName="text-[10px]"
          />
          <DoodleXBadge username="@whatthehackinsg" />
        </div>
      </footer>
    </>
  );
}
