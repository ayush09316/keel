"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Lanes } from "../chaos/lanes";
import { Invariant } from "../chaos/panels";
import { deriveCounters, useReplay } from "../chaos/replay";
import { Skeleton } from "../ui/skeleton";
import { loadRecording } from "@/lib/api";
import type { ChaosRecording } from "@/lib/chaos";
import { cn, prefersReducedMotion } from "@/lib/utils";

export function HeroReplay() {
  const [recording, setRecording] = useState<ChaosRecording | null>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    setStill(prefersReducedMotion());
    loadRecording().then(setRecording).catch(() => {});
  }, []);

  const end = recording ? Math.min(recording.duration, 34) : 0;
  const replay = useReplay(recording, { initialT: still ? 21 : 3, autoplay: !still, loop: true, speed: 2.5, window: [3, end] });
  const counters = recording ? deriveCounters(recording, replay.t) : null;

  return (
    <div className="k-frame relative overflow-hidden rounded-[20px]">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-bad/60" />
          <span className="size-2.5 rounded-full bg-warn/60" />
          <span className="size-2.5 rounded-full bg-good/60" />
        </span>
        <span className="ml-2 min-w-0 truncate font-mono text-[11px] text-fg-subtle">make chaos · replayed from the recording</span>
        <Link href="/chaos" className="ml-auto inline-flex shrink-0 items-center gap-1 font-mono text-[11px] text-fg-muted hover:text-fg">
          full replay <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      </div>
      {!recording || !counters ? (
        <div className="space-y-2 p-4" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[52px] w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <Lanes recording={recording} t={replay.t} compact />
          <div className="flex flex-col gap-2">
            <Invariant value={Math.round(counters.charged_twice)} t={replay.t} compact />
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
              {[
                ["attempts", counters.attempts, "text-fg"],
                ["reclaims", counters.reclaims, "text-ice"],
                ["gateway calls", counters.gateway_calls, "text-warn"],
                ["charges", counters.charges, "text-good"],
              ].map(([label, v, tone]) => (
                <div key={label as string} className="bg-surface px-2.5 py-2">
                  <dt className="truncate font-mono text-[9.5px] tracking-[0.08em] text-fg-subtle uppercase">{label}</dt>
                  <dd className={cn("font-mono text-[17px] font-semibold tnum", tone as string)}>{Math.round(v as number)}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-auto h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className="block h-full bg-fg/60" style={{ width: `${((replay.t - 3) / Math.max(end - 3, 1)) * 100}%` }} />
            </div>
            <p className="font-mono text-[10px] text-fg-subtle tnum">t = {replay.t.toFixed(1)}s · {recording.kills} kills · {recording.freezes} freezes</p>
          </div>
        </div>
      )}
    </div>
  );
}
