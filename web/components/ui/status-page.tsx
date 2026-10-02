"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { BrandLink } from "../shell/brand";
import { Button } from "./button";

export function StatusPage({
  code,
  title,
  description,
  detail,
  actions,
  className,
}: {
  code: string;
  title: React.ReactNode;
  description: React.ReactNode;
  detail?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <main className={cn("relative isolate flex min-h-dvh flex-col overflow-hidden bg-bg text-fg", className)}>
      <div aria-hidden className="k-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_42%,#000_10%,transparent_70%)]" />
      <div aria-hidden className="k-glow pointer-events-none absolute top-[18%] left-1/2 -z-10 size-[520px] -translate-x-1/2" />
      <header className="flex h-16 items-center px-4 sm:px-10">
        <BrandLink />
      </header>
      <section className="flex flex-1 items-center justify-center px-4 pb-24">
        <div className="ap-rise w-full max-w-[460px]">
          <p className="font-mono text-[11px] font-medium tracking-[0.12em] text-fg-subtle uppercase">{code}</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">{description}</p>
          {detail && <div className="mt-6">{detail}</div>}
          {actions && <div className="mt-8 flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </section>
    </main>
  );
}

export function RequestedPath() {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-surface px-3 py-2.5 font-mono text-xs shadow-card">
      <span className="text-fg-subtle">GET</span>
      <code className="min-w-0 flex-1 truncate text-fg">{pathname || "/"}</code>
      <span className="shrink-0 text-[10.5px] tracking-[0.08em] text-warn uppercase">0 rows</span>
    </div>
  );
}

export function ErrorReference({ digest, message }: { digest?: string; message?: string }) {
  if (!digest && !message) return null;
  return (
    <div className="space-y-1 rounded-lg border border-bad/25 bg-bad/5 px-3 py-2.5 font-mono text-[11.5px]">
      {message && <p className="line-clamp-3 text-fg-muted">{message}</p>}
      {digest && <p className="text-fg-subtle">ref {digest}</p>}
    </div>
  );
}

export function BackButton({ fallback = "/overview" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <Button variant="ghost" size="md" onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}>
      <ArrowLeft aria-hidden />
      Go back
    </Button>
  );
}
