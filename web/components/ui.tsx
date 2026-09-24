import type { RunState, StepState } from "@/lib/types";

const STATE_CLASS: Record<string, string> = {
  completed: "text-accent border-[#1e4d38] bg-[#10241b]",
  succeeded: "text-accent border-[#1e4d38] bg-[#10241b]",
  running: "text-info border-[#26375e] bg-[#141b2b]",
  ready: "text-warn border-[#4d3f18] bg-[#211b0f]",
  pending: "text-muted border-line",
  blocked: "text-muted border-line",
  failed: "text-bad border-[#4d2222] bg-[#221212]",
  cancelled: "text-bad border-[#4d2222] bg-[#221212]",
  dead: "text-dead border-[#4d2240] bg-[#22121d]",
};

export const BAR_CLASS: Record<StepState, string> = {
  succeeded: "bg-accent",
  running: "bg-info",
  ready: "bg-warn",
  dead: "bg-dead",
  cancelled: "bg-bad",
  blocked: "bg-[#2a3546]",
};

export function StateBadge({ state }: { state: RunState | StepState | string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 font-mono text-[11px] ${
        STATE_CLASS[state] ?? "border-line text-muted"
      }`}
    >
      {state}
    </span>
  );
}

export function StepBar({
  steps,
}: {
  steps: { name: string; state: StepState; attempt: number; max_attempts: number }[];
}) {
  return (
    <div className="flex h-1.5 min-w-28 overflow-hidden rounded-sm bg-panel-2">
      {steps.map((step) => (
        <span
          key={step.name}
          title={`${step.name}: ${step.state} (attempt ${step.attempt}/${step.max_attempts})`}
          className={`flex-1 ${BAR_CLASS[step.state] ?? "bg-[#2a3546]"}`}
        />
      ))}
    </div>
  );
}

export function Panel({
  title,
  children,
  right,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      {(title || right) && (
        <div className="mb-2.5 flex items-center justify-between">
          {title && (
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
              {title}
            </h2>
          )}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-panel">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  );
}

export function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={`border-b border-line px-3 py-2 align-top ${className}`}>
      {children}
    </td>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line p-9 text-center text-muted">
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "plain",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "plain" | "primary";
  disabled?: boolean;
}) {
  const style =
    variant === "primary"
      ? "border-[#1e4d38] bg-[#10241b] text-accent hover:border-accent"
      : "border-line bg-panel-2 text-fg hover:border-accent hover:text-accent";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${style}`}
    >
      {children}
    </button>
  );
}

export function Code({ value }: { value: unknown }) {
  return (
    <pre className="m-0 overflow-x-auto rounded-lg border border-line bg-panel p-3 font-mono text-xs leading-relaxed">
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );
}

export function Legend({ states }: { states: StepState[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[10px] text-muted">
      {states.map((state) => (
        <li key={state} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-[2px] ${BAR_CLASS[state]}`} aria-hidden />
          {state}
        </li>
      ))}
    </ul>
  );
}

export function shortId(value: string, length = 8) {
  return value.slice(0, length);
}

/**
 * `demo.services.TransientUpstreamError` is a module path with a class name on
 * the end. Only the end tells a reader anything, and the front of it was
 * crowding out the message it belongs to.
 */
export function shortErrorType(value: string) {
  if (!value) return "";
  const parts = value.split(".");
  return parts[parts.length - 1] ?? value;
}

/** Truncate on a word boundary with a real ellipsis, not a hard slice. */
export function truncate(value: string, limit: number) {
  const text = (value ?? "").trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function formatTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-GB", { hour12: false });
}

export function lastLine(text: string, limit = 90) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "";
  const lines = trimmed.split("\n");
  const line = lines[lines.length - 1] ?? "";
  const colon = line.indexOf(": ");
  const message = colon > 0 && colon < 60 ? line.slice(colon + 2) : line;
  return truncate(message, limit);
}

export function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  const day = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return `${day} ${date.toLocaleTimeString("en-GB", { hour12: false })}`;
}
