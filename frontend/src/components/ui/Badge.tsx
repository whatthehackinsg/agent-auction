import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "live" | "warn" | "active" | "default";
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", children, ...props }, ref) => {
    const variants = {
      live: "text-danger text-glow-danger",
      warn: "text-accent text-glow-accent",
      active: "text-primary text-glow-primary",
      default: "text-text-muted",
    };

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center font-mono text-xs font-bold uppercase tracking-widest",
          variants[variant],
          className
        )}
        {...props}
      >
        <span className="text-stroke-light mr-1">[</span>
        {children}
        <span className="text-stroke-light ml-1">]</span>
      </span>
    );
  }
);

Badge.displayName = "Badge";
