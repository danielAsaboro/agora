"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useMotionValue, useSpring } from "motion/react";

export function AnimatedNumber({
  value,
  format,
  duration = 1.6,
  className = "",
  decimals = 0,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
  decimals?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const [display, setDisplay] = useState("0");
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { duration: duration * 1000, bounce: 0 });

  useEffect(() => {
    if (!inView) return;
    mv.set(value);
  }, [inView, value, mv]);

  useEffect(() => {
    const unsub = spring.on("change", (latest) => {
      const f = format ?? ((n: number) => n.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }));
      setDisplay(f(latest));
    });
    return () => unsub();
  }, [spring, format, decimals]);

  return (
    <span ref={ref} className={`tabular ${className}`}>
      {display}
    </span>
  );
}
