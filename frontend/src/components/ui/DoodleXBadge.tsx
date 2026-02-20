import Link from "next/link";
import { cn } from "@/lib/utils";
import styles from "./DoodleXBadge.module.css";

export interface DoodleXBadgeProps {
  username: string;
  href?: string;
  className?: string;
}

export function DoodleXBadge({
  username,
  href = `https://x.com/${username.replace(/^@/, "")}`,
  className,
}: DoodleXBadgeProps) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        styles.badge,
        "group relative inline-flex items-center gap-2 border border-[#355387] border-b-[2px] bg-[#0f1529]/95 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#cfd4ef] transition-colors hover:border-[#6EE7B7] hover:text-[#ecfff6]",
        className
      )}
      aria-label={`Follow ${username} on X`}
    >
      <span
        aria-hidden
        className={cn(styles.iconBox, "relative inline-flex h-4 w-4 items-center justify-center")}
      >
        <span
          className={cn(
            styles.iconCore,
            "absolute inset-0 border border-[#5276a9] bg-[#111a33] transition-colors group-hover:border-[#6EE7B7]"
          )}
        />
        <span className="relative text-[9px] leading-none text-[#9ed8ff] transition-colors group-hover:text-[#6EE7B7]">
          X
        </span>
        <span
          className={cn(
            styles.spark,
            "absolute -right-1 -top-1 h-1 w-1 bg-[#F5C46E] transition-colors group-hover:bg-[#6EE7B7]"
          )}
        />
      </span>

      <span className={cn(styles.followText, "text-[#7e8cb5] transition-colors group-hover:text-[#a8f0d1]")}>
        follow
      </span>
      <span className={cn(styles.username, "text-[#EEEEF5]")}>{username}</span>
    </Link>
  );
}
