"use client";

import { Check, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";

import type { ChaosCounters, ChaosEvent, ChaosRecording } from "@/lib/chaos";
import { cn } from "@/lib/utils";
import { EventIcon } from "./lanes";
import { SPEEDS, currentSample, laneLabel } from "./replay";

const MARK: Record<string, string> = {
  sigkill: "bg-bad",
  sigstop: "bg-ice",
  reclaim: "bg-ice/60",
  fenced: "bg-fence",
};

export function Transport({
  recording,
  t,
  playing,
  speed,
  onToggle,
  onSeek,
  onSpeed,
}: {
  recording: ChaosRecording;
  t: number;
  playing: boolean;
  speed: number;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onSpeed: (s: number) => void;
}) {
  const d = recording.duration;
  const marks = recording.events.filter((e) => MARK[e.kind]);
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface px-3 py-3 shadow-card sm:flex-row sm:items-center sm:gap-4 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onToggle}
          aria-label={playing ? "Pause replay" : "Play replay"}
          className="ap-press inline-flex size-10 items-center justify-center rounded-full bg-fg text-bg shadow-card hover:opacity-90"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
        </button>
        <button
          onClick={() => onSeek(0)}
          aria-label="Restart"
          className="ap-press inline-flex size-9 items-center justify-center rounded-full text-fg-muted hover:bg-muted hover:text-fg"
        >
          <RotateCcw className="size-4" />
        </button>
        <span className="w-[104px] font-mono text-[12px] text-fg-muted tnum">
          <span className="text-fg">{t.toFixed(1)}s</span> / {d.toFixed(1)}s
        </span>
        <div role="radiogroup" aria-label="Playback speed" className="ml-auto flex h-8 items-center rounded-lg border border-border bg-surface-2 p-0.5 sm:hidden">
          {SPEEDS.map((s) => (
            <SpeedButton key={s} s={s} active={speed === s} onClick={() => onSpeed(s)} />
          ))}
        </div>
      </div>

      <div className="relative flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
          <span className="absolute inset-y-0 left-0 bg-fg/70" style={{ width: `${(t / d) * 100}%` }} />
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-full" aria-hidden>
          {marks.map((e, i) => (
            <span
              key={i}
              className={cn("absolute top-[3px] h-[7px] w-[2px] -translate-x-1/2 rounded-full", MARK[e.kind], e.t > t && "opacity-50")}
              style={{ left: `${(e.t / d) * 100}%` }}
            />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={d}
          step={0.05}
          value={t}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Scrub the replay"
          className="k-range relative"
        />
      </div>

      <div role="radiogroup" aria-label="Playback speed" className="hidden h-8 items-center rounded-lg border border-border bg-surface-2 p-0.5 sm:flex">
        {SPEEDS.map((s) => (
          <SpeedButton key={s} s={s} active={speed === s} onClick={() => onSpeed(s)} />
        ))}
      </div>
    </div>
  );
}

function SpeedButton({ s, active, onClick }: { s: number; active: boolean; onClick: () => void }) {
  return (
    <button
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "h-full rounded-md px-2 font-mono text-[11px] tnum transition-colors",
        active ? "bg-surface text-fg shadow-card" : "text-fg-subtle hover:text-fg",
      )}
    >
      {s}×
    </button>
  );
}

