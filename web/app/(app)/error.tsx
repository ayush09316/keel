"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={TriangleAlert}
      title="This view raised before it could render"
      description={
        <>
          <span className="block">Nothing was changed. Retry it the way the engine retries a step.</span>
          <span className="mt-2 block font-mono text-[11.5px] text-fg-subtle">{error.digest ?? error.message}</span>
        </>
      }
      action={
        <Button variant="primary" onClick={reset}>
          <RotateCw aria-hidden />
          Retry
        </Button>
      }
      className="mt-10"
    />
  );
}
