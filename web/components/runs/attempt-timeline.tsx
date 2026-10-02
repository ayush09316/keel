"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import type { AttemptOutcome, StepAttempt, StepRun, WorkflowRunDetail } from "@/lib/types";
import { cn, formatDuration, formatTime, shortErrorType } from "@/lib/utils";
import { StateBadge } from "../ui/badge";
import { Tip } from "../ui/tooltip";

const SEGMENT: Record<AttemptOutcome, string> = {
  running: "bg-info",
  succeeded: "bg-good",
  retry: "bg-warn",
  dead: "bg-dead",
  lease_expired: "bg-ice",
  fenced: "bg-fence",
};

export function outcomeSentence(a: StepAttempt) {
  switch (a.outcome) {
    case "succeeded":
      return a.effects_replayed > 0 ? "committed · effect served from idempotency cache" : "committed";
    case "retry":
      return "failed · retry scheduled with backoff";
    case "dead":
      return "failed · dead-lettered";
    case "lease_expired":
      return a.finished_at ? "lease expired · no attempts left, buried" : "lease expired · reclaimed by the reaper";
    case "fenced":
      return "lease lost · commit fenced, result discarded";
    default:
      return "running · lease held";
  }
}

function time(value: string | null) {
  return value ? new Date(value).getTime() : null;
}

function endOf(a: StepAttempt, now: number) {
  return time(a.fenced_at) ?? time(a.finished_at) ?? time(a.reclaimed_at) ?? now;
}

export function AttemptTimeline({ run }: { run: WorkflowRunDetail }) {
  const now = Date.now();
  const all = run.steps.flatMap((s) => s.attempts);
  const origin = Math.min(
    time(run.started_at) ?? time(run.created_at) ?? now,
    ...all.map((a) => time(a.started_at) ?? now),
  );
  const end = Math.max(time(run.finished_at) ?? now, ...all.map((a) => endOf(a, now)));
  const span = Math.max(end - origin, 1);
  const pct = (t: number) => ((t - origin) / span) * 100;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-[13px] font-semibold tracking-tight">Attempt timeline</h2>
          <p className="mt-0.5 text-xs text-fg-subtle">Every claim of every step, on one clock. Gaps are backoff or a dead worker&apos;s lease running out.</p>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10.5px] text-fg-subtle">
          {(["succeeded", "retry", "lease_expired", "fenced", "dead", "running"] as AttemptOutcome[]).map((o) => (
            <li key={o} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-[2px]", SEGMENT[o])} aria-hidden />
              {o === "lease_expired" ? "reclaimed" : o}
            </li>
          ))}
        </ul>
      </div>

      <div className="px-4 pt-3 pb-1">
        <div className="relative ml-0 h-4 sm:ml-[168px]">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute top-0 -translate-x-1/2 font-mono text-[10px] text-fg-subtle tnum first:translate-x-0 last:-translate-x-full"
              style={{ left: `${t * 100}%` }}
            >
              {formatDuration((span * t) / 1000)}
            </span>
          ))}
        </div>
      </div>

      <ol className="divide-y divide-border">
        {run.steps.map((step) => (
          <StepRow key={step.id} step={step} pct={pct} now={now} />
        ))}
      </ol>
    </div>
  );
}