export function Invariant({ value, t, compact }: { value: number; t: number; compact?: boolean }) {
  const ok = value === 0;
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-xl border",
        ok ? "border-good/35 bg-good/[0.07]" : "border-bad/40 bg-bad/10",
        compact ? "px-3.5 py-3" : "px-5 py-4",
      )}
      role="status"
      aria-label={`orders charged twice: ${value}`}
    >
      <div aria-hidden className="k-grid absolute inset-0 -z-10 opacity-60 [mask-image:linear-gradient(to_left,#000,transparent)]" />
      <div className="flex items-center gap-3.5">
        <span className={cn("flex shrink-0 items-center justify-center rounded-full", ok ? "k-pulse bg-good text-accent-fg" : "bg-bad text-white", compact ? "size-8" : "size-11")}>
          <Check className={compact ? "size-4" : "size-5"} strokeWidth={3} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className={cn("font-mono tracking-[0.1em] uppercase", ok ? "text-good" : "text-bad", compact ? "text-[9.5px]" : "text-[10.5px]")}>
            the invariant{!compact && <> · checked every sample</>}
          </p>
          <p className={cn("flex items-baseline gap-2 font-semibold tracking-tight whitespace-nowrap", compact ? "text-[13.5px]" : "text-[17px]")}>
            orders charged twice
            <span className={cn("font-mono tnum", ok ? "text-good" : "text-bad", compact ? "text-[22px]" : "text-[32px]")}>{value}</span>
          </p>
        </div>
      </div>
      {!compact && (
        <p className="mt-2 font-mono text-[11px] text-fg-subtle">
          {ok ? `held for all ${t.toFixed(1)}s so far — every kill, every freeze` : "invariant broken"}
        </p>
      )}
    </div>
  );
}

const COUNTERS: { key: keyof ChaosCounters; label: string; note: string; tone?: string }[] = [
  { key: "attempts", label: "step attempts", note: "at least once" },
  { key: "reclaims", label: "reclaims", note: "leases that ran out", tone: "text-ice" },
  { key: "fenced", label: "fenced commits", note: "stale workers refused", tone: "text-fence" },
  { key: "effects_replayed", label: "served from cache", note: "ctx.once short-circuit", tone: "text-warn" },
  { key: "gateway_calls", label: "gateway calls", note: "physical, incl. failures" },
  { key: "charges", label: "charges created", note: "exactly once", tone: "text-good" },
];

export function CounterRow({ counters, recording }: { counters: ChaosCounters; recording: ChaosRecording }) {
  const final = recording.samples[recording.samples.length - 1]?.counters;
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-card sm:grid-cols-3 xl:grid-cols-6">
      {COUNTERS.map((c) => {
        const v = Math.round(counters[c.key]);
        return (
          <div key={c.key} className="bg-surface px-3.5 py-3">
            <dt className="truncate font-mono text-[10px] tracking-[0.08em] text-fg-subtle uppercase">{c.label}</dt>
            <dd className={cn("mt-1 font-mono text-[22px] leading-none font-semibold tracking-tight tnum", v > 0 ? (c.tone ?? "text-fg") : "text-fg-subtle")}>
              {v}
              {final && c.key === "charges" && <span className="ml-1 text-[12px] font-normal text-fg-subtle">/ {recording.config.runs}</span>}
            </dd>
            <p className="mt-1 truncate text-[11px] text-fg-subtle">{c.note}</p>
          </div>
        );
      })}
    </dl>
  );
}

