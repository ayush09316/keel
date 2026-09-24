"use client";

import { api } from "@/lib/api";
import { usePoll } from "@/lib/usePoll";

function Stat({
  value,
  label,
  tone = "",
}: {
  value: number | string;
  label: string;
  tone?: string;
}) {
  return (
    <div className="min-w-[96px] rounded-lg border border-line bg-panel px-3 py-2">
      <b className={`block font-mono text-lg font-semibold ${tone}`}>{value}</b>
      <small className="text-[10px] uppercase tracking-[0.06em] text-muted">
        {label}
      </small>
    </div>
  );
}

export function StatStrip() {
  const { data, error } = usePoll(() => api.stats(), 2000);

  if (error && !data) {
    return (
      <div className="mt-4 rounded-lg border border-[#4d2222] bg-[#221212] px-3 py-2 font-mono text-xs text-bad">
        API unreachable — is <span className="text-fg">manage.py runserver</span>{" "}
        up on :8000?
      </div>
    );
  }
  if (!data) return <div className="h-[62px]" />;

  return (
    <div className="flex flex-wrap gap-2.5 pt-4">
      <Stat value={data.runs_total} label="runs" />
      <Stat value={data.runs.running} label="running" tone="text-info" />
      <Stat value={data.runs.completed} label="completed" tone="text-accent" />
      <Stat value={data.runs.failed} label="failed" tone="text-bad" />
      <Stat value={data.dead_letters_open} label="dlq open" tone="text-dead" />
      <Stat value={data.outbox_pending} label="outbox due" tone="text-warn" />
      <Stat value={data.outbox_published} label="published" />
      <Stat value={data.workers_alive} label="workers" />
    </div>
  );
}
