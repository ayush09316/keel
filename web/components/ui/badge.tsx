import type { AttemptOutcome, RunState, StepState } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  completed: "text-good bg-good/10 ring-good/25",
  succeeded: "text-good bg-good/10 ring-good/25",
  running: "text-info bg-info/10 ring-info/25",
  ready: "text-warn bg-warn/10 ring-warn/25",
  retry: "text-warn bg-warn/10 ring-warn/25",
  pending: "text-fg-muted bg-muted ring-border",
  blocked: "text-fg-subtle bg-muted/60 ring-border",
  failed: "text-bad bg-bad/10 ring-bad/25",
  cancelled: "text-fg-muted bg-muted ring-border",
  dead: "text-dead bg-dead/10 ring-dead/25",
  lease_expired: "text-ice bg-ice/10 ring-ice/25",
  fenced: "text-fence bg-fence/10 ring-fence/25",
};

const DOT: Record<string, string> = {
  completed: "bg-good",
  succeeded: "bg-good",
  running: "bg-info",
  ready: "bg-warn",
  retry: "bg-warn",
  pending: "bg-fg-subtle",
  blocked: "bg-fg-subtle/60",
  failed: "bg-bad",
  cancelled: "bg-fg-subtle",
  dead: "bg-dead",
  lease_expired: "bg-ice",
  fenced: "bg-fence",
};

export const BAR_CLASS: Record<StepState, string> = {
  succeeded: "bg-good",
  running: "bg-info",
  ready: "bg-warn",
  dead: "bg-dead",
  cancelled: "bg-fg-subtle/50",
  blocked: "bg-muted",
};

const LABEL: Record<string, string> = { lease_expired: "lease expired" };

export function StateBadge({
  state,
  className,
}: {
  state: RunState | StepState | AttemptOutcome | string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 font-mono text-[11px] whitespace-nowrap ring-1 ring-inset",
        TONE[state] ?? "bg-muted text-fg-muted ring-border",
        className,
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", DOT[state] ?? "bg-fg-subtle", state === "running" && "motion-safe:animate-pulse")}
        aria-hidden
      />
      {LABEL[state] ?? state}
    </span>
  );
}

export function StepBar({
  steps,
  className,
}: {
  steps: { name: string; state: StepState; attempt: number; max_attempts: number }[];
  className?: string;
}) {
  return (
    <div className={cn("flex h-1.5 min-w-24 gap-0.5", className)} role="img" aria-label={steps.map((s) => `${s.name} ${s.state}`).join(", ")}>
      {steps.map((step) => (
        <span
          key={step.name}
          title={`${step.name}: ${step.state} (attempt ${step.attempt}/${step.max_attempts})`}
          className={cn("flex-1 rounded-[2px] transition-colors duration-500", BAR_CLASS[step.state] ?? "bg-muted")}
        />
      ))}
    </div>
  );
}

export function Legend({ states, className }: { states: StepState[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-1.5 font-mono text-[10.5px] text-fg-subtle", className)}>
      {states.map((state) => (
        <li key={state} className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-[2px]", BAR_CLASS[state])} aria-hidden />
          {state}
        </li>
      ))}
    </ul>
  );
}
