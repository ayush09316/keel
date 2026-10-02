"use client";

import { WifiOff } from "lucide-react";

import { api } from "@/lib/api";
import type { Stats } from "@/lib/types";
import { usePoll } from "@/lib/usePoll";
import { cn } from "@/lib/utils";
import { AnimatedCounter } from "../ui/animated-counter";
import { Skeleton } from "../ui/skeleton";

const TILES: { key: string; label: string; tone: string; value: (s: Stats) => number }[] = [
  { key: "runs", label: "runs", tone: "text-fg", value: (s) => s.runs_total },
  { key: "running", label: "running", tone: "text-info", value: (s) => s.runs.running },
  { key: "completed", label: "completed", tone: "text-good", value: (s) => s.runs.completed },
  { key: "failed", label: "failed", tone: "text-bad", value: (s) => s.runs.failed },
  { key: "dlq", label: "dlq open", tone: "text-dead", value: (s) => s.dead_letters_open },
  { key: "outbox", label: "outbox due", tone: "text-warn", value: (s) => s.outbox_pending },
  { key: "published", label: "published", tone: "text-fg", value: (s) => s.outbox_published },
  { key: "workers", label: "workers", tone: "text-fg", value: (s) => s.workers_alive },
];

export function ApiDown({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border border-bad/25 bg-bad/5 px-4 py-3 text-sm", className)}>
      <WifiOff className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />
      <div className="min-w-0">
        <p className="font-medium text-fg">API unreachable</p>
        <p className="mt-0.5 text-[13px] text-fg-muted">
          Start it with <code className="font-mono text-[12px] text-fg">make api</code> — the dashboard keeps polling and fills in
          when it answers.
        </p>
      </div>
    </div>
  );
}

export function StatStrip({ className }: { className?: string }) {
  const { data, error } = usePoll(() => api.stats(), 2000);

  if (error && !data) return <ApiDown className={className} />;

  return (
    <dl className={cn("grid grid-cols-4 overflow-hidden rounded-xl border border-border bg-surface shadow-card lg:grid-cols-8", className)}>
      {TILES.map((tile, i) => {
        const value = data ? tile.value(data) : null;
        return (
          <div
            key={tile.key}
            className={cn(
              "border-border px-3 py-3 sm:px-4",
              i % 4 !== 3 && "border-r",
              i < 4 && "border-b lg:border-b-0",
              i === 3 && "lg:border-r",
            )}
          >
            <dt className="truncate font-mono text-[10px] tracking-[0.08em] text-fg-subtle uppercase sm:text-[10.5px]">{tile.label}</dt>
            <dd className="mt-1 font-mono text-lg font-semibold sm:text-xl">
              {value === null ? (
                <Skeleton className="mt-1 h-5 w-10" />
              ) : (
                <AnimatedCounter value={value} className={value > 0 ? tile.tone : "text-fg-subtle"} />
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
