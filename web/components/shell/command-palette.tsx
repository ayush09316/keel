"use client";

import * as D from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { ArrowRight, Keyboard, LoaderCircle, Moon, Play, Search, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { WorkflowRun, WorkflowSpec } from "@/lib/types";
import { formatTime, shortId } from "@/lib/utils";
import { StateBadge, StepBar } from "../ui/badge";
import { Kbd } from "../ui/kbd";
import { NAV } from "./nav-items";
import { useUI } from "./ui-context";
import { useStartRun } from "./use-actions";

const itemCls =
  "flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm text-fg-muted data-[selected=true]:bg-muted data-[selected=true]:text-fg data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50 [&_svg]:size-4 [&_svg]:text-fg-subtle";
const groupCls =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:tracking-[0.1em] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-fg-subtle";

export function CommandPalette() {
  const { paletteOpen: open, setPaletteOpen: setOpen, setHelpOpen, readonly } = useUI();
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const startRun = useStartRun();
  const [q, setQ] = useState("");
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [searching, setSearching] = useState(false);
  const [workflows, setWorkflows] = useState<WorkflowSpec[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open || workflows.length) return;
    api.workflows().then(setWorkflows).catch(() => {});
  }, [open, workflows.length]);

  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) {
      setRuns([]);
      return;
    }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .runs({ q: term, limit: 8 })
        .then((page) => alive && setRuns(page.results))
        .catch(() => alive && setRuns([]))
        .finally(() => alive && setSearching(false));
    }, 160);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, open]);

  const run = (fn: () => void) => {
    setOpen(false);
    setQ("");
    setRuns([]);
    fn();
  };

  const term = q.trim().toLowerCase();
  const matches = (text: string) => !term || text.toLowerCase().includes(term);
  const pages = NAV.filter((n) => matches(n.label));
  const actions = workflows.filter((w) => matches(`start ${w.name}`));

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
        <D.Content className="ap-pop fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-pop outline-none">
          <D.Title className="sr-only">Command palette</D.Title>
          <D.Description className="sr-only">Jump to a page, open a run by id or order, or start a workflow</D.Description>
          <Command shouldFilter={false} loop label="Command palette">
            <div className="flex items-center gap-2 border-b border-border px-4">
              {searching ? (
                <LoaderCircle className="size-4 animate-spin text-fg-subtle" />
              ) : (
                <Search className="size-4 text-fg-subtle" />
              )}
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Run id prefix, order id, page or command…"
                className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle focus-visible:outline-none"
              />
              <Kbd>esc</Kbd>
            </div>
            <Command.List className="max-h-[min(62vh,440px)] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-fg-subtle">
                {searching ? "Searching runs…" : `Nothing matches “${q.trim()}”.`}
              </Command.Empty>
              {runs.length > 0 && (
                <Command.Group heading="Runs" className={groupCls}>
                  {runs.map((r) => (
                    <Command.Item
                      key={r.id}
                      value={`run-${r.id}`}
                      onSelect={() => run(() => router.push(`/runs/${r.id}`))}
                      className={`${itemCls} h-12`}
                    >
                      <span className="font-mono text-xs text-fg">{shortId(r.id)}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        {r.workflow}
                        <span className="ml-2 font-mono text-[11px] text-fg-subtle">
                          {String(r.input?.order_id ?? "")}
                        </span>
                      </span>
                      <StepBar steps={r.steps} className="hidden w-16 min-w-16 sm:flex" />
                      <StateBadge state={r.state} />
                      <span className="hidden font-mono text-[11px] text-fg-subtle sm:inline">{formatTime(r.created_at)}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {pages.length > 0 && (
                <Command.Group heading="Go to" className={groupCls}>
                  {pages.map((n) => (
                    <Command.Item key={n.href} value={n.href} onSelect={() => run(() => router.push(n.href))} className={itemCls}>
                      <n.icon />
                      <span className="flex-1">{n.label}</span>
                      <span className="flex gap-1">
                        <Kbd>G</Kbd>
                        <Kbd>{n.key.toUpperCase()}</Kbd>
                      </span>
                    </Command.Item>
                  ))}
                  {matches("landing home") && (
                    <Command.Item value="home" onSelect={() => run(() => router.push("/"))} className={itemCls}>
                      <ArrowRight />
                      <span className="flex-1">Landing page</span>
                    </Command.Item>
                  )}
                </Command.Group>
              )}
              {actions.length > 0 && (
                <Command.Group heading="Start a workflow" className={groupCls}>
                  {actions.map((w) => (
                    <Command.Item
                      key={w.name}
                      value={`start-${w.name}`}
                      disabled={readonly}
                      onSelect={() => run(() => void startRun(w.name))}
                      className={itemCls}
                    >
                      <Play />
                      <span className="flex-1">
                        Start <span className="font-mono text-[13px] text-fg">{w.name}</span>
                      </span>
                      <span className="hidden font-mono text-[11px] text-fg-subtle sm:inline">
                        {readonly ? "read-only" : `${w.steps.length} steps`}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {(matches("toggle theme") || matches("keyboard shortcuts")) && (
                <Command.Group heading="Preferences" className={groupCls}>
                  {matches("toggle theme") && (
                    <Command.Item
                      value="theme"
                      onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}
                      className={itemCls}
                    >
                      {resolvedTheme === "dark" ? <Sun /> : <Moon />}
                      <span className="flex-1">Toggle theme</span>
                    </Command.Item>
                  )}
                  {matches("keyboard shortcuts") && (
                    <Command.Item value="help" onSelect={() => run(() => setHelpOpen(true))} className={itemCls}>
                      <Keyboard />
                      <span className="flex-1">Keyboard shortcuts</span>
                      <Kbd>?</Kbd>
                    </Command.Item>
                  )}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
