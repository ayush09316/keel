"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Runs" },
  { href: "/dead-letters", label: "Dead letters" },
  { href: "/workers", label: "Workers" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-5 pb-3 pt-2.5 text-[13px]">
      {LINKS.map((link) => {
        const active =
          link.href === "/"
            ? pathname === "/" || pathname.startsWith("/runs")
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`border-b-2 pb-0.5 transition-colors ${
              active
                ? "border-accent text-fg"
                : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