export function GapChart({ recording, t }: { recording: ChaosRecording; t: number }) {
  const W = 600;
  const H = 150;
  const d = Math.max(recording.duration, 1);
  const s = recording.samples;
  const max = Math.max(1, ...s.map((x) => x.counters.attempts));
  const x = (v: number) => (v / d) * W;
  const y = (v: number) => H - 6 - (v / max) * (H - 18);
  const path = (key: keyof ChaosCounters) => s.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.counters[key]).toFixed(1)}`).join(" ");
  const series: { key: keyof ChaosCounters; label: string; color: string }[] = [
    { key: "attempts", label: "step attempts", color: "var(--info)" },
    { key: "gateway_calls", label: "gateway calls", color: "var(--warn)" },
    { key: "charges", label: "charges", color: "var(--good)" },
  ];
  const now = currentSample(recording, t).counters;
  return (
    <div className="rounded-xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-[13px] font-semibold tracking-tight">Delivery vs effects</h3>
          <p className="mt-0.5 text-xs text-fg-subtle">Attempts and calls climb with every crash. Charges track runs, one each.</p>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10.5px] text-fg-subtle">
          {series.map((sr) => (
            <li key={sr.key} className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full" style={{ background: sr.color }} aria-hidden />
              {sr.label} <span className="text-fg tnum">{now[sr.key]}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="px-2 pt-2 pb-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[150px] w-full" preserveAspectRatio="none" role="img" aria-label="Attempts, gateway calls and charges over the run">
          <defs>
            <clipPath id="k-played">
              <rect x="0" y="0" width={x(t)} height={H} />
            </clipPath>
          </defs>
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1="0" x2={W} y1={y(max * g)} y2={y(max * g)} stroke="var(--border)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
          ))}
          {series.map((sr) => (
            <path key={`f-${sr.key}`} d={path(sr.key)} fill="none" stroke={sr.color} strokeOpacity={0.2} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          ))}
          <g clipPath="url(#k-played)">
            {series.map((sr) => (
              <path key={sr.key} d={path(sr.key)} fill="none" stroke={sr.color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            ))}
          </g>
          <line x1={x(t)} x2={x(t)} y1="0" y2={H} stroke="var(--fg)" strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </div>
  );
}

const STATE_ORDER: { key: string; color: string }[] = [
  { key: "succeeded", color: "bg-good" },
  { key: "running", color: "bg-info" },
  { key: "ready", color: "bg-warn" },
  { key: "blocked", color: "bg-muted" },
  { key: "dead", color: "bg-dead" },
];

export function StepStates({ recording, t }: { recording: ChaosRecording; t: number }) {
  const sample = currentSample(recording, t);
  const total = Object.values(sample.steps).reduce((a, b) => a + b, 0) || 1;
  const c = sample.counters;
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-card">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold tracking-tight">Queue</h3>
        <p className="font-mono text-[11px] text-fg-subtle tnum">
          runs completed <span className="text-fg">{sample.runs.completed}</span>/{recording.config.runs}
        </p>
      </div>
      <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-muted">
        {STATE_ORDER.map((s) => (
          <span key={s.key} className={cn("h-full transition-[width] duration-300", s.color)} style={{ width: `${((sample.steps[s.key] ?? 0) / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10.5px] text-fg-subtle">
        {STATE_ORDER.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-[2px]", s.color)} aria-hidden />
            {s.key} <span className="text-fg-muted tnum">{sample.steps[s.key] ?? 0}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 font-mono text-[11px]">
        <p className="text-fg-subtle">
          outbox pending <span className={cn("tnum", c.outbox_pending ? "text-warn" : "text-fg-muted")}>{c.outbox_pending}</span>
        </p>
        <p className="text-fg-subtle">
          published <span className="text-fg-muted tnum">{c.outbox_published}</span>
        </p>
        <p className="text-fg-subtle">
          ran twice <span className="text-fg-muted tnum">{c.ran_twice}</span>
        </p>
        <p className="text-fg-subtle">
          gateway deduped <span className="text-fg-muted tnum">{c.gateway_deduped}</span>
        </p>
      </div>
    </div>
  );
}

export function describe(e: ChaosEvent) {
  const w = laneLabel(e.slot);
  const held = e.held ? `${e.held.step} of ${e.held.order}` : null;
  switch (e.kind) {
    case "spawn":
      return `${w} online · pid ${e.pid}`;
    case "respawn":
      return `${w} respawned as pid ${e.pid}`;
    case "sigkill":
      return held ? `SIGKILL pid ${e.pid} mid-step · was holding ${held}` : `SIGKILL pid ${e.pid} between steps`;
    case "sigstop":
      return `SIGSTOP pid ${e.pid} for ${Math.round(e.freeze_for ?? 0)}s${held ? ` holding ${held}` : ""} · lease is shorter, it will lose it`;
    case "sigcont":
      return `SIGCONT pid ${e.pid} · wakes up believing it still owns its step`;
    case "reclaim":
      return e.buried
        ? `reaper buried ${e.step} · lease expired on the last attempt`
        : `reaper reclaimed ${e.step} attempt ${e.attempt} from ${w} · back to ready`;
    case "fenced":
      return `${w}'s commit for ${e.step} attempt ${e.attempt} matched 0 rows · rolled back${e.effects ? " (effect already done → cache)" : ""}`;
    case "drain":
      return "attacks stop · draining the queue and the outbox";
    case "stop":
      return "every run terminal · running verify";
  }
}

