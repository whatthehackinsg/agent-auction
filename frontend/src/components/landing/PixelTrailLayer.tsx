"use client";

import dynamic from "next/dynamic";

const PixelTrail = dynamic(() => import("@/components/effects/PixelTrail"), {
  ssr: false,
});

export function PixelTrailLayer() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[20] hidden lg:block">
      <PixelTrail
        gridSize={40}
        trailSize={0.1}
        maxAge={200}
        interpolate={3}
        color="#5227FF"
        gooeyEnabled
        gooStrength={2}
        className="absolute inset-0 pointer-events-none opacity-35 mix-blend-screen"
      />
    </div>
  );
}
