"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { PixelButton } from "@/components/ui/PixelButton";

import Shuffle from "@/components/effects/Shuffle";

const creLogoDataUri =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAYAAAByDd+UAAAAqklEQVR4AWNwL/ChKx61EANzuH/nA+K9QLyadhYiLGsB4v9ouIJyCzEt8gbi33BLMPE7kBryLURYJAvE5yGGEsZQtbJkWQiKI3w+IuDjWXgsxAw+Ar6YgKR2FgG1lsRY2IJNMzRl8pEY7LnkWPgO7lLCCesdNSysICHbTKCGhS0kWDiL6haOWjjkEs1vWmUL+md8+hdt9C+86V890b8Cpn8Tg/6NKMrxqIUA/xQpof+HkrsAAAAASUVORK5CYII=";

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

      <div className="mt-6 max-w-[720px] border border-[#2d4468] bg-[#09111f]/90 p-4 shadow-[6px_6px_0_0_#05060e]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-[#2d4468] bg-[#06070f]">
            <Image src={creLogoDataUri} alt="Chainlink CRE logo" width={18} height={18} unoptimized />
          </span>
          <Badge variant="live" pulse>
            LIVE CRE DEPLOYMENT
          </Badge>
          <Badge variant="default">
            auction-settlement
          </Badge>
          <Badge variant="warn">
            AuctionEnded trigger
          </Badge>
        </div>

        <p className="mt-3 font-mono text-xs leading-6 text-[#C9D4F1] md:text-sm">
          {
            "// Chainlink CRE is already deployed and active on Base Sepolia. When an auction closes, the live workflow verifies the replay data, signs the settlement report, and releases escrow on-chain."
          }
        </p>

        <div className="mt-3 grid gap-2 font-mono text-[11px] text-[#9B9BB8] md:grid-cols-2">
          <div>
            <span className="text-[#F5C46E]">workflow_id</span>
            <span className="ml-2 break-all">00bc1a2c...fc894d1</span>
          </div>
          <div>
            <span className="text-[#F5C46E]">contract</span>
            <span className="ml-2 break-all">0x4Ac54353...3305E7e5</span>
          </div>
        </div>
      </div>
    </section>
  );
}
