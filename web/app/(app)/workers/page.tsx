"use client";

import { Cpu } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { StateBadge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Cmd, EmptyState } from "@/components/ui/empty";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/ui/sparkline";
import { Table, Td, Th } from "@/components/ui/table";
import { api } from "@/lib/api";
import type { StepState } from "@/lib/types";
import { usePoll } from "@/lib/usePoll";
import { useNow } from "@/lib/useNow";
import { cn, shortId } from "@/lib/utils";

const STALE_AFTER_S = 60;
const STEP_STATES: StepState[] = ["ready", "running", "blocked", "succeeded", "dead", "cancelled"];

function heartbeat(seconds: number) {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h`;
}

export default function WorkersPage() {
  const { data, error } = usePoll(() => api.workers(), 1500);
  const { data: tp } = usePoll(() => api.throughput(), 3000);
  const { data: stats } = usePoll(() => api.stats(), 2000);
  const now = useNow(250);

  const workers = data?.results ?? [];
  const total = tp?.total ?? [];
  const perMinute = total.slice(-6).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workers"
        description="A killed worker never deregisters. Its heartbeat age climbing while its steps go back to ready is what a crash looks like from the outside."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Throughput, all workers"
            description={`attempts finished per ${tp?.bucket_seconds ?? 10}s, last 5 minutes`}
            right={<span className="font-mono text-[12px] tnum">{perMinute}<span className="text-fg-subtle"> / min</span></span>}
          />
          <div className="px-4 py-4">{tp ? <Sparkline values={total} className="h-20" /> : <Skeleton className="h-20 w-full" />}</div>
        </Card>
        <Card>
          <CardHeader title="Step states" description="what the workers are draining" />
          <dl className="grid grid-cols-3 gap-px bg-border">
            {STEP_STATES.map((s) => (
              <div key={s} className="bg-surface px-3 py-2.5">
                <dt>
                  <StateBadge state={s} />
                </dt>
                <dd className="mt-1.5 font-mono text-lg font-semibold tnum">{stats?.steps[s] ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      {!data && !error ? (
        <TableSkeleton rows={4} />
      ) : workers.length === 0 ? (
        <EmptyState
          icon={Cpu}
          title="No workers have registered"
          description={
            <>
              Start one with <Cmd>make worker</Cmd> — run it in several terminals, then kill one with <Cmd>kill -9</Cmd> and watch its
              heartbeat go stale here.
            </>
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Worker</Th>
              <Th>Heartbeat</Th>
              <Th>Holding</Th>
              <Th className="text-right">Leases</Th>
              <Th className="hidden text-right sm:table-cell">Claimed</Th>
              <Th className="hidden text-right sm:table-cell">Succeeded</Th>
              <Th className="hidden text-right md:table-cell">Failed</Th>
              <Th className="hidden w-36 lg:table-cell">Throughput</Th>
            </tr>
          </thead>
          <tbody className="ap-stagger">
            {workers.map((w) => {
              const age = Math.max(0, (now - new Date(w.last_seen_at).getTime()) / 1000);
              const stale = age > STALE_AFTER_S;
              const leaseLeft = w.held?.lease_expires_at ? (new Date(w.held.lease_expires_at).getTime() - now) / 1000 : null;
              return (
                <tr key={w.id} className={cn("hover:bg-surface-2", stale && "opacity-60")}>
                  <Td>
                    <p className="flex items-center gap-2 font-mono text-[12.5px] text-fg">
                      <span className={cn("size-1.5 rounded-full", stale ? "bg-bad" : "bg-good motion-safe:animate-pulse")} aria-hidden />
                      {w.id}
                    </p>
                    <p className="mt-0.5 pl-3.5 font-mono text-[11px] text-fg-subtle">
                      {w.hostname} · pid {w.pid}
                    </p>
                  </Td>
                  <Td className={cn("font-mono text-[12px] tnum", stale ? "text-bad" : age > 10 ? "text-warn" : "text-good")}>
                    {heartbeat(age)}
                    {stale && <span className="ml-1.5 text-[10.5px] uppercase">stale</span>}
                  </Td>
                  <Td>
                    {w.held ? (
                      <Link href={`/runs/${w.held.run}`} className="group block">
                        <span className="font-mono text-[12px] text-fg group-hover:text-accent">{w.held.step}</span>
                        <span className="ml-1.5 font-mono text-[11px] text-fg-subtle">
                          {shortId(w.held.run)} · #{w.held.attempt}
                        </span>
                        {leaseLeft !== null && (
                          <span className={cn("mt-0.5 block font-mono text-[10.5px] tnum", leaseLeft < 0 ? "text-bad" : "text-fg-subtle")}>
                            {leaseLeft < 0 ? "lease expired" : `lease ${leaseLeft.toFixed(1)}s`}
                          </span>
                        )}
                      </Link>
                    ) : (
                      <span className="font-mono text-[12px] text-fg-subtle">idle</span>
                    )}
                  </Td>
                  <Td className={cn("text-right font-mono text-[12.5px] tnum", w.leases ? "text-info" : "text-fg-subtle")}>{w.leases}</Td>
                  <Td className="hidden text-right font-mono text-[12.5px] tnum sm:table-cell">{w.claimed}</Td>
                  <Td className="hidden text-right font-mono text-[12.5px] text-good tnum sm:table-cell">{w.succeeded}</Td>
                  <Td className={cn("hidden text-right font-mono text-[12.5px] tnum md:table-cell", w.failed ? "text-bad" : "text-fg-subtle")}>{w.failed}</Td>
                  <Td className="hidden lg:table-cell">
                    <Sparkline values={tp?.workers[w.id] ?? new Array(30).fill(0)} stroke={stale ? "var(--fg-subtle)" : "var(--accent)"} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
