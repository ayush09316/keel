import { Activity, Cpu, Inbox, LayoutDashboard, Rows3, Skull, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; key: string; icon: LucideIcon; group: string; short?: string };

export const NAV: NavItem[] = [
  { href: "/overview", label: "Overview", key: "o", icon: LayoutDashboard, group: "Engine" },
  { href: "/runs", label: "Runs", key: "r", icon: Rows3, group: "Engine" },
  { href: "/dead-letters", label: "Dead letters", key: "d", icon: Skull, group: "Engine", short: "DLQ" },
  { href: "/outbox", label: "Outbox", key: "e", icon: Inbox, group: "Engine" },
  { href: "/workers", label: "Workers", key: "w", icon: Cpu, group: "Engine" },
  { href: "/chaos", label: "Chaos replay", key: "c", icon: Activity, group: "Proof", short: "Chaos" },
];

export const NAV_GROUPS = ["Engine", "Proof"];

export const MOBILE_PRIMARY = ["/overview", "/runs", "/chaos", "/workers"];

export function navFor(pathname: string) {
  return NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
}
