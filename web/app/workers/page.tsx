"use client";

import { api } from "@/lib/api";
import { usePoll } from "@/lib/usePoll";
import { Empty, Panel, StateBadge, Table, Td, Th, formatTime } from "@/components/ui";
import type { StepState } from "@/lib/types";

const STALE_AFTER_MS = 60_000;

const STEP_STATES: StepState[] = [
  "blocked",
  "ready",
  "running",
  "succeeded",
  "dead",
  "cancelled",
];

export default function WorkersPage() {
  const { data } = usePoll(() => api.workers(), 1500);
  const { data: stats } = usePoll(() => api.stats(), 1500);

  const workers = data?.results ?? [];
  const now = Date.now();

  return (
    <>
      <div className="pt-4" />
      {workers.length === 0 ? (
        <Empty>
          No workers have registered. Run{" "}
          <span className="font-mono text-fg">
            ./venv/bin/python manage.py runworker
          </span>
        </Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Worker</Th>
              <Th className="hidden md:table-cell">Host</Th>
              <Th className="hidden sm:table-cell">PID</Th>
              <Th>Last seen</Th>
              <Th>Current step</Th>
              <Th>Claimed</Th>
              <Th>Succeeded</Th>
              <Th>Failed</Th>
            </tr>
          </thead>
          <tbody>
            {workers.map((worker) => {
              const stale =
                now - new Date(worker.last_seen_at).getTime() > STALE_AFTER_MS;
              return (
                <tr key={worker.id} className="hover:bg-panel-2">
                  <Td className="font-mono text-xs">{worker.id}</Td>
                  <Td className="hidden font-mono text-xs text-muted md:table-cell">
                    {worker.hostname}
                  </Td>
                  <Td className="hidden font-mono text-xs text-muted sm:table-cell">
                    {worker.pid}
                  </Td>
                  <Td className="font-mono text-xs">
                    <span className={stale ? "text-bad" : "text-accent"}>
                      {formatTime(worker.last_seen_at)}
                      {stale && " (stale)"}
                    </span>
                  </Td>
                  <Td className="font-mono text-xs">
                    {worker.current_step || "—"}
                  </Td>
                  <Td className="font-mono text-xs">{worker.claimed}</Td>
                  <Td className="font-mono text-xs text-accent">
                    {worker.succeeded}
                  </Td>
                  <Td className="font-mono text-xs text-bad">{worker.failed}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <p className="mt-4 max-w-2xl font-mono text-[11px] leading-relaxed text-muted">
        A killed worker never deregisters. Its row going stale while its steps
        return to <span className="text-warn">ready</span> is what a crash looks
        like from the outside — nothing else in the system has to be told.
      </p>

      <Panel title="Step states">
        <Table>
          <tbody>
            {STEP_STATES.map((state) => (
              <tr key={state} className="hover:bg-panel-2">
                <Td className="w-40">
                  <StateBadge state={state} />
                </Td>
                <Td className="font-mono text-xs">{stats?.steps[state] ?? 0}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </>
  );
}
