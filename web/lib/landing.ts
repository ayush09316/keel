import "server-only";

import sample from "@/public/chaos/sample.json";
import { API_BASE } from "./api";
import { type ChaosRecording, README_SUMMARY } from "./chaos";

export type LandingChaos = {
  source: "latest" | "sample" | "readme";
  runs: number;
  workers: number;
  kills: number;
  freezes: number;
  recordedAt: string | null;
  attempts: number;
  ranTwice: number;
  reclaims: number;
  fenced: number | null;
  effectsReplayed: number;
  gatewayCalls: number;
  charges: number;
  chargedTwice: number;
  steps: number;
  passed: boolean;
};

function shape(rec: ChaosRecording, source: LandingChaos["source"]): LandingChaos {
  const last = rec.samples[rec.samples.length - 1]?.counters;
  return {
    source,
    runs: rec.config.runs,
    workers: rec.config.workers,
    kills: rec.kills,
    freezes: rec.freezes,
    recordedAt: rec.recorded_at,
    attempts: rec.summary.attempts,
    ranTwice: rec.summary.ran_twice,
    reclaims: rec.summary.reclaims,
    fenced: last?.fenced ?? null,
    effectsReplayed: rec.summary.effects_replayed,
    gatewayCalls: rec.summary.gateway_calls,
    charges: rec.summary.charges,
    chargedTwice: rec.summary.charged_twice,
    steps: rec.summary.steps,
    passed: rec.passed,
  };
}

export async function landingChaos(): Promise<LandingChaos> {
  try {
    const response = await fetch(`${API_BASE}/chaos/latest/`, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(1500),
    });
    if (response.ok) {
      const rec = (await response.json()) as ChaosRecording;
      return shape(rec, rec.source === "latest" ? "latest" : "sample");
    }
  } catch {}
  try {
    return shape(sample as unknown as ChaosRecording, "sample");
  } catch {
    const r = README_SUMMARY;
    return {
      source: "readme",
      runs: r.runs,
      workers: r.workers,
      kills: r.kills,
      freezes: r.freezes,
      recordedAt: null,
      attempts: r.attempts,
      ranTwice: r.ran_twice,
      reclaims: r.reclaims,
      fenced: null,
      effectsReplayed: r.effects_replayed,
      gatewayCalls: r.gateway_calls,
      charges: r.charges,
      chargedTwice: r.charged_twice,
      steps: r.steps,
      passed: true,
    };
  }
}
