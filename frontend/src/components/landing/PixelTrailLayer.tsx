"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const PixelTrail = dynamic(() => import("@/components/effects/PixelTrail"), {
  ssr: false,
});

type TrailPreset = {
  gridSize: number;
  trailSize: number;
  maxAge: number;
  interpolate: number;
  opacityClass: string;
};

function getTrailPreset(width: number): TrailPreset | null {
  if (width < 1024) {
    return null;
  }

  if (width >= 1536) {
    return {
      gridSize: 68,
      trailSize: 0.055,
      maxAge: 170,
      interpolate: 2,
      opacityClass: "opacity-45",
    };
  }

  if (width >= 1280) {
    return {
      gridSize: 62,
      trailSize: 0.065,
      maxAge: 190,
      interpolate: 2,
      opacityClass: "opacity-50",
    };
  }

  return {
    gridSize: 56,
      trailSize: 0.075,
      maxAge: 210,
    interpolate: 3,
      opacityClass: "opacity-55",
  };
}

export function PixelTrailLayer() {
  const [preset, setPreset] = useState<TrailPreset | null>(null);

  useEffect(() => {
    const update = () => setPreset(getTrailPreset(window.innerWidth));

    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  if (!preset) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[20]">
      <PixelTrail
        gridSize={preset.gridSize}
        trailSize={preset.trailSize}
        maxAge={preset.maxAge}
        interpolate={preset.interpolate}
        color="#5227FF"
        gooeyEnabled
        gooStrength={2}
        className={`absolute inset-0 pointer-events-none mix-blend-screen ${preset.opacityClass}`}
      />
    </div>
  );
}
