"use client";

import Link from "next/link";
import { useState } from "react";

import { api } from "@/lib/api";
import { usePoll } from "@/lib/usePoll";
import {
  Button,
  Empty,
  Table,
  Td,
  Th,
  formatTime,
  lastLine,
  shortId,
} from "@/components/ui";

export default function DeadLettersPage() {
  const [openOnly, setOpenOnly] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const { data, refresh } = usePoll(
    () => api.deadLetters(openOnly),
    2000,
    [openOnly],
  );

  const rows = data?.results ?? [];

  return (
    <>
      <div className="mb-4 flex gap-2 pt-4">
        <Toggle active={openOnly} onClick={() => setOpenOnly(true)}>
          open
        </Toggle>
        <Toggle active={!openOnly} onClick={() => setOpenOnly(false)}>
          including replayed
        </Toggle>
      </div>

      {rows.length === 0 ? (
        <Empty>
          Dead-letter queue is empty. Bury one with{" "}
          <span className="font-mono text-fg">
            KEEL_DEMO_FAILURE_RATE=1 manage.py runworker
          </span>
        </Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Run</Th>
              <Th>Workflow</Th>
              <Th>Step</Th>
              <Th>Attempts</Th>
              <Th>Error</Th>
              <Th className="hidden sm:table-cell">Buried</Th>
              <Th>Replay</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((dead) => (
              <tr key={dead.id} className="hover:bg-panel-2">
                <Td className="font-mono text-xs">
                  <Link
                    href={`/runs/${dead.run}`}
                    className="text-info hover:underline"
                  >
                    {shortId(dead.run)}
                  </Link>
                </Td>
                <Td className="text-[13px]">{dead.workflow}</Td>
                <Td className="font-mono text-xs">{dead.step_name}</Td>
                <Td className="font-mono text-xs">{dead.attempts}</Td>
                <Td className="max-w-lg font-mono text-[11px] text-muted">
                  <span className="text-dead">{dead.error_type}</span>{" "}
                  {lastLine(dead.error, 90)}
                </Td>
                <Td className="hidden font-mono text-xs text-muted sm:table-cell">
                  {formatTime(dead.created_at)}
                </Td>
                <Td>
                  {dead.replayed_at ? (
                    <span className="font-mono text-xs text-muted">
                      replayed ×{dead.replay_count}
                    </span>
                  ) : (
                    <Button
                      variant="primary"
                      disabled={busy === dead.id}
                      onClick={async () => {
                        setBusy(dead.id);
                        try {
                          await api.replay(dead.id);
                          refresh();
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      replay
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <p className="mt-4 max-w-2xl font-mono text-[11px] leading-relaxed text-muted">
        Replay re-arms the buried step with a fresh attempt budget and resumes
        the run from exactly that point — the steps that already succeeded keep
        their output, and the effects they performed are not repeated.
      </p>
    </>
  );
}

function Toggle({
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
