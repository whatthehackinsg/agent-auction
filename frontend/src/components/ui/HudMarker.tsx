import * as React from "react";
import { cn } from "@/lib/utils";

export interface HudMarkerProps extends React.HTMLAttributes<HTMLDivElement> {
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

export const HudMarker = React.forwardRef<HTMLDivElement, HudMarkerProps>(
  ({ className, position, ...props }, ref) => {
    const positions = {
      "top-left": "top-0 left-0 -translate-x-1/2 -translate-y-1/2",
      "top-right": "top-0 right-0 translate-x-1/2 -translate-y-1/2",
      "bottom-left": "bottom-0 left-0 -translate-x-1/2 translate-y-1/2",
      "bottom-right": "bottom-0 right-0 translate-x-1/2 translate-y-1/2",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "absolute text-stroke-light font-mono text-xs select-none pointer-events-none",
          positions[position],
          className
        )}
        aria-hidden="true"
        {...props}
      >
        +
      </div>
    );
  }
);

HudMarker.displayName = "HudMarker";
