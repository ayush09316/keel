"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ApiError, api, demoInput } from "@/lib/api";
import { shortId } from "@/lib/utils";
import { useUI } from "./ui-context";

export function describeFailure(cause: unknown) {
  if (cause instanceof ApiError) {
    if (cause.status === 403) return cause.message;
    return `${cause.status} · ${cause.message.slice(0, 160)}`;
  }
  return "API unreachable — is manage.py runserver up?";
}

export function useStartRun() {
  const router = useRouter();
  const { readonly, readonlyReason } = useUI();

  return async (workflow: string, onDone?: () => void) => {
    if (readonly) {
      toast.error("Read-only demo", { description: readonlyReason });
      return null;
    }
    try {
      const run = await api.startRun(workflow, demoInput());
      toast.success(`Started ${workflow}`, {
        description: `run ${shortId(run.id)} · ${run.steps.length} steps queued`,
        action: { label: "Open", onClick: () => router.push(`/runs/${run.id}`) },
      });
      onDone?.();
      return run;
    } catch (cause) {
      toast.error(`Could not start ${workflow}`, { description: describeFailure(cause) });
      return null;
    }
  };
}
