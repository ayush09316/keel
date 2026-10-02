import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  description: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "ap-rise relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border-strong px-6 py-14 text-center",
        className,
      )}
    >
      <div aria-hidden className="k-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_50%_60%_at_50%_40%,#000,transparent)]" />
      <div className="relative mb-4 flex size-11 items-center justify-center rounded-xl border border-border bg-surface text-fg-muted shadow-card">
        <Icon className="size-5" aria-hidden />
      </div>
      <h3 className="relative text-sm font-semibold text-fg">{title}</h3>
      <div className="relative mt-1.5 max-w-md text-sm leading-relaxed text-fg-muted">{description}</div>
      {action && <div className="relative mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Cmd({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-fg">
      {children}
    </code>
  );
}
