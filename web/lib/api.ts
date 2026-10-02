import type { ChaosRecording } from "./chaos";
import type {
  DeadLetter,
  Meta,
  OutboxListEvent,
  Page,
  Stats,
  Throughput,
  Worker,
  WorkflowRun,
  WorkflowRunDetail,
  WorkflowSpec,
} from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_KEEL_API ?? "http://localhost:8000/api";
export const GITHUB_URL = process.env.NEXT_PUBLIC_KEEL_GITHUB ?? "https://github.com/ayush09316/keel";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function messageFrom(body: string, fallback: string) {
  try {
    const parsed = JSON.parse(body) as { detail?: string };
    if (parsed.detail) return parsed.detail;
  } catch {}
  return body || fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(messageFrom(body, response.statusText), response.status);
  }
  return (await response.json()) as T;
}

export function demoInput() {
  return {
    order_id: `web-${Date.now().toString(36)}`,
    sku: "TILE-001",
    quantity: 4,
    amount_paise: 250_000,
    channel: "whatsapp",
  };
}

export const api = {
  stats: () => request<Stats>("/stats/"),
  meta: () => request<Meta>("/meta/"),
  workflows: () => request<WorkflowSpec[]>("/workflows/"),

  runs: (params: { state?: string; workflow?: string; q?: string; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.state) query.set("state", params.state);
    if (params.workflow) query.set("workflow", params.workflow);
    if (params.q) query.set("q", params.q);
    query.set("limit", String(params.limit ?? 50));
    return request<Page<WorkflowRun>>(`/runs/?${query}`);
  },

  run: (id: string) => request<WorkflowRunDetail>(`/runs/${id}/`),

  startRun: (workflow: string, input: Record<string, unknown>, key?: string) =>
    request<WorkflowRunDetail & { created: boolean }>("/runs/", {
      method: "POST",
      body: JSON.stringify({ workflow, input, idempotency_key: key ?? null }),
    }),

  cancelRun: (id: string) =>
    request<{ changed: boolean }>(`/runs/${id}/cancel/`, { method: "POST" }),

  deadLetters: (open = true) =>
    request<Page<DeadLetter>>(`/dead-letters/?${open ? "open=1&" : ""}limit=100`),

  replay: (id: number) =>
    request<DeadLetter>(`/dead-letters/${id}/replay/`, { method: "POST" }),

  workers: () => request<Page<Worker>>("/workers/?limit=50"),
  throughput: () => request<Throughput>("/workers/throughput/"),

  outbox: (state?: "pending" | "published", limit = 100) =>
    request<Page<OutboxListEvent>>(`/outbox/?limit=${limit}${state ? `&state=${state}` : ""}`),

  chaos: () => request<ChaosRecording>("/chaos/latest/"),
};

export async function loadRecording(): Promise<ChaosRecording> {
  try {
    return await api.chaos();
  } catch {
    const response = await fetch("/chaos/sample.json", { cache: "force-cache" });
    if (!response.ok) throw new ApiError("No chaos recording available", response.status);
    const body = (await response.json()) as ChaosRecording;
    return { ...body, source: "sample" };
  }
}
