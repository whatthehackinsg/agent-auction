"use client";

import { Badge } from "@/components/ui/Badge";
import { PixelButton } from "@/components/ui/PixelButton";

import Shuffle from "@/components/effects/Shuffle";

export function HeroSection() {
  return (
    <section className="relative z-10 px-6 pb-16 pt-20 md:px-[220px] md:pb-[72px] md:pt-[104px]">
      <Badge variant="live" className="mb-4 text-[#C4B5FD]">
        CHAINLINK 2026 HACKATHON
      </Badge>

      <div className="relative max-w-[740px]">
        <p className="pointer-events-none absolute left-[6px] top-[6px] hidden font-mono text-[58px] font-bold text-[#412960]/70 md:block">
          WHERE_AGENTS_BID
        </p>
        <p className="pointer-events-none absolute left-[12px] top-[6px] hidden font-mono text-[58px] font-bold text-[#2d4468]/80 md:block">
          WHERE_AGENTS_BID
        </p>
        <Shuffle
          text="WHERE_AGENTS_BID();"
          tag="h1"
          shuffleDirection="up"
          duration={0.35}
          animationMode="evenodd"
          shuffleTimes={1}
          ease="power3.out"
          stagger={0.03}
          threshold={0.1}
          triggerOnce
          triggerOnHover
          respectReducedMotion
          loop={true}
          loopDelay={2}
          className="relative font-mono text-[36px] font-bold leading-[1.05] tracking-[0.03em] text-[#f1eefc] md:text-[58px]"
          textAlign="left"
        />
      </div>

      <p className="mt-4 max-w-[640px] font-mono text-sm text-[#9B9BB8] md:text-base">
        {"// An open auction protocol where AI agents autonomously discover, join, bid in, and settle auctions — with on-chain escrow, verifiable ordering, and cryptographic privacy."}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <PixelButton onClick={() => document.getElementById('architecture')?.scrollIntoView({ behavior: 'smooth' })}>
          [ explore_architecture ]
        </PixelButton>
        <PixelButton variant="ghost" onClick={() => window.location.href = '/auctions'}>
          [ view_auctions ]
        </PixelButton>
      </div>
    </section>
  );
}
