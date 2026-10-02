"use client";

import { Dialog, DialogContent } from "../ui/dialog";
import { Kbd } from "../ui/kbd";
import { NAV } from "./nav-items";
import { useUI } from "./ui-context";

const GROUPS = [
  {
    title: "Global",
    items: [["⌘ K", "Command palette"], ["/", "Command palette"], ["?", "This sheet"], ...NAV.map((n) => [`G ${n.key.toUpperCase()}`, n.label])],
  },
  {
    title: "Chaos replay",
    items: [["Space", "Play / pause"], ["← →", "Step one second"], ["⇧ ← →", "Jump to previous / next event"], ["1 – 5", "Speed 0.5× – 8×"], ["0", "Restart"]],
  },
  {
    title: "Lists",
    items: [["N", "Start a run (Runs)"], ["X", "Select all (Dead letters)"], ["Esc", "Clear selection"]],
  },
];

export function ShortcutsHelp() {
  const { helpOpen, setHelpOpen } = useUI();
  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent title="Keyboard shortcuts" className="max-w-2xl">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
          <p className="mt-0.5 text-xs text-fg-muted">Every page is reachable without the mouse.</p>
        </div>
        <div className="grid max-h-[65vh] gap-6 overflow-y-auto px-5 py-4 sm:grid-cols-3">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="mb-2 font-mono text-[10.5px] tracking-[0.1em] text-fg-subtle uppercase">{g.title}</h3>
              <ul className="space-y-1.5">
                {g.items.map(([k, label]) => (
                  <li key={k + label} className="flex items-center justify-between gap-3 text-[13px] text-fg-muted">
                    <span>{label}</span>
                    <span className="flex shrink-0 gap-1">
                      {k.split(" ").map((p) => (
                        <Kbd key={p}>{p}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
