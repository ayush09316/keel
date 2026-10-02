"use client";

import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Tip } from "../ui/tooltip";
import { useUI } from "./ui-context";

export function ReadonlyBadge({ className }: { className?: string }) {
  const { readonly, readonlyReason } = useUI();
  if (!readonly) return null;
  return (
    <Tip content={readonlyReason}>
      <span
        tabIndex={0}
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-md bg-warn/12 px-1.5 font-mono text-[10.5px] font-medium text-warn ring-1 ring-warn/25 ring-inset",
          className,
        )}
      >
        <Lock className="size-3" aria-hidden />
        Read-only demo
      </span>
    </Tip>
  );
}

export function Guarded({ children, reason }: { children: React.ReactElement; reason?: string }) {
  const { readonly, readonlyReason } = useUI();
  const why = reason ?? (readonly ? readonlyReason : "");
  if (!why) return children;
  return (
    <Tip content={why}>
      <span tabIndex={0} className="inline-flex rounded-lg">
        {children}
      </span>
    </Tip>
  );
}
