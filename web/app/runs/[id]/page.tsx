"use client";

import Link from "next/link";
import { use } from "react";

import { api } from "@/lib/api";
import { usePoll } from "@/lib/usePoll";
import {
  Button,
  Code,
  Empty,
  Panel,
  StateBadge,
  Table,
  Td,
  Th,
  formatDuration,
  formatTime,
  lastLine,
  shortId,
} from "@/components/ui";

const TERMINAL = ["completed", "failed", "cancelled"];

export default function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: run, error, refresh } = usePoll(() => api.run(id), 1200, [id]);

  if (error && !run) {
    return <Empty>Could not load run {shortId(id)} — {error}</Empty>;
  }
  if (!run) return <Empty>Loading…</Empty>;

  return (
    <>
      <p className="pt-4 font-mono text-xs text-muted">
        <Link href="/" className="text-info hover:underline">
          ← runs
        </Link>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold">{run.workflow}</h2>
        <StateBadge state={run.state} />
        <span className="font-mono text-xs text-muted">{run.id}</span>
        {!TERMINAL.includes(run.state) && (
          <Button
            onClick={async () => {
              await api.cancelRun(run.id);
              refresh();
            }}
          >
            cancel run
          </Button>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-[150px_1fr] gap-x-4 gap-y-1.5 font-mono text-xs">
        <Meta label="created">{new Date(run.created_at).toLocaleString()}</Meta>
        <Meta label="started">{formatTime(run.started_at)}</Meta>
        <Meta label="finished">{formatTime(run.finished_at)}</Meta>
        <Meta label="duration">{formatDuration(run.duration_seconds)}</Meta>
        <Meta label="idempotency key">{run.idempotency_key ?? "—"}</Meta>
        {run.error && (
          <Meta label="error">
            <span className="text-bad">{lastLine(run.error, 200)}</span>
          </Meta>
        )}
      </dl>

      <Panel title="Steps">
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Step</Th>
              <Th>State</Th>
              <Th>Attempts</Th>
              <Th className="hidden md:table-cell">Reclaimed</Th>
              <Th className="hidden md:table-cell">Effects</Th>
              <Th className="hidden lg:table-cell">Lease</Th>
              <Th>Last error</Th>
            </tr>
          </thead>
          <tbody>
            {run.steps.map((step) => (
              <tr key={step.id} className="hover:bg-panel-2">
                <Td className="font-mono text-xs text-muted">{step.seq}</Td>
                <Td className="font-mono text-xs">{step.name}</Td>
                <Td>
                  <StateBadge state={step.state} />
                </Td>
                <Td className="font-mono text-xs">
                  {step.attempt}/{step.max_attempts}
                </Td>
                <Td className="hidden font-mono text-xs text-muted md:table-cell">
                  {step.reclaimed}
                </Td>
                <Td className="hidden font-mono text-xs md:table-cell">
                  <span className="text-accent">{step.effects_performed}</span>
                  <span className="text-muted"> done / </span>
                  <span className="text-warn">{step.effects_replayed}</span>
                  <span className="text-muted"> cached</span>
                </Td>
                <Td className="hidden font-mono text-[11px] text-muted lg:table-cell">
                  {step.lease_owner ? (
                    <>
                      {shortId(step.lease_owner, 20)}
                      <br />
                      exp {formatTime(step.lease_expires_at)}
                    </>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="font-mono text-[11px] text-muted">
                  {step.error_type && (
                    <span className="text-dead">{step.error_type} </span>
                  )}
                  {lastLine(step.error, 60)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Input">
          <Code value={run.input} />
        </Panel>
        <Panel title="Accumulated context">
          <Code value={run.context} />
        </Panel>
      </div>

      <Panel title={`Outbox (${run.events.length})`}>
        {run.events.length === 0 ? (
          <Empty>No events emitted yet.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Topic</Th>
                <Th className="hidden sm:table-cell">Step</Th>
                <Th>Published</Th>
                <Th className="hidden sm:table-cell">Attempts</Th>
                <Th>Payload</Th>
              </tr>
            </thead>
            <tbody>
              {run.events.map((event) => (
                <tr key={event.id} className="hover:bg-panel-2">
                  <Td className="font-mono text-xs text-muted">{event.id}</Td>
                  <Td className="font-mono text-xs">{event.topic}</Td>
                  <Td className="hidden font-mono text-xs text-muted sm:table-cell">
                    {event.step_name}
                  </Td>
                  <Td className="font-mono text-xs">
                    {event.published_at ? (
                      <span className="text-accent">
                        {formatTime(event.published_at)}
                      </span>
                    ) : (
                      <span className="text-warn">pending</span>
                    )}
                  </Td>
                  <Td className="hidden font-mono text-xs text-muted sm:table-cell">
                    {event.publish_attempts}
                  </Td>
                  <Td className="max-w-md truncate font-mono text-[11px] text-muted">
                    {JSON.stringify(event.payload)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}

function Meta({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}
