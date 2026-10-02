import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass } from "@/components/ui/button";
import { BackButton, RequestedPath, StatusPage } from "@/components/ui/status-page";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <StatusPage
      code="404 · no row matched"
      title="This page was never committed"
      description="The link is mistyped, or it points at a run from a database that has since been truncated — `make chaos` resets every table before it starts."
      detail={<RequestedPath />}
      actions={
        <>
          <Link href="/runs" className={buttonClass("primary", "md")}>
            Open runs
          </Link>
          <BackButton />
        </>
      }
    />
  );
}