const TAG: Record<string, string> = {
  sigkill: "text-bad bg-bad/10",
  sigstop: "text-ice bg-ice/10",
  sigcont: "text-ice bg-ice/5",
  reclaim: "text-ice bg-ice/10",
  fenced: "text-fence bg-fence/10",
  spawn: "text-good bg-good/10",
  respawn: "text-good bg-good/10",
  drain: "text-fg-muted bg-muted",
  stop: "text-fg-muted bg-muted",
};

export function EventLog({ recording, t, onSeek }: { recording: ChaosRecording; t: number; onSeek: (t: number) => void }) {
  const past = recording.events.filter((e) => e.t <= t && e.kind !== "spawn");
  const shown = past.slice(-80).reverse();
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [past.length]);
  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-[13px] font-semibold tracking-tight">Event log</h3>
        <span className="font-mono text-[11px] text-fg-subtle tnum">
          {past.length}/{recording.events.filter((e) => e.kind !== "spawn").length}
        </span>
      </div>
      <ol ref={ref} className="max-h-[420px] min-h-[220px] flex-1 overflow-y-auto p-1.5" aria-live="polite">
        {shown.length === 0 && <li className="px-3 py-6 text-center text-[12.5px] text-fg-subtle">Four workers up. Press play.</li>}
        {shown.map((e, i) => (
          <li key={`${e.t}-${e.kind}-${i}`} className={cn(i === 0 && "k-tick")}>
            <button
              onClick={() => onSeek(e.t)}
              className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2"
            >
              <span className="w-11 shrink-0 pt-px text-right font-mono text-[10.5px] text-fg-subtle tnum">{e.t.toFixed(1)}s</span>
              <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 font-mono text-[10px] font-semibold uppercase", TAG[e.kind])}>
                <EventIcon kind={e.kind} className="size-3" />
                {e.kind}
              </span>
              <span className="min-w-0 text-[12px] leading-snug text-fg-muted">{describe(e)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function VerifyBlock({ recording, done }: { recording: ChaosRecording; done: boolean }) {
  const s = recording.summary;
  const row = (label: string, value: React.ReactNode, tone?: string) => (
    <p className="flex justify-between gap-4">
      <span className="text-fg-subtle">{label}</span>
      <span className={cn("tnum", tone ?? "text-fg")}>{value}</span>
    </p>
  );
  return (
    <div className={cn("rounded-xl border bg-surface shadow-card transition-colors duration-500", done ? "border-good/40" : "border-border")}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-bad/70" />
          <span className="size-2.5 rounded-full bg-warn/70" />
          <span className="size-2.5 rounded-full bg-good/70" />
        </span>
        <span className="ml-2 font-mono text-[11px] text-fg-subtle">manage.py verify --require-published</span>
      </div>
      <div className="grid gap-x-10 gap-y-4 px-4 py-4 font-mono text-[12px] leading-relaxed sm:grid-cols-2">
        <div>
          <p className="mb-1 text-info">delivery (at least once, by design)</p>
          {row("steps", s.steps)}
          {row("step attempts", s.attempts)}
          {row("steps that ran more than once", s.ran_twice)}
          {row("steps reclaimed from a dead worker", s.reclaimed_steps)}
        </div>
        <div>
          <p className="mb-1 text-info">effects (exactly once, by construction)</p>
          {row("external effects performed", s.effects_performed)}
          {row("external effects served from cache", s.effects_replayed)}
          {row("physical gateway calls", s.gateway_calls)}
          {row("charges created", s.charges)}
          {row("orders charged twice", s.charged_twice, s.charged_twice ? "text-bad" : "text-good")}
        </div>
      </div>
      <p className={cn("border-t border-border px-4 py-2.5 font-mono text-[12px]", recording.passed ? "text-good" : "text-bad")}>
        {recording.passed ? "PASS every invariant held" : `FAIL ${recording.failures.join("; ")}`}
        <span className="ml-3 text-fg-subtle">
          {s.runs_completed} completed · {s.runs_failed} failed · outbox {s.outbox_pending} pending / {s.outbox_published} published
        </span>
      </p>
    </div>
  );
}
