"use client";

import Link from "next/link";
import { CSSProperties, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import styles from "./PixelMenu.module.css";

export type PixelMenuItem = {
  label: string;
  href: string;
  external?: boolean;
};

export interface PixelMenuProps {
  items: PixelMenuItem[];
  className?: string;
  navClassName?: string;
  linkClassName?: string;
  divider?: string;
  accentColor?: string;
  layout?: "responsive" | "inline";
  mobileLabel?: string;
}

export function PixelMenu({
  items,
  className,
  navClassName,
  linkClassName,
  divider = "//",
  accentColor = "#6EE7B7",
  layout = "responsive",
  mobileLabel = "[ menu ]",
}: PixelMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (layout !== "responsive" || !open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || !rootRef.current) return;
      if (!rootRef.current.contains(target)) setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [layout, open]);

  const cssVars = useMemo(
    () =>
      ({
        ["--pixel-menu-accent" as string]: accentColor,
      }) as CSSProperties,
    [accentColor]
  );

  const closeMenu = () => setOpen(false);

  const desktopMenu = (
    <nav
      className={cn(layout === "responsive" ? styles.desktopNav : styles.inlineNav, navClassName)}
      aria-label="Main navigation"
    >
      {items.map((item, index) => (
        <span key={`${item.label}-${item.href}`} className={styles.group}>
          <Link
            href={item.href}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noreferrer noopener" : undefined}
            className={cn(styles.link, linkClassName)}
            onClick={closeMenu}
          >
            <span aria-hidden className={styles.dot} />
            <span className={styles.label}>{item.label}</span>
            <span aria-hidden className={styles.scan} />
          </Link>
          {index < items.length - 1 ? <span className={styles.divider}>{divider}</span> : null}
        </span>
      ))}
    </nav>
  );

  if (layout === "inline") {
    return (
      <div ref={rootRef} className={cn(styles.root, className)} style={cssVars}>
        {desktopMenu}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={cn(styles.root, className)} style={cssVars}>
      {desktopMenu}

      <div className={styles.mobileWrap}>
        <button
          type="button"
          className={styles.mobileToggle}
          data-open={open ? "true" : "false"}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className={styles.mobileLabel}>{mobileLabel}</span>
          <span className={styles.hamburger} data-open={open ? "true" : "false"} aria-hidden>
            <span className={styles.hamburgerLine} />
            <span className={styles.hamburgerLine} />
            <span className={styles.hamburgerLine} />
          </span>
        </button>

        <div id={panelId} className={cn(styles.mobilePanel, open && styles.mobilePanelOpen)}>
          {items.map((item, index) => (
            <Link
              key={`mobile-${item.label}-${item.href}`}
              href={item.href}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noreferrer noopener" : undefined}
              onClick={closeMenu}
              className={styles.mobileLink}
              style={
                {
                  ["--menu-item-index" as string]: index,
                } as CSSProperties
              }
            >
              <span>{item.label}</span>
              <span className={styles.mobileChevron} aria-hidden>
                {">"}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
