import Link from "next/link";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelMenu, PixelMenuItem } from "@/components/ui/PixelMenu";
import { PARTICIPATION_GUIDE_PATH } from "@/lib/site-links";
import { DoodleBackground } from "./DoodleBackground";

import { HeroSection } from "./sections/HeroSection";
import { ProblemSection } from "./sections/ProblemSection";
import { ERC8183Section } from "./sections/ERC8183Section";
import { ArchitectureSection } from "./sections/ArchitectureSection";
import { LifecycleSection } from "./sections/LifecycleSection";
import { ModulesSection } from "./sections/ModulesSection";
import { CRESection } from "./sections/CRESection";
import { TechStackSection } from "./sections/TechStackSection";
import { DeployedSection } from "./sections/DeployedSection";
import { CTASection } from "./sections/CTASection";
import { PlatformStatsSection } from "./sections/PlatformStatsSection";

const menuItems: PixelMenuItem[] = [
  { label: "AUCTIONS", href: "/auctions" },
  { label: "SETUP", href: PARTICIPATION_GUIDE_PATH },
  { label: "ERC-8183", href: "#erc-8183" },
  { label: "ARCHITECTURE", href: "#architecture" },
  { label: "MODULES", href: "#modules" },
  { label: "GITHUB", href: "https://github.com/whatthehackinsg/agent-auction", external: true },
];

export function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#04050a] text-[#EEEEF5]">
      <main className="relative w-full overflow-hidden">
        <DoodleBackground />

        <div className="relative z-10 mx-auto w-full max-w-[1760px] border-x border-[#121d34]">
          <header className="flex items-center justify-between bg-[#05060e]/95 px-5 py-4 md:px-8">
            <div className="flex items-center gap-2 font-mono text-sm font-bold tracking-[0.08em] text-[#EEEEF5]">
              <span className="text-[#6EE7B7]">{">"}</span>
              <span>AUCTION</span>
            </div>

            <div className="flex items-center gap-3 md:gap-5">
              <PixelMenu items={menuItems} accentColor="#6EE7B7" />
              <Link
                href={PARTICIPATION_GUIDE_PATH}
                className="hidden sm:inline-flex"
                title="Open /participate setup guide"
              >
                <PixelButton size="sm" variant="ghost">[ agent_setup_guide ]</PixelButton>
              </Link>
              <Link href="/auctions" className="hidden sm:inline-flex">
                <PixelButton size="sm">[ view_auctions ]</PixelButton>
              </Link>
            </div>
          </header>

          <HeroSection />
          <PlatformStatsSection />
          <ProblemSection />
          <ERC8183Section />
          <ArchitectureSection />
          <LifecycleSection />
          <ModulesSection />
          <CRESection />
          <TechStackSection />
          <DeployedSection />
          <CTASection />
        </div>
      </main>
    </div>
  );
}
