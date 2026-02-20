"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText as GSAPSplitText } from "gsap/SplitText";
import styles from "./Shuffle.module.css";

gsap.registerPlugin(ScrollTrigger, GSAPSplitText, useGSAP);

export type ShuffleProps = {
  text: string;
  className?: string;
  style?: CSSProperties;
  shuffleDirection?: "left" | "right" | "up" | "down";
  duration?: number;
  maxDelay?: number;
  ease?: string | ((t: number) => number);
  threshold?: number;
  rootMargin?: string;
  tag?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span";
  textAlign?: CSSProperties["textAlign"];
  onShuffleComplete?: () => void;
  shuffleTimes?: number;
  animationMode?: "random" | "evenodd";
  loop?: boolean;
  loopDelay?: number;
  stagger?: number;
  scrambleCharset?: string;
  colorFrom?: string;
  colorTo?: string;
  triggerOnce?: boolean;
  respectReducedMotion?: boolean;
  triggerOnHover?: boolean;
};

type SplitInstance = InstanceType<typeof GSAPSplitText>;

export default function Shuffle({
  text,
  className = "",
  style = {},
  shuffleDirection = "right",
  duration = 0.35,
  maxDelay = 0,
  ease = "power3.out",
  threshold = 0.1,
  rootMargin = "-100px",
  tag = "p",
  textAlign = "center",
  onShuffleComplete,
  shuffleTimes = 1,
  animationMode = "evenodd",
  loop = false,
  loopDelay = 0,
  stagger = 0.03,
  scrambleCharset = "",
  colorFrom,
  colorTo,
  triggerOnce = true,
  respectReducedMotion = true,
  triggerOnHover = true,
}: ShuffleProps) {
  const ref = useRef<HTMLElement>(null);
  const [fontsLoaded, setFontsLoaded] = useState(() => {
    if (typeof document === "undefined") return false;
    if (!("fonts" in document)) return true;
    return document.fonts.status === "loaded";
  });
  const [ready, setReady] = useState(false);

  const splitRef = useRef<SplitInstance | null>(null);
  const wrappersRef = useRef<HTMLElement[]>([]);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const playingRef = useRef(false);
  const hoverHandlerRef = useRef<((e: Event) => void) | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if ("fonts" in document) {
      if (document.fonts.status !== "loaded") {
        document.fonts.ready.then(() => setFontsLoaded(true));
      }
      return;
    }
  }, []);

  const scrollTriggerStart = useMemo(() => {
    const startPct = (1 - threshold) * 100;
    const match = /^(-?\d+(?:\.\d+)?)(px|em|rem|%)?$/.exec(rootMargin || "");
    const marginValue = match ? parseFloat(match[1]) : 0;
    const marginUnit = match ? match[2] || "px" : "px";
    const sign =
      marginValue === 0
        ? ""
        : marginValue < 0
          ? `-=${Math.abs(marginValue)}${marginUnit}`
          : `+=${marginValue}${marginUnit}`;
    return `top ${startPct}%${sign}`;
  }, [threshold, rootMargin]);

  useGSAP(
    () => {
      if (!ref.current || !text || !fontsLoaded) return;

      if (
        respectReducedMotion &&
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        setReady(true);
        onShuffleComplete?.();
        return;
      }

      const el = ref.current;
      const start = scrollTriggerStart;

      const removeHover = () => {
        if (hoverHandlerRef.current && ref.current) {
          ref.current.removeEventListener("mouseenter", hoverHandlerRef.current);
          hoverHandlerRef.current = null;
        }
      };

      const teardown = () => {
        if (tlRef.current) {
          tlRef.current.kill();
          tlRef.current = null;
        }
        if (wrappersRef.current.length) {
          wrappersRef.current.forEach((wrapper) => {
            const inner = wrapper.firstElementChild as HTMLElement | null;
            const orig = inner?.querySelector('[data-orig="1"]') as HTMLElement | null;
            if (orig && wrapper.parentNode) wrapper.parentNode.replaceChild(orig, wrapper);
          });
          wrappersRef.current = [];
        }
        try {
          splitRef.current?.revert();
        } catch {
          // ignore split revert issues on rapid unmount/remount
        }
        splitRef.current = null;
        playingRef.current = false;
      };

      const build = () => {
        teardown();

        splitRef.current = new GSAPSplitText(el, {
          type: "chars",
          charsClass: "shuffle-char",
          wordsClass: "shuffle-word",
          linesClass: "shuffle-line",
          smartWrap: true,
          reduceWhiteSpace: false,
        });

        const chars = (splitRef.current.chars || []) as HTMLElement[];
        wrappersRef.current = [];

        const rolls = Math.max(1, Math.floor(shuffleTimes));
        const randomChar = (set: string) => set.charAt(Math.floor(Math.random() * set.length)) || "";

        chars.forEach((ch) => {
          const parent = ch.parentElement;
          if (!parent) return;

          const width = ch.getBoundingClientRect().width;
          const height = ch.getBoundingClientRect().height;
          if (!width) return;

          const wrapper = document.createElement("span");
          Object.assign(wrapper.style, {
            display: "inline-block",
            overflow: "hidden",
            width: `${width}px`,
            height:
              shuffleDirection === "up" || shuffleDirection === "down" ? `${height}px` : "auto",
            verticalAlign: "bottom",
          });

          const inner = document.createElement("span");
          Object.assign(inner.style, {
            display: "inline-block",
            whiteSpace: shuffleDirection === "up" || shuffleDirection === "down" ? "normal" : "nowrap",
            willChange: "transform",
          });

          parent.insertBefore(wrapper, ch);
          wrapper.appendChild(inner);

          const firstOrig = ch.cloneNode(true) as HTMLElement;
          Object.assign(firstOrig.style, {
            display:
              shuffleDirection === "up" || shuffleDirection === "down" ? "block" : "inline-block",
            width: `${width}px`,
            textAlign: "center",
          });

          ch.setAttribute("data-orig", "1");
          Object.assign(ch.style, {
            display:
              shuffleDirection === "up" || shuffleDirection === "down" ? "block" : "inline-block",
            width: `${width}px`,
            textAlign: "center",
          });

          inner.appendChild(firstOrig);

          for (let k = 0; k < rolls; k += 1) {
            const c = ch.cloneNode(true) as HTMLElement;
            if (scrambleCharset) c.textContent = randomChar(scrambleCharset);
            Object.assign(c.style, {
              display:
                shuffleDirection === "up" || shuffleDirection === "down" ? "block" : "inline-block",
              width: `${width}px`,
              textAlign: "center",
            });
            inner.appendChild(c);
          }

          inner.appendChild(ch);

          const steps = rolls + 1;

          if (shuffleDirection === "right" || shuffleDirection === "down") {
            const firstCopy = inner.firstElementChild as HTMLElement | null;
            const real = inner.lastElementChild as HTMLElement | null;
            if (real) inner.insertBefore(real, inner.firstChild);
            if (firstCopy) inner.appendChild(firstCopy);
          }

          let startX = 0;
          let finalX = 0;
          let startY = 0;
          let finalY = 0;

          if (shuffleDirection === "right") {
            startX = -steps * width;
            finalX = 0;
          } else if (shuffleDirection === "left") {
            startX = 0;
            finalX = -steps * width;
          } else if (shuffleDirection === "down") {
            startY = -steps * height;
            finalY = 0;
          } else if (shuffleDirection === "up") {
            startY = 0;
            finalY = -steps * height;
          }

          if (shuffleDirection === "left" || shuffleDirection === "right") {
            gsap.set(inner, { x: startX, y: 0, force3D: true });
            inner.setAttribute("data-start-x", String(startX));
            inner.setAttribute("data-final-x", String(finalX));
          } else {
            gsap.set(inner, { x: 0, y: startY, force3D: true });
            inner.setAttribute("data-start-y", String(startY));
            inner.setAttribute("data-final-y", String(finalY));
          }

          if (colorFrom) inner.style.color = colorFrom;
          wrappersRef.current.push(wrapper);
        });
      };

      const inners = () => wrappersRef.current.map((w) => w.firstElementChild as HTMLElement);

      const randomizeScrambles = () => {
        if (!scrambleCharset) return;
        wrappersRef.current.forEach((w) => {
          const strip = w.firstElementChild as HTMLElement;
          if (!strip) return;
          const kids = Array.from(strip.children) as HTMLElement[];
          for (let i = 1; i < kids.length - 1; i += 1) {
            kids[i].textContent = scrambleCharset.charAt(
              Math.floor(Math.random() * scrambleCharset.length)
            );
          }
        });
      };

      const cleanupToStill = () => {
        wrappersRef.current.forEach((w) => {
          const strip = w.firstElementChild as HTMLElement;
          if (!strip) return;
          const real = strip.querySelector('[data-orig="1"]') as HTMLElement | null;
          if (!real) return;
          strip.replaceChildren(real);
          strip.style.transform = "none";
          strip.style.willChange = "auto";
        });
      };

      const play = () => {
        const strips = inners();
        if (!strips.length) return;

        playingRef.current = true;
        const isVertical = shuffleDirection === "up" || shuffleDirection === "down";

        const timeline = gsap.timeline({
          smoothChildTiming: true,
          repeat: loop ? -1 : 0,
          repeatDelay: loop ? loopDelay : 0,
          onRepeat: () => {
            if (scrambleCharset) randomizeScrambles();
            if (isVertical) {
              gsap.set(strips, {
                y: (_i, target: HTMLElement) => parseFloat(target.getAttribute("data-start-y") || "0"),
              });
            } else {
              gsap.set(strips, {
                x: (_i, target: HTMLElement) => parseFloat(target.getAttribute("data-start-x") || "0"),
              });
            }
            onShuffleComplete?.();
          },
          onComplete: () => {
            playingRef.current = false;
            if (!loop) {
              cleanupToStill();
              if (colorTo) gsap.set(strips, { color: colorTo });
              onShuffleComplete?.();
              armHover();
            }
          },
        });

        const addTween = (targets: HTMLElement[], at: number) => {
          const vars: gsap.TweenVars = {
            duration,
            ease,
            force3D: true,
            stagger: animationMode === "evenodd" ? stagger : 0,
          };

          if (isVertical) {
            vars.y = (_i, target: HTMLElement) => parseFloat(target.getAttribute("data-final-y") || "0");
          } else {
            vars.x = (_i, target: HTMLElement) => parseFloat(target.getAttribute("data-final-x") || "0");
          }

          timeline.to(targets, vars, at);

          if (colorFrom && colorTo) {
            timeline.to(targets, { color: colorTo, duration, ease }, at);
          }
        };

        if (animationMode === "evenodd") {
          const odd = strips.filter((_, i) => i % 2 === 1);
          const even = strips.filter((_, i) => i % 2 === 0);
          const oddTotal = duration + Math.max(0, odd.length - 1) * stagger;
          const evenStart = odd.length ? oddTotal * 0.7 : 0;
          if (odd.length) addTween(odd, 0);
          if (even.length) addTween(even, evenStart);
        } else {
          strips.forEach((strip) => {
            const delay = Math.random() * maxDelay;
            const vars: gsap.TweenVars = {
              duration,
              ease,
              force3D: true,
            };
            if (isVertical) {
              vars.y = parseFloat(strip.getAttribute("data-final-y") || "0");
            } else {
              vars.x = parseFloat(strip.getAttribute("data-final-x") || "0");
            }
            timeline.to(strip, vars, delay);
            if (colorFrom && colorTo) {
              timeline.fromTo(strip, { color: colorFrom }, { color: colorTo, duration, ease }, delay);
            }
          });
        }

        tlRef.current = timeline;
      };

      const armHover = () => {
        if (!triggerOnHover || !ref.current) return;
        removeHover();
        const handler = () => {
          if (playingRef.current) return;
          build();
          if (scrambleCharset) randomizeScrambles();
          play();
        };
        hoverHandlerRef.current = handler;
        ref.current.addEventListener("mouseenter", handler);
      };

      const create = () => {
        build();
        if (scrambleCharset) randomizeScrambles();
        play();
        armHover();
        setReady(true);
      };

      const trigger = ScrollTrigger.create({
        trigger: el,
        start,
        once: triggerOnce,
        onEnter: create,
      });

      return () => {
        trigger.kill();
        removeHover();
        teardown();
        setReady(false);
      };
    },
    {
      dependencies: [
        text,
        duration,
        maxDelay,
        ease,
        scrollTriggerStart,
        fontsLoaded,
        shuffleDirection,
        shuffleTimes,
        animationMode,
        loop,
        loopDelay,
        stagger,
        scrambleCharset,
        colorFrom,
        colorTo,
        triggerOnce,
        respectReducedMotion,
        triggerOnHover,
        onShuffleComplete,
      ],
      scope: ref,
    }
  );

  const commonStyle: CSSProperties = useMemo(() => ({ textAlign, ...style }), [textAlign, style]);
  const classes = useMemo(
    () => `${styles.shuffleParent} ${ready ? styles.isReady : ""} ${className}`.trim(),
    [ready, className]
  );
  const Tag = tag;

  return (
    <Tag ref={ref as never} className={classes} style={commonStyle}>
      {text}
    </Tag>
  );
}
