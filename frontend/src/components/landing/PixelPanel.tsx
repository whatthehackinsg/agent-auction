import * as React from "react";
import { cn } from "@/lib/utils";
import { AccentTone, accentStyles } from "./accent";

export interface PixelPanelProps extends React.HTMLAttributes<HTMLElement> {
  accent: AccentTone;
  headerLabel?: string;
  headerMeta?: string;
  noBodyPadding?: boolean;
}

export function PixelPanel({
  accent,
  headerLabel,
  headerMeta = "[o][o][x]",
  noBodyPadding = false,
  className,
  children,
  ...props
}: PixelPanelProps) {
  const tone = accentStyles[accent];

  return (
    <article
      className={cn(
        "relative flex flex-col border-r border-t border-l-[4px] border-b-[3px] shadow-[0_0_0_1px_rgba(3,5,12,0.4)]",
        tone.panel,
        tone.border,
        className
      )}
      {...props}
    >
      {headerLabel ? (
        <div
          className={cn(
            "flex items-center justify-between border-b px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em]",
            tone.headerRule
          )}
        >
          <span className={tone.label}>{headerLabel}</span>
          <span className={tone.dim}>{headerMeta}</span>
        </div>
      ) : null}
      <div className={cn("flex flex-1 flex-col", noBodyPadding ? "p-0" : "p-4")}>{children}</div>
    </article>
  );
}
