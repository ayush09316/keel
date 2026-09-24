import type {
  DeadLetter,
  Page,
  Stats,
  Worker,
  WorkflowRun,
  WorkflowRunDetail,
  WorkflowSpec,
} from "./types";

const BASE =
  process.env.NEXT_PUBLIC_KEEL_API ?? "http://localhost:8000/api";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(body || response.statusText, response.status);
  }
  return (await response.json()) as T;
}

export const api = {
  stats: () => request<Stats>("/stats/"),
  workflows: () => request<WorkflowSpec[]>("/workflows/"),

  runs: (params: { state?: string; workflow?: string; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.state) query.set("state", params.state);
    if (params.workflow) query.set("workflow", params.workflow);
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
    request<Page<DeadLetter>>(`/dead-letters/?${open ? "open=1&" : ""}limit=50`),

  replay: (id: number) =>
    request<DeadLetter>(`/dead-letters/${id}/replay/`, { method: "POST" }),

  workers: () => request<Page<Worker>>("/workers/?limit=50"),
};
