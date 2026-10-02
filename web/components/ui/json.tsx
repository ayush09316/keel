import { cn } from "@/lib/utils";

function Value({ value, depth }: { value: unknown; depth: number }) {
  const pad = "  ".repeat(depth + 1);
  const close = "  ".repeat(depth);
  if (value === null || value === undefined) return <span className="text-fg-subtle">null</span>;
  if (typeof value === "string") return <span className="text-good">&quot;{value}&quot;</span>;
  if (typeof value === "number") return <span className="text-info">{value}</span>;
  if (typeof value === "boolean") return <span className="text-warn">{String(value)}</span>;
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-fg-subtle">[]</span>;
    return (
      <>
        {"[\n"}
        {value.map((item, i) => (
          <span key={i}>
            {pad}
            <Value value={item} depth={depth + 1} />
            {i < value.length - 1 ? ",\n" : "\n"}
          </span>
        ))}
        {close}]
      </>
    );
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return <span className="text-fg-subtle">{"{}"}</span>;
  return (
    <>
      {"{\n"}
      {entries.map(([k, v], i) => (
        <span key={k}>
          {pad}
          <span className="text-fg">&quot;{k}&quot;</span>
          <span className="text-fg-subtle">: </span>
          <Value value={v} depth={depth + 1} />
          {i < entries.length - 1 ? ",\n" : "\n"}
        </span>
      ))}
      {close}
      {"}"}
    </>
  );
}

export function JsonBlock({ value, className }: { value: unknown; className?: string }) {
  return (
    <pre
      className={cn(
        "m-0 overflow-x-auto rounded-lg border border-border bg-surface-2/50 p-3 font-mono text-[11.5px] leading-relaxed text-fg-muted",
        className,
      )}
    >
      <Value value={value ?? null} depth={0} />
    </pre>
  );
}
