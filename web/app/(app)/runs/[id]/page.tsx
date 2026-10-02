"use client";

import { Ban, Check, Copy, FileSearch, RotateCcw, Send } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { toast } from "sonner";

import { AttemptTimeline } from "@/components/runs/attempt-timeline";
import { RunDetailSkeleton } from "@/components/runs/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { Guarded } from "@/components/shell/readonly";
import { useUI } from "@/components/shell/ui-context";
import { describeFailure } from "@/components/shell/use-actions";
import { StateBadge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty";
import { JsonBlock } from "@/components/ui/json";
import { ApiError, api } from "@/lib/api";
import type { StepRun, WorkflowRunDetail } from "@/lib/types";
import { usePoll } from "@/lib/usePoll";
import { cn, errorParts, formatDateTime, formatDuration, formatTime, shortErrorType, shortId } from "@/lib/utils";

const TERMINAL = ["completed", "failed", "cancelled"];

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: run, error, refresh } = usePoll(() => api.run(id), 1200, [id]);

  if (error && !run) {
    const missing = error.includes("No WorkflowRun") || error.includes("Not found") || error.includes("not a valid UUID");
    return (
      <div className="space-y-6">
        <PageHeader title={shortId(id)} crumb={shortId(id)} />
        <EmptyState
          icon={FileSearch}
          title={missing ? "No run with this id" : "Could not load this run"}
          description={
            missing
              ? "It may belong to a database that has since been reset — make chaos truncates every table before it starts."
              : error
          }
          action={
            <Link href="/runs" className={buttonClass("primary")}>
              Back to runs
            </Link>
          }
        />
      </div>
    );
  }
  if (!run) return <RunDetailSkeleton />;
  return <RunDetail run={run} refresh={refresh} />;
}

