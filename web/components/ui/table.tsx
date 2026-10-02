import { cn } from "@/lib/utils";

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border bg-surface shadow-card", className)}>
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  );
}

export function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "h-9 border-b border-border bg-surface-2/50 px-3 font-mono text-[10.5px] font-medium tracking-[0.08em] whitespace-nowrap text-fg-subtle uppercase first:pl-4 last:pr-4",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = "", title }: { children?: React.ReactNode; className?: string; title?: string }) {
  return (
    <td title={title} className={cn("border-b border-border px-3 py-2.5 align-middle first:pl-4 last:pr-4 [tr:last-child_&]:border-0", className)}>
      {children}
    </td>
  );
}
