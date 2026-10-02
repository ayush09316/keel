"use client";

import { useEffect, useRef, useState } from "react";

import { type ChaosEvent, type ChaosLane, type ChaosRecording, type HeldStep, interpolate, sampleAt } from "@/lib/chaos";

export const SPEEDS = [0.5, 1, 2, 4, 8];

export function useReplay(
  recording: ChaosRecording | null,
  { initialT = 0, autoplay = true, loop = false, speed: initialSpeed = 2, window: range }: {
    initialT?: number;
    autoplay?: boolean;
    loop?: boolean;
    speed?: number;
    window?: [number, number];
  } = {},
) {
  const [t, setT] = useState(initialT);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(initialSpeed);
  const tRef = useRef(initialT);
  const started = useRef(false);

  const duration = recording?.duration ?? 0;
  const lo = range?.[0] ?? 0;
  const hi = Math.min(range?.[1] ?? duration, duration);

  useEffect(() => {
    if (!recording || started.current) return;
    started.current = true;
    tRef.current = Math.min(Math.max(initialT, lo), hi);
    setT(tRef.current);
    if (autoplay) setPlaying(true);
  }, [recording, initialT, autoplay, lo, hi]);

  useEffect(() => {
    if (!playing || !recording) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let next = tRef.current + dt * speed;
      if (next >= hi) {
        if (loop) next = lo;
        else {
          next = hi;
          tRef.current = next;
          setT(next);
          setPlaying(false);
          return;
        }
      }
      tRef.current = next;
      setT(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, recording, loop, lo, hi]);

  const seek = (value: number) => {
    const next = Math.min(Math.max(value, lo), hi);
    tRef.current = next;
    setT(next);
  };

  return {
    t,
    playing,
    speed,
    duration,
    setSpeed,
    seek,
    play: () => {
      if (tRef.current >= hi) seek(lo);
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    toggle: () => {
      if (playing) setPlaying(false);
      else {
        if (tRef.current >= hi) seek(lo);
        setPlaying(true);
      }
    },
  };
}

export type LaneView = ChaosLane & {
  frozen: boolean;
  killedAt: number | null;
  killIndex: number;
  killedPid: number | null;
  killedHeld: HeldStep | null;
  frozenSince: number | null;
  fenced: ChaosEvent | null;
  reclaimed: ChaosEvent | null;
  leaseLeft: number | null;
};

const RECENT = 2.6;

export function deriveLanes(recording: ChaosRecording, t: number): LaneView[] {
  const sample = recording.samples[sampleAt(recording.samples, t)];
  const drift = Math.max(0, t - sample.t);
  const past = recording.events.filter((e) => e.t <= t);

  return sample.lanes.map((lane) => {
    const mine = past.filter((e) => e.slot === lane.slot);
    let frozenSince: number | null = null;
    let killedAt: number | null = null;
    let killIndex = -1;
    let killedPid: number | null = null;
    let killedHeld: HeldStep | null = null;
    let pid = lane.pid;
    let fenced: ChaosEvent | null = null;
    let reclaimed: ChaosEvent | null = null;
    mine.forEach((e, i) => {
      if (e.kind === "sigstop") frozenSince = e.t;
      if (e.kind === "sigcont") frozenSince = null;
      if (e.kind === "sigkill") {
        frozenSince = null;
        killedAt = e.t;
        killIndex = i;
        killedPid = e.pid ?? null;
        killedHeld = e.held ?? null;
      }
      if (e.kind === "respawn" || e.kind === "spawn") pid = e.pid ?? pid;
      if (e.kind === "fenced") fenced = e;
      if (e.kind === "reclaim") reclaimed = e;
    });
    const recentFence = fenced && t - (fenced as ChaosEvent).t < RECENT ? fenced : null;
    const recentReclaim = reclaimed && t - (reclaimed as ChaosEvent).t < RECENT ? reclaimed : null;
    const frozen = frozenSince !== null && lane.status !== "stopped";
    const leaseLeft = lane.step?.lease_in != null ? lane.step.lease_in - drift : null;
    return {
      ...lane,
      pid,
      frozen,
      frozenSince,
      killedAt: killedAt !== null && t - killedAt < RECENT ? killedAt : null,
      killIndex,
      killedPid,
      killedHeld,
      fenced: recentFence,
      reclaimed: recentReclaim,
      leaseLeft,
      orphans: lane.orphans.map((o) => ({ ...o, lease_in: o.lease_in != null ? o.lease_in - drift : null })),
    };
  });
}

export function deriveCounters(recording: ChaosRecording, t: number) {
  return interpolate(recording.samples, t);
}

export function currentSample(recording: ChaosRecording, t: number) {
  return recording.samples[sampleAt(recording.samples, t)];
}

export function laneLabel(slot: number | null | undefined) {
  return slot === null || slot === undefined ? "w?" : `w${slot}`;
}
