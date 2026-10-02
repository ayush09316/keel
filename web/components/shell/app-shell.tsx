"use client";

import * as Popover from "@radix-ui/react-popover";
import { Ellipsis, Keyboard, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { API_BASE, GITHUB_URL, api } from "@/lib/api";
import { useHotkeys } from "@/lib/hotkeys";
import { usePoll } from "@/lib/usePoll";
import { cn } from "@/lib/utils";
import { Kbd } from "../ui/kbd";
import { BrandLink } from "./brand";
import { CommandPalette } from "./command-palette";
import { MOBILE_PRIMARY, NAV, NAV_GROUPS } from "./nav-items";
import { ReadonlyBadge } from "./readonly";
import { ShortcutsHelp } from "./shortcuts-help";
import { ThemeToggle } from "./theme-toggle";
import { useUI } from "./ui-context";

function apiHost() {
  try {
    return new URL(API_BASE).host;
  } catch {
    return API_BASE;
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { setPaletteOpen, setHelpOpen } = useUI();
  const { data: stats, error } = usePoll(() => api.stats(), 4000);

  const keys: Record<string, () => void> = {
    "?": () => setHelpOpen(true),
    "/": () => setPaletteOpen(true),
  };
  for (const n of NAV) keys[`g ${n.key}`] = () => router.push(n.href);
  useHotkeys(keys, { global: true });

  const badge = (href: string) => {
    if (!stats) return null;
    if (href === "/runs") return stats.runs.running || null;
    if (href === "/dead-letters") return stats.dead_letters_open || null;
    if (href === "/outbox") return stats.outbox_pending || null;
    if (href === "/workers") return stats.workers_alive || null;
    return null;
  };
  const badgeTone = (href: string) =>
    href === "/dead-letters" ? "text-dead" : href === "/outbox" ? "text-warn" : href === "/runs" ? "text-info" : "text-fg-subtle";
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const online = !error || Boolean(stats);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[236px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface-2/50 px-3 py-4 md:flex">
        <div className="flex items-center justify-between gap-1 pl-1.5">
          <BrandLink />
          <ReadonlyBadge />
        </div>
        <button
          onClick={() => setPaletteOpen(true)}
          className="ap-press mt-5 flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-[13px] text-fg-subtle shadow-card hover:border-border-strong hover:text-fg-muted"
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-left">Find a run…</span>
          <Kbd>⌘K</Kbd>
        </button>
        <nav aria-label="Main" className="mt-5 flex flex-col gap-5 overflow-y-auto">
          {NAV_GROUPS.map((g) => (
            <div key={g} className="flex flex-col gap-0.5">
              <p className="px-2.5 pb-1 font-mono text-[10.5px] tracking-[0.12em] text-fg-subtle uppercase">{g}</p>
              {NAV.filter((n) => n.group === g).map((n) => {
                const on = active(n.href);
                const b = badge(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
                      on ? "bg-surface text-fg shadow-card ring-1 ring-border" : "text-fg-muted hover:bg-muted hover:text-fg",
                    )}
                  >
                    <n.icon className={cn("size-4", on ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted")} aria-hidden />
                    <span className="flex-1">{n.label}</span>
                    {b != null && <span className={cn("font-mono text-[11px] tnum", badgeTone(n.href))}>{b}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3 px-1">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2">
            <span className="relative flex size-2">
              {online && <span className="absolute inset-0 rounded-full bg-good motion-safe:animate-ping motion-safe:opacity-50" />}
              <span className={cn("relative size-2 rounded-full", online ? "bg-good" : "bg-bad")} />
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-muted" title={API_BASE}>
              {online ? apiHost() : "API unreachable"}
            </span>
            {stats && <span className="font-mono text-[11px] text-fg-subtle tnum">{stats.workers_alive}w</span>}
          </div>
          <button
            onClick={() => setHelpOpen(true)}
            className="flex h-8 items-center gap-2 rounded-md px-1.5 text-xs text-fg-subtle hover:text-fg-muted"
          >
            <Keyboard className="size-3.5" aria-hidden />
            <span className="flex-1 text-left">Keyboard shortcuts</span>
            <Kbd>?</Kbd>
          </button>
          <ThemeToggle />
          <a href={GITHUB_URL} className="px-1.5 font-mono text-[11px] text-fg-subtle hover:text-fg-muted">
            source on GitHub ↗
          </a>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-bg/85 px-4 backdrop-blur md:hidden">
        <BrandLink />
        <div className="flex items-center gap-0.5">
          <ReadonlyBadge className="mr-1" />
          <button
            onClick={() => setPaletteOpen(true)}
            aria-label="Search"
            className="inline-flex size-10 items-center justify-center rounded-lg text-fg-muted hover:bg-muted"
          >
            <Search className="size-4" />
          </button>
          <ThemeToggle compact />
        </div>
      </header>

      <main id="main" className="min-w-0 pb-24 md:pb-0">
        <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 md:px-8 md:py-8">{children}</div>
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {NAV.filter((n) => MOBILE_PRIMARY.includes(n.href)).map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active(n.href) ? "page" : undefined}
            className={cn(
              "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
              active(n.href) ? "text-accent" : "text-fg-subtle",
            )}
          >
            <n.icon className="size-5" aria-hidden />
            {n.short ?? n.label}
          </Link>
        ))}
        <Popover.Root>
          <Popover.Trigger
            className={cn(
              "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium outline-none",
              NAV.some((n) => !MOBILE_PRIMARY.includes(n.href) && active(n.href)) ? "text-accent" : "text-fg-subtle",
            )}
          >
            <Ellipsis className="size-5" aria-hidden />
            More
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="top"
              align="end"
              sideOffset={8}
              className="ap-pop z-50 w-56 rounded-xl border border-border bg-surface p-1 shadow-pop"
            >
              {NAV.filter((n) => !MOBILE_PRIMARY.includes(n.href)).map((n) => (
                <Popover.Close asChild key={n.href}>
                  <Link
                    href={n.href}
                    className={cn(
                      "flex h-11 items-center gap-2.5 rounded-lg px-3 text-sm",
                      active(n.href) ? "bg-muted text-fg" : "text-fg-muted hover:bg-muted hover:text-fg",
                    )}
                  >
                    <n.icon className="size-4" aria-hidden />
                    <span className="flex-1">{n.label}</span>
                    {badge(n.href) != null && <span className="font-mono text-[11px] text-fg-subtle">{badge(n.href)}</span>}
                  </Link>
                </Popover.Close>
              ))}
              <Popover.Close asChild>
                <Link href="/" className="flex h-11 items-center gap-2.5 rounded-lg px-3 text-sm text-fg-muted hover:bg-muted hover:text-fg">
                  <span className="w-4 text-center font-mono text-xs">↖</span>
                  Landing page
                </Link>
              </Popover.Close>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </nav>

      <CommandPalette />
      <ShortcutsHelp />
    </div>
  );
}
