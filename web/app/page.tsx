import { ArrowRight, Ban, Boxes, GitBranch, Layers, Radio, ShieldCheck, Workflow } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DlqDiagram, FenceDiagram, LeaseDiagram, OnceDiagram, OutboxDiagram, RetryDiagram } from "@/components/landing/diagrams";
import { HeroReplay } from "@/components/landing/hero-replay";
import { CountUp, LandingFX } from "@/components/landing/motion";
import { LandingNav } from "@/components/landing/nav";
import { Walkthrough } from "@/components/landing/walkthrough";
import { BrandLink } from "@/components/shell/brand";
import { GITHUB_URL } from "@/lib/api";
import { landingChaos } from "@/lib/landing";
import { cn } from "@/lib/utils";

export const revalidate = 30;

export const metadata: Metadata = {
  title: { absolute: "Keel — delivery is at least once, effects are exactly once" },
};

const SECTION = "relative scroll-mt-16 px-4 py-24 sm:px-6 sm:py-32";

const MECHANISMS = [
  {
    failure: "Worker dies mid-step",
    name: "Leases",
    body: "Every claimed step carries an expiry, renewed by a heartbeat thread. Stop renewing and the reaper hands the step to someone else — and keeps the attempt it cost.",
    Diagram: LeaseDiagram,
  },
  {
    failure: "Worker stalls past its lease",
    name: "Fencing tokens",
    body: "The attempt number is the token. A GC-paused worker that wakes up and commits matches zero rows, so its state, context and outbox writes all roll back.",
    Diagram: FenceDiagram,
  },
  {
    failure: "Upstream is flaky",
    name: "Retries with backoff",
    body: "Exponential backoff with jitter, a per-step attempt budget, and a NonRetryableError for failures that no number of retries will fix.",
    Diagram: RetryDiagram,
  },
  {
    failure: "A retry would repeat the side effect",
    name: "Idempotency keys",
    body: "ctx.once derives {run}:{step}:{suffix} — identical on every attempt and every worker — and passes it to the gateway, which dedupes on it the way Stripe and Razorpay do.",
    Diagram: OnceDiagram,
  },
  {
    failure: "Step commits, event never publishes",
    name: "Transactional outbox",
    body: "Events are inserted in the same transaction as the step's state change. Either both land or neither does; a relay publishes them afterwards, at least once.",
    Diagram: OutboxDiagram,
  },
  {
    failure: "The failure is permanent",
    name: "Dead letters + replay",
    body: "Exhausted or non-retryable steps are buried with their error. Replay re-arms exactly that step; everything before it keeps its durable output.",
    Diagram: DlqDiagram,
  },
];

const NOT_HERE = [
  { title: "No distributed transactions", body: "The effect and its idempotency record commit separately. The window is closed by the upstream honouring the key, not by two-phase commit." },
  { title: "No DAGs", body: "Steps are a linear sequence. Parallel branches need a join protocol and a different advance(); a real extension, not a small one." },
  { title: "No cross-run ordering", body: "Two runs are independent. Per-entity ordering needs a partition key and a claim that respects it." },
  { title: "Poll-based, not LISTEN/NOTIFY", body: "Polling with backoff was enough and has one fewer moving part. NOTIFY would cut idle latency." },
  { title: "No auth on the API", body: "It is a local demo surface. Public deploys run with KEEL_READONLY=1, which turns every mutation into a 403." },
];

