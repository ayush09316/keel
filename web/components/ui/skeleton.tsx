import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-shimmer rounded-md bg-muted", className)} />;
}

export function HeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-3 h-6 w-40" />
        <Skeleton className="mt-2.5 h-3.5 w-72 max-w-full" />
      </div>
      {action && <Skeleton className="h-8 w-36 rounded-lg" />}
    </div>
  );
}

export function TilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface px-4 py-3.5 shadow-card">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("overflow-hidden rounded-xl border border-border bg-surface shadow-card", className)}>
      <div className="flex gap-6 border-b border-border px-4 py-3">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-24" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-6 border-b border-border px-4 py-3.5 last:border-0">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-1.5 flex-1" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("rounded-xl border border-border bg-surface p-4 shadow-card", className)}>
      <Skeleton className="h-3.5 w-32" />
      <Skeleton className="mt-4 h-full min-h-24 w-full rounded-lg" />
    </div>
  );
}
