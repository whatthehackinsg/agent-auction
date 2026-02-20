import * as React from "react";
import { cn } from "@/lib/utils";
import { HudMarker } from "./HudMarker";

export interface PixelCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  showMarkers?: boolean;
}

export const PixelCard = React.forwardRef<HTMLDivElement, PixelCardProps>(
  ({ className, title = "untitled.sh", showMarkers = true, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative flex flex-col bg-surface border border-stroke shadow-[3px_3px_0_0_rgba(58,58,88,0.5)]",
          className
        )}
        {...props}
      >
        {showMarkers && (
          <>
            <HudMarker position="top-left" />
            <HudMarker position="top-right" />
            <HudMarker position="bottom-left" />
            <HudMarker position="bottom-right" />
          </>
        )}

        <div className="flex items-center justify-between px-3 py-2 border-b border-stroke bg-base">
          <div className="flex items-center space-x-2">
            <span className="text-secondary font-mono text-xs font-bold">
              {"// "}{title}
            </span>
          </div>
          <div className="flex items-center space-x-1 font-mono text-xs text-stroke-light select-none">
            <span className="hover:text-secondary cursor-pointer transition-colors">[_]</span>
            <span className="hover:text-secondary cursor-pointer transition-colors">[+]</span>
            <span className="hover:text-danger cursor-pointer transition-colors">[X]</span>
          </div>
        </div>

        <div className="p-4 flex-1 relative">
          {children}
        </div>
      </div>
    );
  }
);

PixelCard.displayName = "PixelCard";
