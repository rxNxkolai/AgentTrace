/**
 * AgentTrace core schema. This module is the "core" boundary — the trace format other
 * slices (dashboard, adapters) will import. Keep it dependency-free.
 */

/** Bump when the on-disk event shape changes in a non-additive way. */
export const SCHEMA_VERSION = 1 as const;

export type RiskLevel = "safe" | "low" | "medium" | "high" | "critical";

/** Whether an action can be undone. The axis that matters most for review. */
export type Reversibility = "reversible" | "recoverable" | "irreversible";

export const RISK_ORDER: Record<RiskLevel, number> = {
  safe: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** Normalized event types. `passthrough` is the forward-compat escape hatch. */
export type EventType =
  | "run_start"
  | "prompt"
  | "tool_call"
  | "command"
  | "file_change"
  | "error"
  | "permission"
  | "subagent"
  | "stop"
  | "run_end"
  | "passthrough";

/** The source agent/adapter that produced an event. */
export type EventSource = "claude-code" | "shell" | "github-actions" | "n8n";

/**
 * One captured event — the on-disk shape written by the hook runtime
 * (one JSON file per hook invocation under runs/<sessionId>/events/).
 */
export interface AgentTraceEvent {
  /** schema version, present on every event */
  v: number;
  /** ISO-8601 capture timestamp */
  ts: string;
  /** monotonic sequence within the writing process (tie-breaker for equal ts) */
  seq: number;
  type: EventType;
  sessionId: string;
  /** which resume-segment this event belongs to, when known */
  segmentId?: string;
  /** pairing key for Pre/Post tool events when present */
  toolUseId?: string;
  source: EventSource;
  /** the raw Claude hook event name, e.g. "PreToolUse" */
  hookEvent: string;
  /** short human-readable label */
  title: string;
  /** normalized, tool-aware fields safe to render */
  data: Record<string, unknown>;
  /** capped, policy-filtered copy of the original hook payload */
  sourcePayloadSanitized: Record<string, unknown>;
  /** filled by the receipt/risk pass on read — never at capture */
  risk: RiskLevel | null;
}

export type SegmentStatus = "success" | "failed" | "interrupted";

export interface Segment {
  segmentId: string;
  startedAt: string;
  endedAt?: string;
  status: SegmentStatus;
}

export type RunStatus = "success" | "failed" | "partial" | "interrupted";

/** A risk finding attached to a specific event. */
export interface RiskFinding {
  level: RiskLevel;
  reversibility?: Reversibility;
  rule: string;
  message: string;
  eventTs: string;
  eventTitle: string;
}

export interface RiskSummary {
  max: RiskLevel;
  counts: Record<RiskLevel, number>;
  findings: RiskFinding[];
}

/** Aggregate view of a run, computed on read from the event files. */
export interface Run {
  sessionId: string;
  source: EventSource;
  cwd?: string;
  gitBranch?: string;
  commitBefore?: string;
  commitAfter?: string;
  segments: Segment[];
  startedAt?: string;
  endedAt?: string;
  status: RunStatus;
  durationMs: number;
  events: AgentTraceEvent[];
  filesChanged: string[];
  commandsRun: string[];
  failedSteps: string[];
  prompts: string[];
  risk: RiskSummary;
}

export interface Receipt {
  sessionId: string;
  source: EventSource;
  goal: string;
  status: RunStatus;
  startedAt?: string;
  endedAt?: string;
  durationMs: number;
  filesChanged: string[];
  commandsRun: string[];
  failedSteps: string[];
  riskyActions: RiskFinding[];
  reviewChecklist: string[];
  nextRecommendedAction: string;
}
