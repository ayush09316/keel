export type RunState =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type StepState =
  | "blocked"
  | "ready"
  | "running"
  | "succeeded"
  | "dead"
  | "cancelled";

export interface StepRun {
  id: string;
  name: string;
  seq: number;
  state: StepState;
  attempt: number;
  max_attempts: number;
  attempts_left: number;
  reclaimed: number;
  effects_performed: number;
  effects_replayed: number;
  run_after: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  heartbeat_at: string | null;
  output: unknown;
  error_type: string;
  error: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface OutboxEvent {
  id: number;
  topic: string;
  step_name: string;
  dedupe_key: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  published_at: string | null;
  publish_attempts: number;
  last_error: string;
}

export interface StepSummary {
  name: string;
  state: StepState;
  attempt: number;
  max_attempts: number;
}

export interface WorkflowRun {
  id: string;
  workflow: string;
  state: RunState;
  idempotency_key: string | null;
  input: Record<string, unknown>;
  error: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  steps: StepSummary[];
}

export interface WorkflowRunDetail extends WorkflowRun {
  context: Record<string, unknown>;
  steps: StepRun[];
  events: OutboxEvent[];
}

export interface DeadLetter {
  id: number;
  run: string;
  step: string;
  workflow: string;
  step_name: string;
  attempts: number;
  error_type: string;
  error: string;
  created_at: string;
  replayed_at: string | null;
  replay_count: number;
}

export interface Worker {
  id: string;
  hostname: string;
  pid: number;
  started_at: string;
  last_seen_at: string;
  claimed: number;
  succeeded: number;
  failed: number;
  current_step: string;
}

export interface Stats {
  runs: Record<RunState, number>;
  runs_total: number;
  steps: Record<StepState, number>;
  dead_letters_open: number;
  outbox_pending: number;
  outbox_published: number;
  workers_alive: number;
  workflows: string[];
}

export interface WorkflowSpec {
  name: string;
  description: string;
  steps: { name: string; max_attempts: number; description: string }[];
}

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
