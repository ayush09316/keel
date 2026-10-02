"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { navFor } from "./nav-items";

type Crumb = { label: string; href?: string };

function trail(pathname: string, current?: string): Crumb[] {
  const item = navFor(pathname);
  if (!item) return current ? [{ label: "Keel", href: "/" }, { label: current }] : [];
  const extra = current && current !== item.label ? current : null;
  return [
    { label: item.group },
    { label: item.label, href: extra ? item.href : undefined },
    ...(extra ? [{ label: extra }] : []),
  ];
}

export function Breadcrumbs({ current, className }: { current?: string; className?: string }) {
  const crumbs = trail(usePathname() ?? "", current);
  if (!crumbs.length) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-1 font-mono text-[11px] leading-5 text-fg-subtle">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`} className={cn("flex items-center gap-1", last ? "min-w-0" : "shrink-0")}>
              {c.href && !last ? (
                <Link href={c.href} className="rounded-sm text-fg-muted transition-colors hover:text-fg">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn(last && "truncate text-fg-muted")} title={last ? c.label : undefined}>
                  {c.label}
                </span>
              )}
              {!last && <ChevronRight className="size-3 shrink-0 opacity-70" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
