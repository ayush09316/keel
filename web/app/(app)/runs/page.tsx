"use client";

import { ArrowUpRight, Play, Rows3, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { StatStrip } from "@/components/runs/stat-strip";
import { PageHeader } from "@/components/shell/page-header";
import { Guarded } from "@/components/shell/readonly";
import { useUI } from "@/components/shell/ui-context";
import { useStartRun } from "@/components/shell/use-actions";
import { Legend, StateBadge, StepBar } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cmd, EmptyState } from "@/components/ui/empty";
import { Kbd } from "@/components/ui/kbd";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, Td, Th } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useHotkeys } from "@/lib/hotkeys";
import type { RunState, StepState, WorkflowRun } from "@/lib/types";
import { usePoll } from "@/lib/usePoll";
import { cn, formatDuration, formatTime, lastLine, shortErrorType, shortId } from "@/lib/utils";

const LEGEND: StepState[] = ["succeeded", "running", "ready", "dead", "cancelled", "blocked"];
const STATES: RunState[] = ["pending", "running", "completed", "failed", "cancelled"];

function attemptsOf(run: WorkflowRun) {
  return run.steps.reduce((sum, s) => sum + s.attempt, 0);
}

function doneOf(run: WorkflowRun) {
  return run.steps.filter((s) => s.state === "succeeded").length;
}

export default function RunsPage() {
  const [state, setState] = useState<RunState | "">("");
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const { readonly } = useUI();
  const startRun = useStartRun();
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const { data, error, refresh } = usePoll(() => api.runs({ state: state || undefined, q: term || undefined }), 1500, [state, term]);
  const { data: workflows } = usePoll(() => api.workflows(), 30_000);
  const { data: stats } = usePoll(() => api.stats(), 3000);

  const start = async (workflow: string) => {
    setStarting(true);
    await startRun(workflow, refresh);
    setStarting(false);
  };

  useHotkeys({ n: () => !readonly && void start("order_fulfilment") });

  const runs = data?.results ?? [];
  const filtered = Boolean(state || term);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Runs"
        description="Every workflow run, newest first. The bar is one segment per step; a run that retried shows its attempt count."
        actions={(workflows ?? []).map((flow, i) => (
          <Guarded key={flow.name}>
            <Button
              variant={i === 0 ? "primary" : "outline"}
              disabled={starting || readonly}
              onClick={() => void start(flow.name)}
            >
              <Play aria-hidden />
              {flow.name}
              {i === 0 && <Kbd className="ml-0.5 border-transparent bg-black/15 text-current">N</Kbd>}
            </Button>
          </Guarded>
        ))}
      />

      <StatStrip />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
          <Pill active={!state} onClick={() => setState("")} count={stats?.runs_total}>
            all
          </Pill>
          {STATES.map((s) => (
            <Pill key={s} active={state === s} onClick={() => setState(s)} count={stats?.runs[s]}>
              {s}
            </Pill>
          ))}
        </div>
        <label className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 shadow-card focus-within:border-border-strong lg:w-72">
          <Search className="size-4 text-fg-subtle" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Run id prefix or order id"
            className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] outline-none placeholder:font-sans placeholder:text-fg-subtle focus-visible:outline-none"
            aria-label="Filter runs by id prefix or order id"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search" className="text-fg-subtle hover:text-fg">
              <X className="size-3.5" />
            </button>
          )}
        </label>
      </div>

      {!data && !error ? (
        <TableSkeleton />
      ) : runs.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={Search}
            title="No runs match"
            description={
              <>
                Nothing {state ? <b className="font-medium text-fg">{state}</b> : null}
                {term ? <> matching <Cmd>{term}</Cmd></> : null}. Try another filter.
              </>
            }
            action={
              <Button onClick={() => { setState(""); setQuery(""); }}>Clear filters</Button>
            }
          />
        ) : (
          <EmptyState
            icon={Rows3}
            title="No runs yet"
            description={
              <>
                Start one above, or queue twenty from a terminal with <Cmd>make seed</Cmd> and run <Cmd>make worker</Cmd> to
                watch them move.
              </>
            }
          />
        )
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] text-fg-subtle">
              {data?.count ?? 0} run{data?.count === 1 ? "" : "s"}
              {data && data.count > runs.length ? ` · showing latest ${runs.length}` : ""}
            </p>
            <Legend states={LEGEND} className="hidden sm:flex" />
          </div>

          <Table className="hidden md:block">
            <thead>
              <tr>
                <Th>Run</Th>
                <Th>Workflow</Th>
                <Th>State</Th>
                <Th className="w-44">Progress</Th>
                <Th className="hidden lg:table-cell">Started</Th>
                <Th>Duration</Th>
                <Th>Last error</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run, i) => (
                <tr key={run.id} className="group ap-rise transition-colors hover:bg-surface-2" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
                  <Td>
                    <Link href={`/runs/${run.id}`} className="inline-flex items-center gap-1 font-mono text-xs text-fg hover:text-accent">
                      {shortId(run.id)}
                      <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden />
                    </Link>
                  </Td>
                  <Td>
                    <p className="text-[13px] text-fg">{run.workflow}</p>
                    <p className="font-mono text-[11px] text-fg-subtle">{String(run.input?.order_id ?? "—")}</p>
                  </Td>
                  <Td>
                    <StateBadge state={run.state} />
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <StepBar steps={run.steps} className="flex-1" />
                      <span className="w-14 text-right font-mono text-[11px] text-fg-subtle tnum">
                        {doneOf(run)}/{run.steps.length}
                        {attemptsOf(run) > run.steps.length && <span className="text-warn"> ×{attemptsOf(run)}</span>}
                      </span>
                    </div>
                  </Td>
                  <Td className="hidden font-mono text-xs text-fg-muted lg:table-cell">{formatTime(run.started_at)}</Td>
                  <Td className="font-mono text-xs text-fg-muted tnum">{formatDuration(run.duration_seconds)}</Td>
                  <Td className="max-w-[18rem] font-mono text-[11.5px] text-fg-muted">
                    {run.error && (
                      <span title={run.error} className="line-clamp-1">
                        <span className="text-bad">{shortErrorType(run.error.split(":")[0] ?? "")}</span> {lastLine(run.error, 52)}
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>

          <ul className="space-y-2 md:hidden">
            {runs.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/runs/${run.id}`}
                  className="ap-press block rounded-xl border border-border bg-surface px-4 py-3 shadow-card active:bg-surface-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-fg">{shortId(run.id)}</span>
                    <StateBadge state={run.state} />
                  </div>
                  <p className="mt-1.5 truncate text-[13px] text-fg-muted">
                    {run.workflow} <span className="font-mono text-[11px] text-fg-subtle">{String(run.input?.order_id ?? "")}</span>
                  </p>
                  <div className="mt-2.5 flex items-center gap-2.5">
                    <StepBar steps={run.steps} className="flex-1" />
                    <span className="font-mono text-[11px] text-fg-subtle tnum">{formatDuration(run.duration_seconds)}</span>
                  </div>
                  {run.error && <p className="mt-2 line-clamp-1 font-mono text-[11px] text-bad">{lastLine(run.error, 60)}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Pill({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "ap-press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px]",
        active ? "border-fg/25 bg-fg text-bg" : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg",
      )}
    >
      {children}
      {count !== undefined && <span className={cn("font-mono text-[11px] tnum", active ? "opacity-70" : "text-fg-subtle")}>{count}</span>}
    </button>
  );
}
