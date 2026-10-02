"use client";

import { Ghost, ShieldX, Snowflake, Skull, Undo2 } from "lucide-react";

import type { ChaosRecording } from "@/lib/chaos";
import { cn } from "@/lib/utils";
import { type LaneView, deriveLanes } from "./replay";

function leaseTone(left: number, lease: number) {
  const r = left / lease;
  if (left <= 0) return "bg-bad";
  if (r < 0.34) return "bg-warn";
  return "bg-good";
}

function shortStep(name: string) {
  return name.replace("_", " ");
}

export function Lanes({ recording, t, compact = false }: { recording: ChaosRecording; t: number; compact?: boolean }) {
  const lanes = deriveLanes(recording, t);
  return (
    <ol className={cn("flex flex-col", compact ? "gap-2" : "gap-2.5")}>
      {lanes.map((lane) => (
        <Lane key={lane.slot} lane={lane} recording={recording} t={t} compact={compact} />
      ))}
    </ol>
  );
}

function Lane({ lane, recording, t, compact }: { lane: LaneView; recording: ChaosRecording; t: number; compact: boolean }) {
  const lease = recording.config.lease;
  const killed = lane.killedAt !== null;
  const step = lane.step;
  const left = lane.leaseLeft;

  const badge = killed ? (
    <span
      key={`stamp-${lane.killIndex}`}
      className={cn(
        "k-stamp shrink-0 rounded-md border-2 border-bad bg-surface px-1.5 font-mono font-bold tracking-wider text-bad",
        compact ? "text-[10px]" : "text-[11px]",
      )}
    >
      SIGKILL {lane.killedPid}
    </span>
  ) : lane.frozen ? (
    <span className={cn("flex shrink-0 items-center gap-1 rounded-md bg-ice/15 px-1.5 py-0.5 font-mono font-semibold text-ice ring-1 ring-ice/30", compact ? "text-[10px]" : "text-[11px]")}>
      <Snowflake className="size-3" aria-hidden />
      SIGSTOP
      {!compact && lane.frozenSince !== null && <span className="font-normal opacity-80 tnum">{(t - lane.frozenSince).toFixed(1)}s</span>}
    </span>
  ) : null;

  return (
    <li
      className={cn(
        "relative isolate overflow-hidden rounded-xl border bg-surface transition-colors duration-300",
        lane.frozen ? "border-ice/40" : killed ? "border-bad/45" : "border-border",
        killed && "k-shake",
      )}
      aria-label={`worker ${lane.slot}: ${lane.frozen ? "frozen" : killed ? "just killed" : "running"}`}
    >
      {lane.frozen && <span aria-hidden className="k-frost k-frost-bg absolute inset-0 -z-10" />}
      {killed && <span key={lane.killIndex} aria-hidden className="k-flash absolute inset-0 -z-10 bg-bad/30" />}
      {killed && <span aria-hidden className="absolute inset-0 -z-10 bg-bad/[0.06]" />}

      <div className={cn("grid items-center", compact ? "grid-cols-[64px_minmax(0,1fr)] gap-2.5 px-2.5 py-2" : "grid-cols-[86px_minmax(0,1fr)] gap-3 px-3 py-2.5 sm:grid-cols-[112px_minmax(0,1fr)]")}>
        <div className="min-w-0">
          <p className={cn("flex items-center gap-1.5 font-mono font-semibold", compact ? "text-[12px]" : "text-[13px]")}>
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                lane.status === "stopped" ? "bg-fg-subtle" : lane.frozen ? "bg-ice" : killed ? "bg-bad" : "bg-good",
                !lane.frozen && !killed && lane.status !== "stopped" && "motion-safe:animate-pulse",
              )}
              aria-hidden
            />
            w{lane.slot}
          </p>
          <p className={cn("mt-0.5 truncate font-mono text-fg-subtle tnum", compact ? "text-[10px]" : "text-[10.5px]")}>pid {lane.pid}</p>
        </div>

        <div className="relative min-w-0">
          {step ? (
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn("truncate font-mono text-fg", compact ? "text-[11.5px]" : "text-[12.5px]", lane.frozen && "text-ice")}>
                  {shortStep(step.step)}
                </span>
                {!compact && <span className="truncate font-mono text-[10.5px] text-fg-subtle">{step.order}</span>}
                {step.attempt > 1 && <span className="shrink-0 font-mono text-[10.5px] text-warn">#{step.attempt}</span>}
                <span className="ml-auto" />
                {badge}
              </div>
              {left !== null && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn("absolute inset-y-0 left-0 rounded-full", leaseTone(left, lease), lane.frozen && left > 0 && "bg-ice")}
                      style={{ width: `${Math.max(0, Math.min(1, left / lease)) * 100}%` }}
                    />
                  </div>
                  <span className={cn("w-[74px] shrink-0 text-right font-mono text-[10px] tnum", left <= 0 ? "text-bad" : "text-fg-subtle")}>
                    {left <= 0 ? "lease expired" : `lease ${left.toFixed(1)}s`}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <p className={cn("min-w-0 truncate font-mono text-fg-subtle", compact ? "text-[11px]" : "text-[12px]")}>
                {lane.status === "stopped" ? "stopped" : killed ? "respawned · polling" : lane.frozen ? "stalled between steps" : "polling · SKIP LOCKED"}
              </p>
              <span className="ml-auto" />
              {badge}
            </div>
          )}

          {!compact && (lane.orphans.length > 0 || lane.fenced || lane.reclaimed) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {lane.orphans.map((o) => (
                <span
                  key={`${o.run}-${o.step}`}
                  className="inline-flex items-center gap-1 rounded-md border border-dashed border-bad/40 px-1.5 py-0.5 font-mono text-[10.5px] text-bad"
                >
                  <Ghost className="size-3" aria-hidden />
                  {shortStep(o.step)} orphaned · {o.lease_in !== null && o.lease_in > 0 ? `lease ${o.lease_in.toFixed(1)}s` : "lease expired"}
                </span>
              ))}
              {lane.reclaimed && (
                <span key={`r-${lane.reclaimed.t}`} className="ap-pop inline-flex items-center gap-1 rounded-md bg-ice/12 px-1.5 py-0.5 font-mono text-[10.5px] text-ice ring-1 ring-ice/25">
                  <Undo2 className="size-3" aria-hidden />
                  reaper reclaimed {shortStep(lane.reclaimed.step ?? "")}
                  {lane.reclaimed.buried ? " · buried" : ""}
                </span>
              )}
              {lane.fenced && (
                <span key={`f-${lane.fenced.t}`} className="ap-pop inline-flex items-center gap-1 rounded-md bg-fence/12 px-1.5 py-0.5 font-mono text-[10.5px] text-fence ring-1 ring-fence/25">
                  <ShieldX className="size-3" aria-hidden />
                  commit fenced · attempt {lane.fenced.attempt} is stale
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      {!compact && <LaneHistory recording={recording} slot={lane.slot} t={t} />}
    </li>
  );
}

function LaneHistory({ recording, slot, t }: { recording: ChaosRecording; slot: number; t: number }) {
  const d = Math.max(recording.duration, 1);
  const mine = recording.events.filter((e) => e.slot === slot);
  const frozen: [number, number][] = [];
  let open: number | null = null;
  for (const e of mine) {
    if (e.kind === "sigstop") open = e.t;
    if ((e.kind === "sigcont" || e.kind === "sigkill") && open !== null) {
      frozen.push([open, e.t]);
      open = null;
    }
  }
  if (open !== null) frozen.push([open, d]);
  const at = (x: number) => `${(x / d) * 100}%`;

  return (
    <div className="relative h-2 border-t border-border bg-surface-2/60" aria-hidden>
      <span className="absolute inset-y-0 left-0 bg-fg/[0.06]" style={{ width: at(t) }} />
      {frozen.map(([a, b]) => (
        <span key={a} className={cn("absolute inset-y-0 bg-ice/45", a > t && "opacity-30")} style={{ left: at(a), width: at(b - a) }} />
      ))}
      {mine
        .filter((e) => e.kind === "sigkill" || e.kind === "fenced" || e.kind === "reclaim")
        .map((e, i) => (
          <span
            key={`${e.kind}-${i}`}
            className={cn(
              "absolute inset-y-0 w-[3px] -translate-x-1/2",
              e.kind === "sigkill" ? "bg-bad" : e.kind === "fenced" ? "bg-fence" : "bg-ice",
              e.t > t && "opacity-25",
            )}
            style={{ left: at(e.t) }}
          />
        ))}
      <span className="absolute inset-y-0 w-px bg-fg" style={{ left: at(t) }} />
    </div>
  );
}

export function EventIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = kind === "sigkill" ? Skull : kind === "sigstop" ? Snowflake : kind === "fenced" ? ShieldX : kind === "reclaim" ? Undo2 : Ghost;
  return <Icon className={className} aria-hidden />;
}
