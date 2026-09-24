"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { api } from "@/lib/api";
import type { RunState, WorkflowRun } from "@/lib/types";
import { usePoll } from "@/lib/usePoll";
import {
  Button,
  Empty,
  StateBadge,
  StepBar,
  Table,
  Td,
  Th,
  formatDuration,
  formatTime,
  lastLine,
  shortId,
} from "@/components/ui";

const STATES: RunState[] = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
];

export default function RunsPage() {
  const [state, setState] = useState<RunState | "">("");
  const [starting, setStarting] = useState(false);

  const { data, refresh } = usePoll(
    () => api.runs({ state: state || undefined }),
    1500,
    [state],
  );
  const { data: workflows } = usePoll(() => api.workflows(), 30_000);

  const start = useCallback(
    async (workflow: string) => {
      setStarting(true);
      try {
        await api.startRun(workflow, {
          order_id: `web-${Date.now().toString(36)}`,
          sku: "TILE-001",
          quantity: 4,
          amount_paise: 250_000,
          channel: "whatsapp",
        });
        refresh();
      } finally {
        setStarting(false);
      }
    },
    [refresh],
  );

  const runs: WorkflowRun[] = data?.results ?? [];

  return (
    <>
      <div className="mb-3.5 flex flex-wrap gap-2 pt-4">
        <FilterPill active={!state} onClick={() => setState("")}>
          all
        </FilterPill>
        {STATES.map((s) => (
          <FilterPill key={s} active={state === s} onClick={() => setState(s)}>
            {s}
          </FilterPill>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(workflows ?? []).map((flow) => (
          <Button
            key={flow.name}
            variant="primary"
            disabled={starting}
            onClick={() => void start(flow.name)}
          >
            start {flow.name}
          </Button>
        ))}
      </div>

      {runs.length === 0 ? (
        <Empty>
          No runs yet. Start one above, or{" "}
          <span className="font-mono text-fg">
            ./venv/bin/python manage.py seed_demo --count 20
          </span>
        </Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Run</Th>
              <Th>Workflow</Th>
              <Th>State</Th>
              <Th>Progress</Th>
              <Th className="hidden sm:table-cell">Started</Th>
              <Th className="hidden sm:table-cell">Duration</Th>
              <Th>Error</Th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="transition-colors hover:bg-panel-2">
                <Td className="font-mono text-xs">
                  <Link href={`/runs/${run.id}`} className="text-info hover:underline">
                    {shortId(run.id)}
                  </Link>
                </Td>
                <Td className="text-[13px]">{run.workflow}</Td>
                <Td>
                  <StateBadge state={run.state} />
                </Td>
                <Td className="w-32">
                  <StepBar steps={run.steps} />
                </Td>
                <Td className="hidden font-mono text-xs text-muted sm:table-cell">
                  {formatTime(run.started_at)}
                </Td>
                <Td className="hidden font-mono text-xs text-muted sm:table-cell">
                  {formatDuration(run.duration_seconds)}
                </Td>
                <Td className="font-mono text-xs text-muted">
                  {lastLine(run.error, 50)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active ? "border-accent text-fg" : "border-line text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
