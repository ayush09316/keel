"use client";

import { RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button, buttonClass } from "@/components/ui/button";
import { ErrorReference, StatusPage } from "@/components/ui/status-page";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      code="500 · step failed"
      title="This page raised before it could commit"
      description="Nothing was written — like a step that dies mid-flight, the render can simply be retried."
      detail={<ErrorReference digest={error.digest} message={error.message} />}
      actions={
        <>
          <Button variant="primary" size="md" onClick={reset}>
            <RotateCw aria-hidden />
            Retry
          </Button>
          <Link href="/overview" className={buttonClass("ghost", "md")}>
            Overview
          </Link>
        </>
      }
    />
  );
}
