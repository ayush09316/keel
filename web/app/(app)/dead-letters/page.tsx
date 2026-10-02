"use client";

import { ChevronDown, RotateCcw, Skull, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shell/page-header";
import { Guarded } from "@/components/shell/readonly";
import { useUI } from "@/components/shell/ui-context";
import { describeFailure } from "@/components/shell/use-actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Cmd, EmptyState } from "@/components/ui/empty";
import { TableSkeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useHotkeys } from "@/lib/hotkeys";
import type { DeadLetter } from "@/lib/types";
import { usePoll } from "@/lib/usePoll";
import { cn, errorParts, formatDateTime, shortErrorType, shortId } from "@/lib/utils";

export default function DeadLettersPage() {
  const [openOnly, setOpenOnly] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const { readonly } = useUI();
  const { data, error, refresh } = usePoll(() => api.deadLetters(openOnly), 2000, [openOnly]);

  const rows = data?.results ?? [];
  const replayable = rows.filter((d) => !d.replayed_at);
  const chosen = replayable.filter((d) => selected.has(d.id));

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allOn = replayable.length > 0 && chosen.length === replayable.length;

  useHotkeys({
    x: () => setSelected(allOn ? new Set() : new Set(replayable.map((d) => d.id))),
    Escape: () => setSelected(new Set()),
  });

  const replay = async () => {
    const results = await Promise.allSettled(chosen.map((d) => api.replay(d.id)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (ok) toast.success(`Replayed ${ok} step${ok === 1 ? "" : "s"}`, { description: "fresh attempt budgets · earlier steps keep their output" });
    if (failed) toast.error(`${results.length - ok} replay${results.length - ok === 1 ? "" : "s"} failed`, { description: describeFailure(failed.reason) });
    setSelected(new Set());
    refresh();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dead letters"
        description="Steps that exhausted their attempts or raised NonRetryableError. Replay re-arms exactly that step; the steps before it keep their output and their effects are not repeated."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {[
            [true, "open"],
            [false, "including replayed"],
          ].map(([value, label]) => (
            <button
              key={String(value)}
              onClick={() => {
                setOpenOnly(value as boolean);
                setSelected(new Set());
              }}
              aria-pressed={openOnly === value}
              className={cn(
                "ap-press h-8 rounded-full border px-3 text-[12.5px]",
                openOnly === value ? "border-fg/25 bg-fg text-bg" : "border-border bg-surface text-fg-muted hover:text-fg",
              )}
            >
              {label as string}
            </button>
          ))}
        </div>
        {replayable.length > 0 && (
          <label className="flex items-center gap-2 font-mono text-[12px] text-fg-muted">
            <input
              type="checkbox"
              checked={allOn}
              onChange={() => setSelected(allOn ? new Set() : new Set(replayable.map((d) => d.id)))}
              className="size-4 accent-[var(--accent)]"
            />
            select all {replayable.length}
          </label>
        )}
      </div>

      {chosen.length > 0 && (
        <div className="ap-pop sticky top-16 z-20 flex items-center gap-3 rounded-xl border border-border-strong bg-surface px-3 py-2 shadow-pop md:top-4">
          <button onClick={() => setSelected(new Set())} aria-label="Clear selection" className="rounded-md p-1 text-fg-subtle hover:bg-muted hover:text-fg">
            <X className="size-4" />
          </button>
          <span className="font-mono text-[12.5px]">
            <span className="text-fg">{chosen.length}</span> <span className="text-fg-subtle">selected</span>
          </span>
          <div className="ml-auto">
            <Guarded>
              <Button variant="primary" disabled={readonly} onClick={() => setConfirming(true)}>
                <RotateCcw aria-hidden />
                Replay {chosen.length}
              </Button>
            </Guarded>
          </div>
        </div>
      )}

      {!data && !error ? (
        <TableSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Skull}
          title={openOnly ? "Nothing is buried" : "The dead-letter queue has never been used"}
          description={
            <>
              Force one with <Cmd>KEEL_DEMO_FAILURE_RATE=1 make worker</Cmd>, or start a <Cmd>refund_request</Cmd> whose amount exceeds
              the charge.
            </>
          }
        />
      ) : (
        <ul className="ap-stagger space-y-2">
          {rows.map((dead) => (
            <DeadRow key={dead.id} dead={dead} selected={selected.has(dead.id)} onToggle={() => toggle(dead.id)} />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Replay ${chosen.length} dead-lettered step${chosen.length === 1 ? "" : "s"}?`}
        body={
          <>
            Each step gets a fresh attempt budget and its run resumes from exactly that point. This cannot be undone — but it is
            safe to repeat: effects already performed are answered from the idempotency cache.
            <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto font-mono text-[12px]">
              {chosen.map((d) => (
                <li key={d.id} className="text-fg">
                  {d.step_name} <span className="text-fg-subtle">· run {shortId(d.run)}</span>
                </li>
              ))}
            </ul>
          </>
        }
        confirmLabel={`Replay ${chosen.length}`}
        onConfirm={replay}
      />
    </div>
  );
}

function DeadRow({ dead, selected, onToggle }: { dead: DeadLetter; selected: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false);
  const { reason, summary, trace } = errorParts(dead.error);
  return (
    <li className={cn("rounded-xl border bg-surface shadow-card transition-colors", selected ? "border-accent/50 bg-accent/[0.04]" : "border-border")}>
      <div className="flex gap-3 px-4 py-3">
        <div className="pt-0.5">
          {dead.replayed_at ? (
            <span className="block size-4" />
          ) : (
            <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${dead.step_name}`} className="size-4 accent-[var(--accent)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-[13px] text-fg">{dead.step_name}</span>
            <span className="rounded bg-dead/10 px-1.5 font-mono text-[10.5px] text-dead">{shortErrorType(dead.error_type) || "error"}</span>
            {reason && <span className="font-mono text-[11px] text-fg-subtle">{reason}</span>}
            <span className="font-mono text-[11px] text-fg-subtle">after {dead.attempts} attempt{dead.attempts === 1 ? "" : "s"}</span>
            {dead.replayed_at && <span className="font-mono text-[11px] text-good">replayed ×{dead.replay_count}</span>}
          </div>
          <p className="mt-1.5 font-mono text-[12.5px] leading-relaxed break-words text-fg-muted">{summary || "no message"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-fg-subtle">
            <Link href={`/runs/${dead.run}`} className="text-fg-muted hover:text-accent">
              run {shortId(dead.run)} · {dead.workflow}
            </Link>
            <span>buried {formatDateTime(dead.created_at)}</span>
            {trace && (
              <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 hover:text-fg" aria-expanded={open}>
                <ChevronDown className={cn("size-3 transition-transform", !open && "-rotate-90")} aria-hidden />
                traceback
              </button>
            )}
          </div>
          {open && trace && (
            <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-border bg-surface-2/50 p-3 font-mono text-[11px] leading-relaxed text-fg-muted">
              {trace}
            </pre>
          )}
        </div>
      </div>
    </li>
  );
}
