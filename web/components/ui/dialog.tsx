"use client";

import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export const Dialog = D.Root;

export function DialogContent({
  children,
  className,
  title,
  description,
  hideClose,
}: {
  children: React.ReactNode;
  className?: string;
  title: string;
  description?: string;
  hideClose?: boolean;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
      <D.Content
        className={cn(
          "ap-pop fixed top-[14vh] left-1/2 z-50 w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface text-fg shadow-pop outline-none",
          className,
        )}
      >
        <D.Title className="sr-only">{title}</D.Title>
        <D.Description className="sr-only">{description ?? title}</D.Description>
        {children}
        {!hideClose && (
          <D.Close
            className="absolute top-3 right-3 rounded-md p-1 text-fg-subtle hover:bg-muted hover:text-fg"
            aria-label="Close"
          >
            <X className="size-4" />
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  );
}
