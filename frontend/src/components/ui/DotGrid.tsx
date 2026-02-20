import * as React from "react";
import { cn } from "@/lib/utils";

export interface DotGridProps extends React.HTMLAttributes<HTMLDivElement> {
  dotColor?: string;
  dotSize?: number;
  spacing?: number;
}

export const DotGrid = React.forwardRef<HTMLDivElement, DotGridProps>(
  (
    {
      className,
      dotColor = "var(--color-stroke)",
      dotSize = 1,
      spacing = 24,
      children,
      style,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn("relative w-full h-full", className)}
        style={{
          backgroundImage: `radial-gradient(circle, ${dotColor} ${dotSize}px, transparent ${dotSize}px)`,
          backgroundSize: `${spacing}px ${spacing}px`,
          backgroundPosition: "center top",
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);

DotGrid.displayName = "DotGrid";
