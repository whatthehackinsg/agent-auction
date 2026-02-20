import * as React from "react";
import { cn } from "@/lib/utils";

export interface PixelButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const PixelButton = React.forwardRef<HTMLButtonElement, PixelButtonProps>(
  ({ className, variant = "primary", size = "md", children, ...props }, ref) => {
    const baseStyles =
      "relative inline-flex items-center justify-center border border-b-[2px] font-mono font-bold uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070f]";

    const sizes = {
      sm: "px-3 py-1.5 text-[10px]",
      md: "px-4 py-2 text-[11px]",
      lg: "px-5 py-2.5 text-xs",
    };

    const variants = {
      primary:
        "bg-[#6EE7B7] text-[#0C0C1D] border-[#F5C46E] hover:bg-[#82f4c6] focus-visible:ring-[#6EE7B7]",
      ghost:
        "bg-[#1E1E32] text-[#EEEEF5] border-[#C4B5FD] hover:bg-[#2A2A45] focus-visible:ring-[#C4B5FD]",
      danger:
        "bg-[#F87171] text-[#150808] border-[#FCA5A5] hover:bg-[#ff8d8d] focus-visible:ring-[#F87171]",
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, sizes[size], variants[variant], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);

PixelButton.displayName = "PixelButton";
