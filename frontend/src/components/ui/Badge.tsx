import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "live" | "warn" | "active" | "default";
  pulse?: boolean;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", pulse, children, ...props }, ref) => {
    const variants = {
      live: "bg-[#6EE7B7]/15 text-[#6EE7B7] border-[#6EE7B7]/30",
      warn: "bg-[#F5C46E]/15 text-[#F5C46E] border-[#F5C46E]/30",
      active: "bg-[#FDA4AF]/15 text-[#FDA4AF] border-[#FDA4AF]/30",
      default: "bg-[#3a3a58]/40 text-text-muted border-[#3a3a58]/60",
    };

    const dotColors = {
      live: "bg-[#6EE7B7]",
      warn: "bg-[#F5C46E]",
      active: "bg-[#FDA4AF]",
      default: "bg-text-muted",
    };

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em]",
          variants[variant],
          className
        )}
        {...props}
      >
        <span className="relative flex h-1.5 w-1.5">
          {pulse && (
            <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", dotColors[variant])} />
          )}
          <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", dotColors[variant])} />
        </span>
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";