export default async function Landing() {
  const chaos = await landingChaos();
  const funnel = [
    { label: "step attempts", value: chaos.attempts, tone: "text-fg" },
    { label: "gateway calls", value: chaos.gatewayCalls, tone: "text-fg" },
    { label: "charges", value: chaos.charges, tone: "text-fg" },
    { label: "charged twice", value: chaos.chargedTwice, tone: chaos.chargedTwice ? "text-bad" : "text-good" },
  ];

  return (
    <div className="k-landing relative min-h-dvh overflow-x-clip">
      <LandingFX />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-pop">
        Skip to content
      </a>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[1100px]">
        <div className="k-grid k-grid-fade absolute inset-0" />
        <div className="k-glow absolute top-[-180px] left-1/2 h-[720px] w-[1100px] -translate-x-1/2 opacity-90" />
        <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-b from-transparent to-bg" />
      </div>

      <LandingNav />

      <main id="main" className="relative">
        <section aria-labelledby="hero" className="relative px-4 pt-14 pb-20 sm:px-6 sm:pt-20 sm:pb-28">
          <div className="mx-auto max-w-[1160px] text-center">
            <p className="k-rise inline-flex h-8 items-center gap-2 rounded-full border border-border bg-surface/70 px-3.5 font-mono text-[11.5px] text-fg-muted backdrop-blur">
              <span className="relative flex size-1.5">
                <span className="absolute inset-0 rounded-full bg-good motion-safe:animate-ping motion-safe:opacity-60" />
                <span className="relative size-1.5 rounded-full bg-good" />
              </span>
              durable workflows on one Postgres<span className="hidden sm:inline"> · no broker</span>
            </p>
            <h1 id="hero" className="k-rise mx-auto mt-7 max-w-[17ch] text-[2.45rem] leading-[1.02] font-semibold tracking-[-0.045em] text-balance [animation-delay:70ms] min-[400px]:text-[2.7rem] sm:text-[4.1rem] lg:text-[4.9rem]">
              Delivery is at least once.
              <br />
              <span className="text-fg-subtle">Effects are </span>
              <span className="relative whitespace-nowrap text-accent">
                exactly once.
                <svg aria-hidden viewBox="0 0 300 12" preserveAspectRatio="none" className="absolute -bottom-1 left-0 h-2.5 w-full sm:-bottom-2">
                  <path d="M2 8 C 80 2, 220 2, 298 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
                </svg>
              </span>
            </h1>
            <p className="k-rise mx-auto mt-7 max-w-[40rem] text-[16px] leading-relaxed text-pretty text-fg-muted [animation-delay:140ms] sm:text-[17.5px]">
              Keel is a workflow engine for steps that touch money. Workers crash, stall and retry — the queue redelivers, by design. Leases,
              fencing tokens, idempotency keys and a transactional outbox make sure the customer is still charged once.
            </p>
            <div className="k-rise mt-9 flex flex-col items-stretch justify-center gap-3 [animation-delay:210ms] min-[420px]:flex-row min-[420px]:items-center">
              <Link href="/chaos" className="k-btn inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium">
                Watch the chaos replay
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href="/runs" className="k-btn-2 inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium">
                Open the dashboard
              </Link>
              <a href={GITHUB_URL} className="inline-flex h-12 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-medium text-fg-muted hover:text-fg">
                <GitBranch className="size-4" aria-hidden />
                Source
              </a>
            </div>

            <div className="k-rise mx-auto mt-14 max-w-[820px] [animation-delay:280ms]">
              <p className="k-eyebrow">
                {chaos.source === "latest" ? "latest" : "recorded"} chaos run · {chaos.runs} runs · {chaos.workers} workers ·{" "}
                <span className="text-bad">{chaos.kills} SIGKILL</span> · <span className="text-ice">{chaos.freezes} SIGSTOP</span>
              </p>
              <ol className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-3 font-mono text-[13px]">
                {funnel.map((s, i) => (
                  <li key={s.label} className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex items-baseline gap-1.5 rounded-full border bg-surface/70 px-3.5 py-1.5 backdrop-blur",
                        i === funnel.length - 1 ? "border-good/40 bg-good/10" : "border-border",
                      )}
                    >
                      <CountUp value={s.value} delay={350 + i * 150} className={cn("text-[15px] font-semibold tnum", s.tone)} />
                      <span className="font-sans text-[12px] text-fg-subtle">{s.label}</span>
                    </span>
                    {i < funnel.length - 1 && <ArrowRight className="size-3 text-fg-subtle" aria-hidden />}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="k-rise mx-auto mt-14 w-full max-w-[1040px] [animation-delay:360ms] sm:mt-16">
            <HeroReplay />
          </div>
        </section>

        <section id="mechanisms" aria-labelledby="mechanisms-h" className={SECTION}>
          <div className="mx-auto max-w-3xl text-center" data-reveal>
            <p className="k-eyebrow">Failure → mechanism</p>
            <h2 id="mechanisms-h" className="mt-4 text-[2rem] leading-[1.05] font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
              Six ways a step goes wrong. Six mechanisms that compose.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-[15.5px] leading-relaxed text-pretty text-fg-muted sm:text-[17px]">
              None of them is clever on its own. The guarantee comes from all six sharing one database, so a state change and its message
              commit or vanish together.
            </p>
          </div>
          <ul className="mx-auto mt-16 grid max-w-[1160px] gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
            {MECHANISMS.map((m, i) => (
              <li
                key={m.name}
                data-reveal
                style={{ "--d": `${(i % 3) * 80}ms` } as React.CSSProperties}
                className="ap-lift group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface/80 backdrop-blur-sm hover:border-border-strong"
              >
                <div className="relative flex min-h-[156px] items-center justify-center overflow-hidden border-b border-border px-5 py-6">
                  <div aria-hidden className="k-grid absolute inset-0 [mask-image:radial-gradient(ellipse_70%_70%_at_50%_50%,#000,transparent)]" />
                  <div className="relative flex w-full justify-center">
                    <m.Diagram />
                  </div>
                </div>
                <div className="px-5 pt-4 pb-5">
                  <p className="flex items-center gap-2 font-mono text-[11px] text-bad">
                    <span className="text-fg-subtle">0{i + 1}</span>
                    <span className="h-px w-3 bg-border-strong" aria-hidden />
                    {m.failure}
                  </p>
                  <h3 className="mt-2 text-[16px] font-semibold tracking-tight">{m.name}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-muted">{m.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section id="commit" aria-labelledby="commit-h" className={cn(SECTION, "border-y border-border bg-surface-2/40")}>
          <div className="mx-auto max-w-[1160px]">
            <div className="max-w-2xl" data-reveal>
              <p className="k-eyebrow">How a step commits</p>
              <h2 id="commit-h" className="mt-4 text-[2rem] leading-[1.05] font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
                Five moves, from a ready row to a published event.
              </h2>
              <p className="mt-5 text-[15.5px] leading-relaxed text-fg-muted sm:text-[17px]">
                The real code, trimmed. Every arrow between these steps is a place a process can die — and each one has an answer.
              </p>
            </div>
            <div className="mt-14" data-reveal>
              <Walkthrough />
            </div>
          </div>
        </section>

        <section id="proof" aria-labelledby="proof-h" className={SECTION}>
          <div className="mx-auto grid max-w-[1160px] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
            <div data-reveal>
              <p className="k-eyebrow">The proof</p>
              <h2 id="proof-h" className="mt-4 text-[2rem] leading-[1.05] font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
                Numbers the harness produced, not ones I typed.
              </h2>
              <p className="mt-5 text-[15.5px] leading-relaxed text-fg-muted sm:text-[17px]">
                The harness queues {chaos.runs} orders, then SIGKILLs and SIGSTOPs workers while work is in flight — freezing them longer
                than their lease so the fencing path actually runs. Then <code className="font-mono text-[0.9em] text-fg">verify</code> fails the
                process if any invariant broke. The whole run is recorded and replayable.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/chaos" className="k-btn inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-medium">
                  Replay it
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                <span className="inline-flex h-11 items-center rounded-full border border-border px-4 font-mono text-[12.5px] text-fg-muted">$ make chaos</span>
              </div>
            </div>
            <div className="k-frame overflow-hidden rounded-2xl" data-reveal>
              <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                <span className="flex gap-1.5" aria-hidden>
                  <span className="size-2.5 rounded-full bg-bad/60" />
                  <span className="size-2.5 rounded-full bg-warn/60" />
                  <span className="size-2.5 rounded-full bg-good/60" />
                </span>
                <span className="ml-2 font-mono text-[11px] text-fg-subtle">
                  {chaos.runs} runs · {chaos.workers} workers · {chaos.kills} SIGKILL · {chaos.freezes} SIGSTOP
                </span>
              </div>
              <div className="space-y-4 p-5 font-mono text-[12.5px] leading-[1.8]">
                <Block title="delivery (at least once, by design)">
                  <Row k="steps" v={chaos.steps} />
                  <Row k="step attempts" v={chaos.attempts} />
                  <Row k="steps that ran more than once" v={chaos.ranTwice} />
                  <Row k="leases reclaimed from dead workers" v={chaos.reclaims} />
                  {chaos.fenced !== null && <Row k="stale commits fenced" v={chaos.fenced} />}
                </Block>
                <Block title="effects (exactly once, by construction)">
                  <Row k="external effects served from cache" v={chaos.effectsReplayed} />
                  <Row k="physical gateway calls" v={chaos.gatewayCalls} />
                  <Row k="charges created" v={chaos.charges} />
                  <Row k="orders charged twice" v={chaos.chargedTwice} tone={chaos.chargedTwice ? "text-bad" : "text-good"} note="← the invariant" />
                </Block>
                <p className={chaos.passed ? "text-good" : "text-bad"}>{chaos.passed ? "PASS every invariant held" : "FAIL"}</p>
              </div>
            </div>
          </div>
        </section>

        <section id="not-here" aria-labelledby="not-here-h" className={cn(SECTION, "pt-8 sm:pt-12")}>
          <div className="mx-auto max-w-[1160px]">
            <div className="max-w-2xl" data-reveal>
              <p className="k-eyebrow">Deliberately not here</p>
              <h2 id="not-here-h" className="mt-4 text-[2rem] leading-[1.05] font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
                What Keel leaves out, and why.
              </h2>
            </div>
            <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
              {NOT_HERE.map((n, i) => {
                const Icon = [Layers, Workflow, Boxes, Radio, ShieldCheck][i];
                return (
                  <li key={n.title} className="bg-surface p-5" data-reveal style={{ "--d": `${i * 60}ms` } as React.CSSProperties}>
                    <span className="flex size-8 items-center justify-center rounded-lg border border-border bg-surface-2 text-fg-muted">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <h3 className="mt-4 flex items-center gap-1.5 text-[14px] font-semibold tracking-tight">
                      <Ban className="size-3.5 text-fg-subtle" aria-hidden />
                      {n.title}
                    </h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{n.body}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section aria-labelledby="cta" className="px-4 pt-4 pb-24 sm:px-6 sm:pb-32">
          <div className="relative mx-auto max-w-[1160px] overflow-hidden rounded-[28px] border border-border px-6 py-20 text-center sm:py-24" data-reveal>
            <div aria-hidden className="k-grid absolute inset-0 [mask-image:radial-gradient(ellipse_60%_70%_at_50%_50%,#000,transparent)]" />
            <div aria-hidden className="k-glow absolute top-1/2 left-1/2 size-[640px] -translate-x-1/2 -translate-y-1/2" />
            <div className="relative">
              <h2 id="cta" className="mx-auto max-w-[20ch] text-[2.1rem] leading-[1.02] font-semibold tracking-[-0.045em] text-balance sm:text-6xl">
                Kill a worker. <span className="text-accent">Nobody gets charged twice.</span>
              </h2>
              <p className="mx-auto mt-5 max-w-md text-[16px] text-fg-muted">Run it locally in four terminals, or watch the recorded run first.</p>
              <div className="mt-9 flex flex-col items-stretch justify-center gap-3 min-[420px]:flex-row min-[420px]:items-center">
                <Link href="/chaos" className="k-btn inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium">
                  Watch the chaos replay
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                <a href={GITHUB_URL} className="k-btn-2 inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium">
                  <GitBranch className="size-4" aria-hidden />
                  Read the source
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-border px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-[1160px] flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <BrandLink />
            <p className="mt-1 font-mono text-[11.5px] text-fg-subtle">Django 5.1 · DRF · Postgres · Next.js 15</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-1 text-[13.5px] text-fg-muted">
            {[
              ["/overview", "Overview"],
              ["/runs", "Runs"],
              ["/chaos", "Chaos replay"],
              ["/workers", "Workers"],
            ].map(([h, l]) => (
              <Link key={h} href={h} className="inline-flex min-h-10 items-center rounded-md px-2.5 hover:text-fg">
                {l}
              </Link>
            ))}
            <a href={GITHUB_URL} className="inline-flex min-h-10 items-center rounded-md px-2.5 hover:text-fg">
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-info">{title}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Row({ k, v, tone, note }: { k: string; v: number; tone?: string; note?: string }) {
  return (
    <p className="flex items-baseline gap-3">
      <span className="min-w-0 flex-1 text-fg-muted">{k}</span>
      <span className={cn("w-10 shrink-0 text-right tnum", tone ?? "text-fg")}>{v}</span>
      {note && <span className="hidden w-28 shrink-0 text-good sm:inline">{note}</span>}
    </p>
  );
}
