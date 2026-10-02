import Link from "next/link";

import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative flex size-7 items-center justify-center rounded-lg bg-fg text-bg shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none">
        <path d="M4 15.5h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 4v11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7.5 15.5 12 20l4.5-4.5" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="4" r="1.6" fill="var(--accent)" />
      </svg>
    </span>
  );
}

export function BrandLink({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn("flex min-h-10 items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight text-fg", className)}
    >
      <BrandMark />
      Keel
    </Link>
  );
}
