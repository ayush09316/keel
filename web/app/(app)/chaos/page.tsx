"use client";

import { Activity } from "lucide-react";
import { useEffect, useState } from "react";

import { Lanes } from "@/components/chaos/lanes";
import { CounterRow, EventLog, GapChart, Invariant, StepStates, Transport, VerifyBlock } from "@/components/chaos/panels";
import { SPEEDS, deriveCounters, useReplay } from "@/components/chaos/replay";
import { ChaosSkeleton } from "@/components/runs/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { Cmd, EmptyState } from "@/components/ui/empty";
import { Tip } from "@/components/ui/tooltip";
import { loadRecording } from "@/lib/api";
import type { ChaosRecording } from "@/lib/chaos";
import { useHotkeys } from "@/lib/hotkeys";
import { formatDateTime, prefersReducedMotion } from "@/lib/utils";

function initialParams() {
  if (typeof window === "undefined") return { t: 0, play: true, speed: 2 };
  const p = new URLSearchParams(window.location.search);
  const speed = Number(p.get("speed"));
  return {
    t: Number(p.get("t")) || 0,
    play: p.get("play") !== "0" && !prefersReducedMotion(),
    speed: SPEEDS.includes(speed) ? speed : 2,
  };
}

export default function ChaosPage() {
  const [recording, setRecording] = useState<ChaosRecording | null>(null);
  const [failed, setFailed] = useState(false);
  const [params] = useState(initialParams);

  useEffect(() => {
    loadRecording().then(setRecording).catch(() => setFailed(true));
  }, []);

  const replay = useReplay(recording, { initialT: params.t, autoplay: params.play, speed: params.speed });
  const { t, seek } = replay;

  const jump = (dir: 1 | -1) => {
    if (!recording) return;
    const marks = recording.events.filter((e) => ["sigkill", "sigstop", "reclaim", "fenced"].includes(e.kind)).map((e) => e.t);
    const next = dir > 0 ? marks.find((m) => m > t + 0.05) : [...marks].reverse().find((m) => m < t - 0.05);
    if (next !== undefined) seek(next);
  };

  useHotkeys({
    space: replay.toggle,
    ArrowRight: (e) => (e.shiftKey ? jump(1) : seek(t + 1)),
    ArrowLeft: (e) => (e.shiftKey ? jump(-1) : seek(t - 1)),
    "0": () => seek(0),
    ...Object.fromEntries(SPEEDS.map((s, i) => [String(i + 1), () => replay.setSpeed(s)])),
  });

  if (failed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Chaos replay" />
        <EmptyState
          icon={Activity}
          title="No chaos recording yet"
          description={
            <>
              Run <Cmd>make chaos</Cmd> — it records every SIGKILL, SIGSTOP and a snapshot every half second to{" "}
              <Cmd>var/chaos/latest.json</Cmd>.
            </>
          }
        />
      </div>
    );
  }
  if (!recording) return <ChaosSkeleton />;

  const counters = deriveCounters(recording, t);
  const c = recording.config;
  const done = t >= recording.duration - 0.01;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Chaos replay"
        description={
          <>
            A real <code className="font-mono text-[12.5px] text-fg">manage.py chaos</code> run, replayed from its recording:{" "}
            {c.runs} order runs across {c.workers} workers while the harness sends{" "}
            <span className="text-bad">{recording.kills} SIGKILL</span> and <span className="text-ice">{recording.freezes} SIGSTOP</span>. Lease{" "}
            {c.lease}s, step latency {c.latency_ms}ms, {Math.round(c.failure_rate * 100)}% upstream failure rate.
          </>
        }
        actions={
          <Tip content={recording.source === "latest" ? "Read from var/chaos/latest.json via /api/chaos/latest/" : "The recording committed with the repo — run make chaos to replace it with your own."}>
            <span tabIndex={0} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2 font-mono text-[11px] text-fg-muted">
              <span className={recording.source === "latest" ? "size-1.5 rounded-full bg-good" : "size-1.5 rounded-full bg-fg-subtle"} />
              {recording.source === "latest" ? "latest run" : "committed sample"} · {formatDateTime(recording.recorded_at)}
            </span>
          </Tip>
        }
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Transport
          recording={recording}
          t={t}
          playing={replay.playing}
          speed={replay.speed}
          onToggle={replay.toggle}
          onSeek={seek}
          onSpeed={replay.setSpeed}
        />
        <Invariant value={Math.round(counters.charged_twice)} t={t} compact />
      </div>

      <CounterRow counters={counters} recording={recording} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <section aria-label="Worker lanes">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className="font-mono text-[10.5px] tracking-[0.12em] text-fg-subtle uppercase">Workers · the step each one holds</h2>
              <p className="hidden font-mono text-[10.5px] text-fg-subtle sm:block">
                <span className="text-bad">■</span> kill <span className="ml-2 text-ice">■</span> freeze / reclaim{" "}
                <span className="ml-2 text-fence">■</span> fenced
              </p>
            </div>
            <Lanes recording={recording} t={t} />
          </section>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <GapChart recording={recording} t={t} />
            <StepStates recording={recording} t={t} />
          </div>
        </div>
        <EventLog recording={recording} t={t} onSeek={seek} />
      </div>

      <VerifyBlock recording={recording} done={done} />
    </div>
  );
}
