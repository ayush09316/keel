import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { GITHUB_URL } from "@/lib/api";
import { BrandLink } from "../shell/brand";
import { ThemeToggle } from "../shell/theme-toggle";

const LINKS = [
  { href: "#mechanisms", label: "Mechanisms" },
  { href: "#commit", label: "How a step commits" },
  { href: "#proof", label: "Proof" },
  { href: "#not-here", label: "Not here" },
];

export function LandingNav() {
  return (
    <header data-k-nav data-scrolled="false" className="k-nav sticky top-0 z-40">
      <div className="mx-auto flex h-16 max-w-[1160px] items-center justify-between gap-3 px-4 sm:px-6">
        <BrandLink />
        <nav aria-label="Sections" className="hidden items-center gap-0.5 lg:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-full px-3.5 py-2 text-[13.5px] text-fg-muted transition-colors hover:bg-muted hover:text-fg">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <ThemeToggle compact />
          <a href={GITHUB_URL} className="hidden min-h-10 items-center rounded-full px-3 text-[13.5px] text-fg-muted hover:text-fg sm:inline-flex">
            GitHub
          </a>
          <Link href="/runs" className="k-btn inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium">
            Dashboard
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}
