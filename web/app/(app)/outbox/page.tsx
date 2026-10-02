"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { Cmd, EmptyState } from "@/components/ui/empty";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, Td, Th } from "@/components/ui/table";
import { api } from "@/lib/api";
import { usePoll } from "@/lib/usePoll";
import { cn, formatTime, shortId } from "@/lib/utils";

const FILTERS = [
  [undefined, "all"],
  ["pending", "pending"],
  ["published", "published"],
] as const;

export default function OutboxPage() {
  const [state, setState] = useState<"pending" | "published" | undefined>(undefined);
  const { data, error } = usePoll(() => api.outbox(state), 2000, [state]);
  const { data: stats } = usePoll(() => api.stats(), 2000);
  const rows = data?.results ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outbox"
        description="Events inserted in the same transaction as the step that emitted them, then published by the relay at least once. The dedupe key is what lets a consumer drop a repeat."
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map(([value, label]) => (
          <button
            key={label}
            onClick={() => setState(value)}
            aria-pressed={state === value}
            className={cn(
              "ap-press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px]",
              state === value ? "border-fg/25 bg-fg text-bg" : "border-border bg-surface text-fg-muted hover:text-fg",
            )}
          >
            {label}
            {stats && (
              <span className="font-mono text-[11px] opacity-70 tnum">
                {value === "pending" ? stats.outbox_pending : value === "published" ? stats.outbox_published : stats.outbox_pending + stats.outbox_published}
              </span>
            )}
          </button>
        ))}
      </div>
      {!data && !error ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={state === "pending" ? "Nothing waiting to publish" : "No events yet"}
          description={
            <>
              Steps emit events as they commit; <Cmd>make relay</Cmd> publishes them to <Cmd>var/published.jsonl</Cmd>.
            </>
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Topic</Th>
              <Th className="hidden md:table-cell">Run · step</Th>
              <Th className="hidden lg:table-cell">Dedupe key</Th>
              <Th>Published</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="hover:bg-surface-2">
                <Td className="font-mono text-[12px] text-fg-subtle tnum">{e.id}</Td>
                <Td>
                  <p className="font-mono text-[12.5px] text-fg">{e.topic}</p>
                  <p className="max-w-[16rem] truncate font-mono text-[11px] text-fg-subtle md:hidden">{e.step_name}</p>
                </Td>
                <Td className="hidden md:table-cell">
                  {e.run ? (
                    <Link href={`/runs/${e.run}`} className="font-mono text-[12px] text-fg-muted hover:text-accent">
                      {shortId(e.run)} <span className="text-fg-subtle">· {e.step_name}</span>
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="hidden max-w-[18rem] truncate font-mono text-[11.5px] text-fg-subtle lg:table-cell" title={e.dedupe_key ?? ""}>
                  {e.dedupe_key ?? "—"}
                </Td>
                <Td className="font-mono text-[12px]">
                  {e.published_at ? <span className="text-good">{formatTime(e.published_at)}</span> : <span className="text-warn">pending</span>}
                  {e.publish_attempts > 1 && <span className="ml-1.5 text-fg-subtle">×{e.publish_attempts}</span>}
                  {e.last_error && <p className="max-w-[14rem] truncate text-[11px] text-bad">{e.last_error}</p>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
