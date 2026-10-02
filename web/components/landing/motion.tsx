"use client";

import { useEffect, useRef, useState } from "react";

import { fmt, prefersReducedMotion } from "@/lib/utils";

export function LandingFX() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".k-landing");
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    root.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    root.classList.add("k-ready");
    const nav = root.querySelector<HTMLElement>("[data-k-nav]");
    const onScroll = () => nav?.setAttribute("data-scrolled", String(window.scrollY > 8));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  return null;
}

export function useInView<T extends Element>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

export function CountUp({ value, delay = 0, duration = 1300, className }: { value: number; delay?: number; duration?: number; className?: string }) {
  const [ref, inView] = useInView<HTMLSpanElement>(0.4);
  const [shown, setShown] = useState(value);
  const done = useRef(false);
  useEffect(() => {
    if (!inView || done.current || prefersReducedMotion()) return;
    done.current = true;
    let raf = 0;
    setShown(0);
    const timer = setTimeout(() => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [inView, value, delay, duration]);
  return (
    <span ref={ref} className={className}>
      {fmt(shown)}
    </span>
  );
}
