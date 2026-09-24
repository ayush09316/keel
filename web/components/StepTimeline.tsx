"use client";

import type { WorkflowRunDetail } from "@/lib/types";
import { BAR_CLASS, formatDuration, shortErrorType } from "./ui";

const MIN_WIDTH_PERCENT = 1.2;

/**
 * Where a run actually spent its time.
 *
 * The step table says which steps failed; it does not show that the run sat in
 * backoff for nine of its twelve seconds. On an engine whose whole subject is
 * retries and leases, that gap is the interesting part.
 */
export function StepTimeline({ run }: { run: WorkflowRunDetail }) {
  const origin = new Date(run.started_at ?? run.created_at).getTime();
  const end = run.finished_at ? new Date(run.finished_at).getTime() : Date.now();
  const span = Math.max(end - origin, 1);

  const rows = run.steps.map((step) => {
    const startedAt = step.started_at ? new Date(step.started_at).getTime() : null;
    const finishedAt = step.finished_at
      ? new Date(step.finished_at).getTime()
      : step.state === "running"
        ? Date.now()
        : null;

    if (startedAt === null) return { step, left: 0, width: 0, started: false };

    const left = ((startedAt - origin) / span) * 100;
    const width = finishedAt === null ? MIN_WIDTH_PERCENT : ((finishedAt - startedAt) / span) * 100;

    return {
      step,
      left: Math.max(0, Math.min(left, 100)),
      width: Math.max(MIN_WIDTH_PERCENT, Math.min(width, 100 - left)),
      started: true,
      seconds: finishedAt === null ? null : (finishedAt - startedAt) / 1000,
    };
  });

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.07em] text-muted">
          timeline
        </span>
        <span className="font-mono text-[10px] text-muted">
          {formatDuration(span / 1000)} total
        </span>
      </div>

      <ol className="divide-y divide-line">
        {rows.map(({ step, left, width, started, seconds }) => (
          <li key={step.id} className="grid grid-cols-[150px_1fr_74px] items-center gap-3 px-3 py-2">
            <span className="truncate font-mono text-[11px]" title={step.name}>
              {step.name}
            </span>

            <div className="relative h-4 rounded bg-panel-2">
              {started ? (
                <span
                  className={`absolute inset-y-0 rounded transition-all duration-300 ${BAR_CLASS[step.state] ?? "bg-[#2a3546]"} ${
                    step.state === "running" ? "animate-pulse" : ""
                  }`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${step.name}: ${step.state}`}
                />
              ) : (
                <span className="absolute inset-y-0 left-0 flex items-center pl-2 font-mono text-[10px] text-muted">
                  {step.state}
                </span>
              )}

              {step.attempt > 1 && (
                <span
                  className="absolute -top-0.5 font-mono text-[9px] text-warn"
                  style={{ left: `calc(${Math.min(left + width, 97)}% + 4px)` }}
                >
                  ×{step.attempt}
                </span>
              )}
            </div>

            <span className="text-right font-mono text-[10px] text-muted tabular-nums">
              {seconds === null || seconds === undefined ? "—" : formatDuration(seconds)}
            </span>
          </li>
        ))}
      </ol>

      {run.steps.some((step) => step.error_type) && (
        <p className="border-t border-line px-3 py-2 font-mono text-[10px] text-muted">
          retried on{" "}
          {[...new Set(run.steps.filter((s) => s.error_type).map((s) => shortErrorType(s.error_type)))].join(
            ", ",
          )}
        </p>
      )}
    </div>
  );
}
