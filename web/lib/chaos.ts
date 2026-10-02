export type LaneStatus = "alive" | "frozen" | "stopped";

export interface HeldStep {
  run: string;
  step: string;
  attempt: number;
  order: string | null;
  lease_in: number | null;
}

export interface ChaosLane {
  slot: number;
  pid: number;
  worker: string;
  status: LaneStatus;
  step: HeldStep | null;
  orphans: HeldStep[];
}

export interface ChaosCounters {
  attempts: number;
  reclaims: number;
  effects_performed: number;
  effects_replayed: number;
  ran_twice: number;
  reclaimed_steps: number;
  fenced: number;
  gateway_calls: number;
  gateway_deduped: number;
  gateway_failed: number;
  charges: number;
  charged_twice: number;
  outbox_pending: number;
  outbox_published: number;
  dead_letters: number;
}

export interface ChaosSample {
  t: number;
  lanes: ChaosLane[];
  steps: Record<string, number>;
  runs: Record<string, number>;
  counters: ChaosCounters;
}

export type ChaosEventKind =
  | "spawn"
  | "respawn"
  | "sigkill"
  | "sigstop"
  | "sigcont"
  | "reclaim"
  | "fenced"
  | "drain"
  | "stop";

export interface ChaosEvent {
  t: number;
  kind: ChaosEventKind;
  slot?: number | null;
  pid?: number;
  worker?: string;
  held?: HeldStep | null;
  in_flight?: number;
  freeze_for?: number;
  step?: string;
  run?: string;
  attempt?: number;
  buried?: boolean;
  effects?: number;
}

export interface ChaosSummary {
  steps: number;
  attempts: number;
  ran_twice: number;
  reclaimed_steps: number;
  reclaims: number;
  effects_performed: number;
  effects_replayed: number;
  gateway_calls: number;
  charges: number;
  charged_twice: number;
  runs_completed: number;
  runs_failed: number;
  runs_cancelled: number;
  outbox_pending: number;
  outbox_published: number;
}

export interface ChaosRecording {
  version: number;
  recorded_at: string;
  duration: number;
  config: {
    runs: number;
    workers: number;
    kill_every: number;
    freeze_every: number;
    freeze_for: number;
    duration: number;
    lease: number;
    failure_rate: number;
    latency_ms: number;
  };
  kills: number;
  freezes: number;
  events: ChaosEvent[];
  samples: ChaosSample[];
  summary: ChaosSummary;
  failures: string[];
  passed: boolean;
  source?: "latest" | "sample";
}

export const README_SUMMARY: ChaosSummary & { runs: number; workers: number; kills: number; freezes: number } = {
  runs: 60,
  workers: 4,
  kills: 9,
  freezes: 7,
  steps: 240,
  attempts: 300,
  ran_twice: 52,
  reclaimed_steps: 14,
  reclaims: 14,
  effects_performed: 237,
  effects_replayed: 3,
  gateway_calls: 68,
  charges: 60,
  charged_twice: 0,
  runs_completed: 60,
  runs_failed: 0,
  runs_cancelled: 0,
  outbox_pending: 0,
  outbox_published: 240,
};

export function sampleAt(samples: ChaosSample[], t: number) {
  let lo = 0;
  let hi = samples.length - 1;
  if (hi < 0) return -1;
  if (t < samples[0].t) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function interpolate(samples: ChaosSample[], t: number): ChaosCounters {
  const i = sampleAt(samples, t);
  const a = samples[i];
  const b = samples[i + 1];
  if (!b || t <= a.t) return a.counters;
  const p = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
  const out = { ...a.counters };
  for (const key of Object.keys(out) as (keyof ChaosCounters)[]) {
    out[key] = a.counters[key] + (b.counters[key] - a.counters[key]) * p;
  }
  return out;
}
