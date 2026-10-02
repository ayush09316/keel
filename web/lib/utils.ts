import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortId(value: string, length = 8) {
  return value.slice(0, length);
}

export function shortErrorType(value: string) {
  if (!value) return "";
  const parts = value.split(".");
  return parts[parts.length - 1] ?? value;
}

export function truncate(value: string, limit: number) {
  const text = (value ?? "").trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function lastLine(text: string, limit = 90) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "";
  const lines = trimmed.split("\n").filter((l) => l.trim());
  const line = lines[lines.length - 1] ?? "";
  const colon = line.indexOf(": ");
  const message = colon > 0 && colon < 60 ? line.slice(colon + 2) : line;
  return truncate(message, limit);
}

export function errorParts(text: string) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { reason: "", summary: "", trace: "" };
  const reasonMatch = trimmed.match(/^(non-retryable|attempts exhausted|lease expired[^:]*):\s*/);
  const reason = reasonMatch ? reasonMatch[1] : "";
  const body = reasonMatch ? trimmed.slice(reasonMatch[0].length) : trimmed;
  const lines = body.split("\n").filter((l) => l.trim());
  const summary = lines[lines.length - 1]?.trim() ?? "";
  const trace = lines.length > 1 ? body : "";
  return { reason, summary, trace };
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "—";
  if (seconds < 1) return `${Math.max(0, Math.round(seconds * 1000))}ms`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}m ${whole % 60}s`;
}

export function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-GB", { hour12: false });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  const day = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return `${day} ${date.toLocaleTimeString("en-GB", { hour12: false })}`;
}

export function ago(value: string | null | undefined, now = Date.now()) {
  if (!value) return "—";
  const seconds = Math.max(0, (now - new Date(value).getTime()) / 1000);
  if (seconds < 1) return "now";
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export const fmt = (n: number) => new Intl.NumberFormat("en-IN").format(n);

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
