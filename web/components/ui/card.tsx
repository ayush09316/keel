import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-xl border border-border bg-surface shadow-card", className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  right,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-border px-4 py-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold tracking-tight text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-fg-subtle">{description}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

export function Stat({
  label,
  children,
  hint,
  tone,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface px-4 py-3.5 shadow-card", className)}>
      <p className="font-mono text-[10.5px] tracking-[0.1em] text-fg-subtle uppercase">{label}</p>
      <p className={cn("mt-1.5 font-mono text-[22px] leading-none font-semibold tracking-tight tnum", tone ?? "text-fg")}>
        {children}
      </p>
      {hint && <p className="mt-1.5 truncate text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}
