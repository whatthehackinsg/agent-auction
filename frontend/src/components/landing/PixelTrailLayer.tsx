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
    return {
      gridSize: 64,
      trailSize: 0.12,
      maxAge: 230,
      interpolate: 6,
      opacityClass: "opacity-55",
    };
  }

  if (width >= 1536) {
    return {
      gridSize: 82,
      trailSize: 0.085,
      maxAge: 170,
      interpolate: 4,
      opacityClass: "opacity-45",
    };
  }

  if (width >= 1280) {
    return {
      gridSize: 76,
      trailSize: 0.095,
      maxAge: 190,
      interpolate: 4,
      opacityClass: "opacity-50",
    };
  }

  return {
    gridSize: 70,
    trailSize: 0.105,
    maxAge: 210,
    interpolate: 5,
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
