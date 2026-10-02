import { Check, X } from "lucide-react";

function Chip({ children, tone = "text-fg-muted border-border bg-surface" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`inline-flex h-6 items-center rounded-md border px-1.5 font-mono text-[10.5px] whitespace-nowrap ${tone}`}>{children}</span>;
}

export function LeaseDiagram() {
  return (
    <div className="w-full max-w-[260px] space-y-2.5 font-mono text-[10.5px]">
      <div className="flex items-center justify-between text-fg-subtle">
        <span>lease_expires_at</span>
        <span className="flex gap-1" aria-hidden>
          {[0, 0.55, 1.1].map((d) => (
            <span key={d} className="k-beat size-1.5 rounded-full bg-good" style={{ "--d": `${d}s` } as React.CSSProperties} />
          ))}
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-muted">
        <span className="k-lease-cycle absolute inset-y-0 left-0 w-full origin-left rounded-full bg-good" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Chip>heartbeat · lease/3</Chip>
        <span className="text-fg-subtle">→</span>
        <Chip tone="text-ice border-ice/30 bg-ice/10">reaper → ready</Chip>
      </div>
    </div>
  );
}

export function FenceDiagram() {
  return (
    <div className="w-full max-w-[270px] space-y-2 font-mono text-[10.5px]">
      <div className="flex items-center gap-2">
        <Chip tone="text-fence border-fence/30 bg-fence/10">A · attempt 3</Chip>
        <div className="relative h-6 flex-1">
          <span className="k-motion k-bounce absolute top-1/2 left-0 size-2 -translate-y-1/2 rounded-full bg-fence" style={{ "--to": "72px" } as React.CSSProperties} />
        </div>
        <X className="size-3.5 text-bad" aria-hidden />
      </div>
      <div className="rounded-md border border-border-strong bg-surface-2 px-2 py-1.5 text-center text-fg-muted">
        UPDATE … WHERE <span className="text-fg">attempt = 4</span>
      </div>
      <div className="flex items-center gap-2">
        <Chip tone="text-good border-good/30 bg-good/10">B · attempt 4</Chip>
        <div className="relative h-6 flex-1">
          <span className="k-motion k-slide absolute top-1/2 left-0 size-2 -translate-y-1/2 rounded-full bg-good" style={{ "--to": "86px" } as React.CSSProperties} />
        </div>
        <Check className="size-3.5 text-good" aria-hidden />
      </div>
    </div>
  );
}

export function RetryDiagram() {
  const at = [0, 10, 28, 64];
  return (
    <div className="w-full max-w-[260px] font-mono text-[10.5px]">
      <div className="relative h-10">
        <span className="absolute top-1/2 right-0 left-0 h-px bg-border-strong" />
        {at.map((x, i) => (
          <span
            key={x}
            className={`k-beat absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-surface ${i === at.length - 1 ? "bg-good" : "bg-warn"}`}
            style={{ left: `${(x / 70) * 100}%`, "--d": `${i * 0.35}s` } as React.CSSProperties}
          />
        ))}
      </div>
      <div className="flex justify-between text-fg-subtle">
        <span>503</span>
        <span>503</span>
        <span>503</span>
        <span className="text-good">200</span>
      </div>
      <p className="mt-2 text-center text-fg-subtle">base · 2ⁿ · jitter</p>
    </div>
  );
}

export function OnceDiagram() {
  return (
    <div className="w-full max-w-[270px] space-y-2 font-mono text-[10.5px]">
      <div className="flex items-center gap-2">
        <Chip>attempt 1</Chip>
        <div className="relative h-5 flex-1 overflow-hidden">
          <span className="k-motion k-slide absolute top-1/2 left-0 size-2 -translate-y-1/2 rounded-full bg-warn" style={{ "--to": "70px" } as React.CSSProperties} />
        </div>
        <Chip tone="text-good border-good/30 bg-good/10">charge #1</Chip>
      </div>
      <div className="rounded-md border border-dashed border-border-strong px-2 py-1 text-center text-fg-muted">
        key <span className="text-fg">run:charge_payment:charge</span>
      </div>
      <div className="flex items-center gap-2">
        <Chip>attempt 2</Chip>
        <div className="relative h-5 flex-1 overflow-hidden">
          <span className="k-motion k-slide absolute top-1/2 left-0 size-2 -translate-y-1/2 rounded-full bg-warn" style={{ "--to": "70px", animationDelay: "1.2s" } as React.CSSProperties} />
        </div>
        <Chip tone="text-warn border-warn/30 bg-warn/10">cached</Chip>
      </div>
    </div>
  );
}

export function OutboxDiagram() {
  return (
    <div className="flex w-full max-w-[280px] items-center gap-2 font-mono text-[10.5px]">
      <div className="flex-1 rounded-lg border border-border-strong bg-surface-2 p-1.5">
        <p className="px-1 pb-1 text-[9.5px] tracking-[0.1em] text-fg-subtle uppercase">one commit</p>
        <div className="space-y-1">
          <div className="rounded border border-border bg-surface px-1.5 py-1 text-fg-muted">step → succeeded</div>
          <div className="rounded border border-good/30 bg-good/10 px-1.5 py-1 text-good">outbox · payment.captured</div>
        </div>
      </div>
      <div className="relative h-6 w-12 shrink-0">
        <span className="absolute top-1/2 right-0 left-0 h-px bg-border-strong" />
        <span className="k-motion k-slide absolute top-1/2 left-0 size-2 -translate-y-1/2 rounded-full bg-good" style={{ "--to": "40px" } as React.CSSProperties} />
      </div>
      <Chip tone="text-fg border-border-strong bg-surface">relay → sink</Chip>
    </div>
  );
}

export function DlqDiagram() {
  return (
    <div className="w-full max-w-[270px] font-mono text-[10.5px]">
      <div className="flex items-center gap-1">
        {["reserve", "charge", "invoice", "notify"].map((s, i) => (
          <span
            key={s}
            className={`flex h-7 flex-1 items-center justify-center gap-1 rounded-md border ${
              i < 2 ? "border-good/30 bg-good/10 text-good" : i === 2 ? "border-dead/40 bg-dead/10 text-dead" : "border-border bg-muted/50 text-fg-subtle"
            }`}
          >
            {i < 2 && <Check className="size-3" aria-hidden />}
            {s}
          </span>
        ))}
      </div>
      <svg viewBox="0 0 260 34" className="mt-1 h-[34px] w-full" aria-hidden>
        <path d="M170 2 C170 26, 150 30, 130 30 L60 30" fill="none" stroke="var(--border-strong)" strokeDasharray="3 4" />
        <path d="M170 2 C170 26, 150 30, 130 30" fill="none" stroke="var(--dead)" strokeDasharray="3 4" className="k-dash" />
        <text x="62" y="25" fill="var(--fg-subtle)" fontSize="10" fontFamily="var(--font-mono)">
          replay from here · ✓ kept
        </text>
      </svg>
    </div>
  );
}
