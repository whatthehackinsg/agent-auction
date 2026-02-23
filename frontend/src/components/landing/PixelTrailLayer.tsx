"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const PixelTrail = dynamic(() => import("@/components/effects/PixelTrail"), {
  ssr: false,
});

export function PixelTrailLayer() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  if (!isDesktop) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[20]">
      <PixelTrail
        gridSize={50}
        trailSize={0.1}
        maxAge={250}
        interpolate={5}
        color="#5227FF"
        gooeyEnabled
        gooStrength={2}
        className="absolute inset-0 pointer-events-none opacity-35 mix-blend-screen"
      />
    </div>
  );
}