function StepRow({ step, pct, now }: { step: StepRun; pct: (t: number) => number; now: number }) {
  const [open, setOpen] = useState(step.attempts.length > 1 || step.state === "dead");
  const eventful = step.attempts.some((a) => a.outcome !== "succeeded" && a.outcome !== "running");

  return (
    <li>
      <div className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[152px_minmax(0,1fr)] sm:gap-4">
        <button
          onClick={() => setOpen(!open)}
          className="group flex min-w-0 items-center gap-2 text-left"
          aria-expanded={open}
          disabled={!step.attempts.length}
        >
          <ChevronDown
            className={cn("size-3.5 shrink-0 text-fg-subtle transition-transform", !open && "-rotate-90", !step.attempts.length && "opacity-0")}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="block truncate font-mono text-[12.5px] text-fg" title={step.name}>
              {step.name}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[10.5px] text-fg-subtle">
              {step.attempts.length} attempt{step.attempts.length === 1 ? "" : "s"}
              {eventful && <span className="size-1 rounded-full bg-warn" aria-hidden />}
            </span>
          </span>
        </button>

        <div className="relative h-7 rounded-md bg-surface-2 ring-1 ring-border ring-inset">
          {[25, 50, 75].map((x) => (
            <span key={x} aria-hidden className="absolute inset-y-0 w-px bg-border" style={{ left: `${x}%` }} />
          ))}
          {step.attempts.length === 0 && (
            <span className="absolute inset-0 flex items-center px-2.5 font-mono text-[10.5px] text-fg-subtle">{step.state} · not claimed yet</span>
          )}
          {step.attempts.map((a, i) => {
            const start = time(a.started_at) ?? now;
            const stop = endOf(a, now);
            const left = Math.max(0, Math.min(pct(start), 100));
            const width = Math.max(0.8, Math.min(pct(stop) - left, 100 - left));
            const reclaimAt = time(a.reclaimed_at);
            const fencedSplit = a.outcome === "fenced" && reclaimAt ? Math.max(0, Math.min(100, ((reclaimAt - start) / Math.max(stop - start, 1)) * 100)) : null;
            return (
              <Tip
                key={a.id}
                content={
                  <div className="space-y-1 font-mono text-[11px]">
                    <p className="text-fg">
                      attempt {a.attempt} · {outcomeSentence(a)}
                    </p>
                    <p>worker {a.worker_id}</p>
                    <p>
                      {formatTime(a.started_at)} → {formatTime(a.fenced_at ?? a.finished_at ?? a.reclaimed_at)} ·{" "}
                      {formatDuration((stop - start) / 1000)}
                    </p>
                    {a.error && <p className="text-bad">{a.error}</p>}
                  </div>
                }
              >
                <span
                  tabIndex={0}
                  className={cn(
                    "ap-rise absolute top-1 bottom-1 overflow-hidden rounded-[4px] outline-offset-1",
                    a.outcome === "running" && "motion-safe:animate-pulse",
                    fencedSplit === null && SEGMENT[a.outcome],
                  )}
                  style={{ left: `${left}%`, width: `${width}%`, "--i": i } as React.CSSProperties}
                  aria-label={`attempt ${a.attempt}: ${outcomeSentence(a)}`}
                >
                  {fencedSplit !== null && (
                    <>
                      <span className="absolute inset-y-0 left-0 bg-ice" style={{ width: `${fencedSplit}%` }} />
                      <span
                        className="absolute inset-y-0 right-0 bg-[repeating-linear-gradient(135deg,var(--fence)_0_3px,color-mix(in_oklab,var(--fence)_45%,transparent)_3px_6px)]"
                        style={{ width: `${100 - fencedSplit}%` }}
                      />
                    </>
                  )}
                  {a.effects_replayed > 0 && (
                    <span className="absolute inset-y-0 right-0 w-1 bg-[repeating-linear-gradient(0deg,var(--bg)_0_2px,transparent_2px_4px)] opacity-70" />
                  )}
                </span>
              </Tip>
            );
          })}
        </div>
      </div>

      {open && step.attempts.length > 0 && (
        <div className="px-4 pb-3 sm:pl-[188px]">
          <ol className="ap-stagger space-y-1.5">
            {step.attempts.map((a) => (
              <AttemptLine key={a.id} attempt={a} max={step.max_attempts} />
            ))}
          </ol>
        </div>
      )}
    </li>
  );
}

function AttemptLine({ attempt: a, max }: { attempt: StepAttempt; max: number }) {
  const duration =
    (time(a.fenced_at) ?? time(a.finished_at) ?? time(a.reclaimed_at) ?? Date.now()) - (time(a.started_at) ?? Date.now());
  return (
    <li className="rounded-lg border border-border bg-surface-2/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-mono text-[11px] text-fg-subtle tnum">
          #{a.attempt}/{max}
        </span>
        <StateBadge state={a.outcome} />
        <span className="text-[12.5px] text-fg-muted">{outcomeSentence(a)}</span>
        <span className="ml-auto font-mono text-[11px] text-fg-subtle tnum">
          {formatTime(a.started_at)} · {formatDuration(duration / 1000)}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-fg-subtle">
        <span>
          lease owner <span className="text-fg-muted">{a.worker_id}</span>
        </span>
        {(a.effects_performed > 0 || a.effects_replayed > 0) && (
          <span>
            effects{" "}
            {a.effects_performed > 0 && <span className="text-good">{a.effects_performed} performed</span>}
            {a.effects_performed > 0 && a.effects_replayed > 0 && " · "}
            {a.effects_replayed > 0 && <span className="text-warn">{a.effects_replayed} from cache</span>}
          </span>
        )}
        {a.events > 0 && <span>{a.events} event{a.events === 1 ? "" : "s"} to outbox</span>}
        {a.reclaimed_at && <span className="text-ice">reclaimed {formatTime(a.reclaimed_at)}</span>}
        {a.fenced_at && <span className="text-fence">fenced {formatTime(a.fenced_at)}</span>}
      </div>
      {a.error && (
        <p className="mt-1.5 font-mono text-[11.5px] leading-relaxed break-words text-bad/90">
          <span className="text-bad">{shortErrorType(a.error_type)}</span>
          {a.error.replace(/^[\w.]+: /, ": ")}
        </p>
      )}
      {a.outcome === "fenced" && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">
          This worker stalled past its lease. Its <code className="font-mono text-[11px]">UPDATE … WHERE attempt = {a.attempt}</code> matched
          zero rows, so state, context and outbox rows rolled back together
          {a.effects_performed > 0 ? " — the effect it already performed is answered from the idempotency cache next time." : "."}
        </p>
      )}
    </li>
  );
}
