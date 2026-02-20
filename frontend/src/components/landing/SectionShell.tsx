import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionShellProps extends React.HTMLAttributes<HTMLElement> {
  tag?: string;
  showBraces?: boolean;
}

export function SectionShell({
  tag,
  showBraces = true,
  className,
  children,
  ...props
}: SectionShellProps) {
  return (
    <section className={cn("relative z-10 px-6 md:px-[52px]", className)} {...props}>
      {tag ? (
        <p className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#5d7ab0]">
          {tag}
        </p>
      ) : null}

      {showBraces ? (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute left-2 top-[48px] font-mono text-lg font-bold text-[#355387] md:left-12"
          >
            {"{"}
          </span>
          <span
            aria-hidden
            className="pointer-events-none absolute right-2 top-[48px] font-mono text-lg font-bold text-[#355387] md:right-12"
          >
            {"}"}
          </span>
        </>
      ) : null}

      {children}
    </section>
  );
}