function RunDetail({ run, refresh }: { run: WorkflowRunDetail; refresh: () => void }) {
  const { readonly } = useUI();
  const [confirm, setConfirm] = useState<"cancel" | "replay" | null>(null);
  const [copied, setCopied] = useState(false);

  const buried = run.steps.find((s) => s.state === "dead" && s.dead_letter && !s.dead_letter.replayed_at);
  const attempts = run.steps.reduce((n, s) => n + s.attempts.length, 0);
  const reclaims = run.steps.reduce((n, s) => n + s.reclaimed, 0);
  const fenced = run.steps.reduce((n, s) => n + s.attempts.filter((a) => a.outcome === "fenced").length, 0);
  const cached = run.steps.reduce((n, s) => n + s.effects_replayed, 0);
  const orderId = String(run.input?.order_id ?? "");

  const copy = async () => {
    await navigator.clipboard.writeText(run.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const cancel = async () => {
    try {
      const body = await api.cancelRun(run.id);
      toast.success(body.changed ? "Run cancelled" : "Run was already finished");
      refresh();
    } catch (cause) {
      toast.error("Cancel failed", { description: describeFailure(cause) });
      throw cause;
    }
  };

  const replay = async () => {
    if (!buried?.dead_letter) return;
    try {
      await api.replay(buried.dead_letter.id);
      toast.success(`Replaying ${buried.name}`, { description: "fresh attempt budget · earlier steps keep their output" });
      refresh();
    } catch (cause) {
      toast.error("Replay failed", { description: cause instanceof ApiError ? describeFailure(cause) : String(cause) });
      throw cause;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        crumb={shortId(run.id)}
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono">{run.workflow}</span>
            <StateBadge state={run.state} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px]">
            <button onClick={() => void copy()} className="inline-flex items-center gap-1.5 text-fg-muted hover:text-fg" title="Copy run id">
              {run.id}
              {copied ? <Check className="size-3.5 text-good" /> : <Copy className="size-3.5 opacity-60" />}
            </button>
            {orderId && <span className="text-fg-subtle">order {orderId}</span>}
          </span>
        }
        actions={
          <>
            {buried && (
              <Guarded>
                <Button variant="primary" disabled={readonly} onClick={() => setConfirm("replay")}>
                  <RotateCcw aria-hidden />
                  Replay {buried.name}
                </Button>
              </Guarded>
            )}
            {!TERMINAL.includes(run.state) && (
              <Guarded>
                <Button disabled={readonly} onClick={() => setConfirm("cancel")}>
                  <Ban aria-hidden />
                  Cancel run
                </Button>
              </Guarded>
            )}
          </>
        }
      />

      <dl className="ap-stagger grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-card sm:grid-cols-3 lg:grid-cols-6">
        <Meta label="started">{formatDateTime(run.started_at)}</Meta>
        <Meta label="duration">{formatDuration(run.duration_seconds)}</Meta>
        <Meta label="attempts">
          {attempts}
          <span className="text-fg-subtle"> / {run.steps.length} steps</span>
        </Meta>
        <Meta label="reclaimed" tone={reclaims ? "text-ice" : undefined}>
          {reclaims}
        </Meta>
        <Meta label="fenced commits" tone={fenced ? "text-fence" : undefined}>
          {fenced}
        </Meta>
        <Meta label="effects from cache" tone={cached ? "text-warn" : undefined}>
          {cached}
        </Meta>
      </dl>

      {run.error && <RunError run={run} />}

      <AttemptTimeline run={run} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Run context"
            description="Durable step outputs. A replay or a reclaimed step reads these from the database, not from memory."
          />
          <div className="space-y-3 p-4">
            {run.steps.map((step) => (
              <ContextEntry key={step.id} step={step} value={run.context?.[step.name]} />
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Input" description={run.idempotency_key ? `idempotency key ${run.idempotency_key}` : "no idempotency key"} />
          <div className="p-4">
            <JsonBlock value={run.input} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={`Outbox · ${run.events.length} event${run.events.length === 1 ? "" : "s"}`}
          description="Written in the same transaction as the step that emitted them; published later by the relay."
          right={
            <Link href="/outbox" className="font-mono text-[11px] text-fg-subtle hover:text-fg">
              all events →
            </Link>
          }
        />
        {run.events.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-6 text-sm text-fg-subtle">
            <Send className="size-4" aria-hidden /> No events emitted yet — they appear as each step commits.
          </p>
        ) : (
          <ol className="divide-y divide-border">
            {run.events.map((event) => (
              <li key={event.id} className="ap-rise grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto] sm:items-start sm:gap-4">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[12.5px] text-fg">{event.topic}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-fg-subtle">
                    #{event.id} · from {event.step_name}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-mono text-[11px] text-fg-subtle" title={event.dedupe_key ?? ""}>
                    dedupe {event.dedupe_key ?? "—"}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[11.5px] text-fg-muted" title={JSON.stringify(event.payload)}>
                    {JSON.stringify(event.payload)}
                  </p>
                </div>
                <div className="font-mono text-[11px] sm:text-right">
                  {event.published_at ? (
                    <span className="text-good">published {formatTime(event.published_at)}</span>
                  ) : (
                    <span className="text-warn">pending</span>
                  )}
                  <p className="text-fg-subtle">
                    {event.publish_attempts} publish attempt{event.publish_attempts === 1 ? "" : "s"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <ConfirmDialog
        open={confirm === "replay"}
        onOpenChange={(open) => setConfirm(open ? "replay" : null)}
        title={`Replay ${buried?.name ?? "step"}?`}
        body={
          <>
            Re-arms <code className="font-mono text-[12.5px] text-fg">{buried?.name}</code> with a fresh budget of{" "}
            {buried?.max_attempts} attempts and resumes the run from exactly that step. Steps that already succeeded keep their
            output and will not run again; any effect they performed is not repeated.
          </>
        }
        confirmLabel="Replay step"
        onConfirm={replay}
      />
      <ConfirmDialog
        open={confirm === "cancel"}
        onOpenChange={(open) => setConfirm(open ? "cancel" : null)}
        title="Cancel this run?"
        tone="danger"
        body="Every step that has not finished is cancelled. A worker still running one will find its commit fenced and discard the result."
        confirmLabel="Cancel run"
        onConfirm={cancel}
      />
    </div>
  );
}

function Meta({ label, children, tone }: { label: string; children: React.ReactNode; tone?: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="font-mono text-[10.5px] tracking-[0.08em] text-fg-subtle uppercase">{label}</dt>
      <dd className={cn("mt-1 truncate font-mono text-[14px] text-fg tnum", tone)}>{children}</dd>
    </div>
  );
}

function RunError({ run }: { run: WorkflowRunDetail }) {
  const [open, setOpen] = useState(false);
  const step = run.steps.find((s) => s.state === "dead");
  const source = step?.error || run.error;
  const { reason, summary, trace } = errorParts(source);
  return (
    <div className="ap-rise rounded-xl border border-bad/25 bg-bad/5 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-bad uppercase">
            {step ? `${step.name} · ${reason || "failed"}` : "run failed"}
            {step?.error_type ? ` · ${shortErrorType(step.error_type)}` : ""}
          </p>
          <p className="mt-1.5 font-mono text-[13px] leading-relaxed break-words text-fg">{summary}</p>
        </div>
        {trace && (
          <Button variant="ghost" size="xs" onClick={() => setOpen(!open)}>
            {open ? "Hide traceback" : "Show traceback"}
          </Button>
        )}
      </div>
      {open && trace && (
        <pre className="mt-3 max-h-80 overflow-auto rounded-lg border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed text-fg-muted">
          {trace}
        </pre>
      )}
    </div>
  );
}

function ContextEntry({ step, value }: { step: StepRun; value: unknown }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-mono text-[12px] text-fg">{step.name}</span>
        <StateBadge state={step.state} />
      </div>
      {value === undefined ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 font-mono text-[11px] text-fg-subtle">no output yet</p>
      ) : (
        <JsonBlock value={value} />
      )}
    </div>
  );
}
