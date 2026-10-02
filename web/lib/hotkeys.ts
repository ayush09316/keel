"use client";

import { useEffect, useRef } from "react";

let lastG = 0;

export function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return (
    t.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) ||
    !!t.closest("[cmdk-root],[role=dialog],[role=alertdialog],[role=menu]")
  );
}

export function useHotkeys(
  map: Record<string, (e: KeyboardEvent) => void>,
  opts: { enabled?: boolean; global?: boolean } = {},
) {
  const ref = useRef(map);
  useEffect(() => {
    ref.current = map;
  });
  const { enabled = true, global = false } = opts;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return;
      const key = e.key === " " ? "space" : e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const inSeq = Date.now() - lastG < 900;
      if (global) {
        if (key === "g") {
          lastG = Date.now();
          return;
        }
        if (inSeq) {
          const fn = ref.current[`g ${key}`];
          lastG = 0;
          if (fn) {
            e.preventDefault();
            fn(e);
          }
          return;
        }
      } else if (inSeq) return;
      const fn = ref.current[key];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, global]);
}
