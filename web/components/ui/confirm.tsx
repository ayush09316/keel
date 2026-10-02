"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "./button";
import { Dialog, DialogContent } from "./dialog";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  tone = "primary",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<unknown> | void;
  tone?: "primary" | "danger";
}) {
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent title={title} hideClose className="max-w-md">
        <div className="px-5 pt-5 pb-4">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          <div className="mt-2 text-sm leading-relaxed text-fg-muted">{body}</div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-surface-2/60 px-5 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone} onClick={() => void confirm()} disabled={busy} autoFocus>
            {busy && <LoaderCircle className="animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
