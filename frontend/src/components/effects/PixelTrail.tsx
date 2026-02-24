"use client";

import { CSSProperties, useEffect, useMemo } from "react";
import { Canvas, CanvasProps, useThree } from "@react-three/fiber";
import { shaderMaterial, useTrailTexture } from "@react-three/drei";
import * as THREE from "three";

type GooeyFilterConfig = {
  id?: string;
  strength?: number;
};

type PixelTrailProps = {
  gridSize?: number;
  trailSize?: number;
  maxAge?: number;
  interpolate?: number;
  easingFunction?: (x: number) => number;
  canvasProps?: Omit<CanvasProps, "children" | "gl">;
  glProps?: CanvasProps["gl"];
  gooeyEnabled?: boolean;
  gooeyFilter?: GooeyFilterConfig;
  gooStrength?: number;
  color?: string;
  className?: string;
};

type SceneProps = {
  gridSize: number;
  trailSize: number;
  maxAge: number;
  interpolate: number;
  easingFunction: (x: number) => number;
  pixelColor: string;
};

type UvMoveEvent = {
  uv: {
    x: number;
    y: number;
  };
};

const PixelDotMaterial = shaderMaterial(
  {
    resolution: new THREE.Vector2(1, 1),
    mouseTrail: null,
    gridSize: 40,
    pixelColor: new THREE.Color("#ffffff"),
  },
  `
    void main() {
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  `
    uniform vec2 resolution;
    uniform sampler2D mouseTrail;
    uniform float gridSize;
    uniform vec3 pixelColor;

    void main() {
      // Pixel-space grid: cellSize is always square
      float cellSize = resolution.x / gridSize;
      vec2 cell = floor(gl_FragCoord.xy / cellSize);
      vec2 cellCenterPx = (cell + 0.5) * cellSize;

      // Map pixel coords → trail texture UV (square, centered)
      float maxDim = max(resolution.x, resolution.y);
      vec2 trailUv = (cellCenterPx + (maxDim - resolution) * 0.5) / maxDim;

      float trail = texture2D(mouseTrail, trailUv).r;
      gl_FragColor = vec4(pixelColor, trail);
    }
  `
);

function GooeyFilter({ id, strength }: { id: string; strength: number }) {
  return (
    <svg
      aria-hidden
      style={{
        position: "absolute",
        width: 0,
        height: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <title>Pixel trail gooey filter</title>
      <defs>
        <filter id={id}>
          <feGaussianBlur in="SourceGraphic" stdDeviation={strength} result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}

function Scene({
  gridSize,
  trailSize,
  maxAge,
  interpolate,
  easingFunction,
  pixelColor,
}: SceneProps) {
  const { size, viewport, gl } = useThree();

  const material = useMemo(() => new PixelDotMaterial(), []);
  const [trail, onMove] = useTrailTexture({
    size: 512,
    radius: trailSize,
    maxAge,
    interpolate,
    ease: easingFunction,
  }) as [THREE.Texture | null, (event: UvMoveEvent) => void];

  const pixelColorUniform = useMemo(() => new THREE.Color(pixelColor), [pixelColor]);
  const resolutionUniform = useMemo(
    () => new THREE.Vector2(size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio()),
    [gl, size.height, size.width]
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      // Pixel position within the canvas element (CSS pixels)
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;

      // Map to square trail texture UV (centered, matching shader trailUv)
      const maxDim = Math.max(rect.width, rect.height);
      const x = (px + (maxDim - rect.width) * 0.5) / maxDim;
      const y = 1 - (py + (maxDim - rect.height) * 0.5) / maxDim;

      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      onMove({ uv: { x, y } });
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [gl, onMove]);

  const scale = Math.max(viewport.width, viewport.height) / 2;

  return (
    <mesh scale={[scale, scale, 1]}>
      <planeGeometry args={[2, 2]} />
      <primitive
        object={material}
        attach="material"
        gridSize={gridSize}
        resolution={resolutionUniform}
        mouseTrail={trail}
        pixelColor={pixelColorUniform}
      />
    </mesh>
  );
}

export default function PixelTrail({
  gridSize = 40,
  trailSize = 0.05,
  maxAge = 200,
  interpolate = 2,
  easingFunction = (x: number) => x,
  canvasProps,
  glProps = {
    antialias: false,
    alpha: true,
    powerPreference: "high-performance",
  },
  gooeyEnabled,
  gooeyFilter,
  gooStrength = 2,
  color = "#5227FF",
  className = "",
}: PixelTrailProps) {
  const useGooey = gooeyEnabled ?? Boolean(gooeyFilter);
  const filterId = gooeyFilter?.id ?? "pixel-trail-goo-filter";
  const filterStrength = gooeyFilter?.strength ?? gooStrength;
  const canvasStyle = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    ...(canvasProps?.style ?? {}),
    ...(useGooey ? { filter: `url(#${filterId})` } : {}),
  } satisfies CSSProperties;

  return (
    <>
      {useGooey ? <GooeyFilter id={filterId} strength={filterStrength} /> : null}
      <Canvas
        {...canvasProps}
        gl={glProps}
        className={className}
        style={canvasStyle}
      >
        <Scene
          gridSize={gridSize}
          trailSize={trailSize}
          maxAge={maxAge}
          interpolate={interpolate}
          easingFunction={easingFunction}
          pixelColor={color}
        />
      </Canvas>
    </>
  );
}
