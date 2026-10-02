"use client";

import { Activity, ArrowRight, Cpu, Play, Skull } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Invariant } from "@/components/chaos/panels";
import { StatStrip } from "@/components/runs/stat-strip";
import { PageHeader } from "@/components/shell/page-header";
import { Guarded } from "@/components/shell/readonly";
import { useUI } from "@/components/shell/ui-context";
import { useStartRun } from "@/components/shell/use-actions";
import { StateBadge, StepBar } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Cmd } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/ui/sparkline";
import { api, loadRecording } from "@/lib/api";
import type { ChaosRecording } from "@/lib/chaos";
import { usePoll } from "@/lib/usePoll";
import { ago, formatDateTime, lastLine, shortId } from "@/lib/utils";

export default function OverviewPage() {
  const { readonly } = useUI();
  const startRun = useStartRun();
  const { data: recent } = usePoll(() => api.runs({ limit: 6 }), 2000);
  const { data: failed } = usePoll(() => api.runs({ state: "failed", limit: 4 }), 4000);
  const { data: workers } = usePoll(() => api.workers(), 2500);
  const { data: tp } = usePoll(() => api.throughput(), 5000);
  const [chaos, setChaos] = useState<ChaosRecording | null>(null);

  useEffect(() => {
    loadRecording().then(setChaos).catch(() => {});
  }, []);

  const total = tp?.total ?? [];
  const lastMinute = total.slice(-6).reduce((a, b) => a + b, 0);
  const now = Date.now();
  const live = (workers?.results ?? []).filter((w) => now - new Date(w.last_seen_at).getTime() < 60_000);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="The engine at a glance: what is queued, who is holding it, and the last time somebody tried to break it."
        actions={
          <Guarded>
            <Button variant="primary" disabled={readonly} onClick={() => void startRun("order_fulfilment")}>
              <Play aria-hidden />
              Start an order
            </Button>
          </Guarded>
        }
      />
      <StatStrip />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="ap-rise lg:col-span-2">
          <CardHeader
            title="Throughput"
            description={`step attempts finished, ${tp?.bucket_seconds ?? 10}s buckets, last 5 minutes`}
            right={<span className="font-mono text-[12px] text-fg tnum">{lastMinute}<span className="text-fg-subtle"> / min</span></span>}
          />
          <div className="px-4 pt-4 pb-3">
            {tp ? <Sparkline values={total} className="h-24" label={`${lastMinute} attempts in the last minute`} /> : <Skeleton className="h-24 w-full" />}
            <div className="mt-2 flex justify-between font-mono text-[10px] text-fg-subtle">
              <span>-5m</span>
              <span>now</span>
            </div>
          </div>
        </Card>

        <Card className="ap-rise flex flex-col [--i:1]">
          <CardHeader
            title="Latest chaos run"
            description={chaos ? `${chaos.source === "latest" ? "latest run" : "committed sample"} · ${formatDateTime(chaos.recorded_at)}` : "loading…"}
            right={<Activity className="size-4 text-fg-subtle" aria-hidden />}
          />
          <div className="flex flex-1 flex-col gap-3 p-4">
            {chaos ? (
              <>
                <Invariant value={chaos.summary.charged_twice} t={chaos.duration} compact />
                <p className="font-mono text-[11.5px] leading-relaxed text-fg-muted">
                  {chaos.config.runs} runs · <span className="text-bad">{chaos.kills} SIGKILL</span> ·{" "}
                  <span className="text-ice">{chaos.freezes} SIGSTOP</span> · {chaos.summary.attempts} attempts → {chaos.summary.charges} charges
                </p>
                <Link href="/chaos" className="mt-auto inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
                  Replay it <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </>
            ) : (
              <Skeleton className="h-24 w-full" />
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="ap-rise lg:col-span-2 [--i:2]">
          <CardHeader
            title="Recent runs"
            right={
              <Link href="/runs" className="font-mono text-[11px] text-fg-subtle hover:text-fg">
                all runs →
              </Link>
            }
          />
          {!recent ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : recent.results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-fg-subtle">
              No runs yet — <Cmd>make seed</Cmd> queues twenty.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.results.map((run) => (
                <li key={run.id}>
                  <Link href={`/runs/${run.id}`} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 hover:bg-surface-2 sm:grid-cols-[80px_minmax(0,1fr)_120px_auto]">
                    <span className="font-mono text-xs text-fg">{shortId(run.id)}</span>
                    <span className="truncate text-[13px] text-fg-muted">{run.workflow}</span>
                    <StepBar steps={run.steps} className="hidden sm:flex" />
                    <StateBadge state={run.state} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="ap-rise [--i:3]">
            <CardHeader
              title="Workers"
              right={
                <Link href="/workers" className="font-mono text-[11px] text-fg-subtle hover:text-fg">
                  details →
                </Link>
              }
            />
            <ul className="divide-y divide-border">
              {live.length === 0 && (
                <li className="flex items-center gap-2 px-4 py-5 text-[13px] text-fg-subtle">
                  <Cpu className="size-4" aria-hidden /> none alive — <Cmd>make worker</Cmd>
                </li>
              )}
              {live.slice(0, 5).map((w) => (
                <li key={w.id} className="flex items-center gap-2.5 px-4 py-2.5">
                  <span className="size-1.5 rounded-full bg-good motion-safe:animate-pulse" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg">{w.id}</span>
                  <span className="truncate font-mono text-[11px] text-fg-subtle">{w.held?.step ?? "idle"}</span>
                  <span className="font-mono text-[11px] text-fg-subtle tnum">{ago(w.last_seen_at, now)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="ap-rise [--i:4]">
            <CardHeader
              title="Recent failures"
              right={
                <Link href="/dead-letters" className="font-mono text-[11px] text-fg-subtle hover:text-fg">
                  dead letters →
                </Link>
              }
            />
            <ul className="divide-y divide-border">
              {failed && failed.results.length === 0 && (
                <li className="flex items-center gap-2 px-4 py-5 text-[13px] text-fg-subtle">
                  <Skull className="size-4" aria-hidden /> nothing has been buried
                </li>
              )}
              {(failed?.results ?? []).map((run) => (
                <li key={run.id}>
                  <Link href={`/runs/${run.id}`} className="block px-4 py-2.5 hover:bg-surface-2">
                    <p className="font-mono text-[12px] text-fg">
                      {shortId(run.id)} <span className="text-fg-subtle">{run.workflow}</span>
                    </p>
                    <p className="mt-0.5 line-clamp-1 font-mono text-[11px] text-bad">{lastLine(run.error, 70)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
