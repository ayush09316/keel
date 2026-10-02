import { CardSkeleton, HeaderSkeleton, Skeleton, TableSkeleton, TilesSkeleton } from "../ui/skeleton";

export function RunDetailSkeleton() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="bg-surface px-4 py-3">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="mt-2 h-4 w-20" />
          </div>
        ))}
      </div>
      <CardSkeleton className="h-64" />
      <div className="grid gap-6 lg:grid-cols-2">
        <CardSkeleton className="h-56" />
        <CardSkeleton className="h-56" />
      </div>
    </div>
  );
}

export function ListPageSkeleton({ tiles = true }: { tiles?: boolean }) {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      {tiles && <TilesSkeleton />}
      <TableSkeleton />
    </div>
  );
}

export function ChaosSkeleton() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <CardSkeleton className="h-40" />
        <CardSkeleton className="h-40" />
      </div>
      <CardSkeleton className="h-80" />
    </div>
  );
}
