"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
] as const;

export function ThemeToggle({ compact, className }: { compact?: boolean; className?: string }) {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = !mounted || resolvedTheme === "dark";

  if (compact) {
    return (
      <button
        onClick={() => setTheme(dark ? "light" : "dark")}
        aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
        className={cn(
          "ap-press inline-flex size-10 items-center justify-center rounded-lg text-fg-muted hover:bg-muted hover:text-fg",
          className,
        )}
      >
        {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
    );
  }

  return (
    <div role="radiogroup" aria-label="Theme" className={cn("flex h-8 items-center rounded-lg border border-border bg-surface-2 p-0.5", className)}>
      {OPTIONS.map(({ value, icon: Icon, label }) => {
        const active = mounted && resolvedTheme === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "flex h-full flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs text-fg-subtle transition-colors",
              active ? "bg-surface text-fg shadow-card" : "hover:text-fg",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
