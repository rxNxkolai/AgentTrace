import {
  RISK_ORDER,
  SCHEMA_VERSION,
  type AgentTraceEvent,
  type Reversibility,
  type RiskLevel,
} from "../schema/types.js";
import { assessRisk } from "../risk/engine.js";
import type { GuardPolicy } from "./policy.js";

export type Verdict = "allow" | "warn" | "block";

export interface ProposedAction {
  command?: string;
  path?: string;
  tool?: string;
  /** for file deletions detected with git context */
  deleted?: boolean;
  tracked?: boolean;
}

export interface GuardDecision {
  verdict: Verdict;
  level: RiskLevel;
  reversibility?: Reversibility;
  rule?: string;
  reason: string;
}

function syntheticEvent(a: ProposedAction): AgentTraceEvent {
  let type: AgentTraceEvent["type"] = "command";
  const data: Record<string, unknown> = {};
  if (a.command != null) {
    type = "command";
    data.command = a.command;
  } else if (a.path != null) {
    if (a.tool === "Read") {
      type = "tool_call";
      data.tool = "Read";
      data.path = a.path;
    } else {
      type = "file_change";
      data.path = a.path;
      if (a.deleted != null) data.deleted = a.deleted;
      if (a.tracked != null) data.tracked = a.tracked;
    }
  } else if (a.tool != null) {
    type = "tool_call";
    data.tool = a.tool;
  }
  return {
    v: SCHEMA_VERSION,
    ts: new Date().toISOString(),
    seq: 0,
    type,
    sessionId: "guard-eval",
    source: "shell",
    hookEvent: "guard",
    title: a.command ?? a.path ?? a.tool ?? "action",
    data,
    sourcePayloadSanitized: {},
    risk: null,
  };
}

/**
 * Decide whether a proposed action should be allowed, warned, or blocked. Pure. Reuses the same
 * risk engine that grades receipts, so guard verdicts never drift from the grading.
 */
export function evaluateAction(action: ProposedAction, policy: GuardPolicy): GuardDecision {
  // escape hatch: explicit allow patterns always pass
  if (action.command) {
    for (const pat of policy.allow) {
      try {
        if (new RegExp(pat).test(action.command)) {
          return { verdict: "allow", level: "safe", reason: `allowed by policy (${pat})` };
        }
      } catch {
        /* ignore bad patterns */
      }
    }
  }

  const summary = assessRisk([syntheticEvent(action)]);
  const level = summary.max;
  const top = summary.findings[0];
  const reason = top ? top.message : "no risk detected";

  let verdict: Verdict = "allow";
  if (policy.mode === "block" && RISK_ORDER[level] >= RISK_ORDER[policy.blockAtOrAbove]) {
    verdict = "block";
  } else if (
    policy.mode !== "off" &&
    RISK_ORDER[level] >= RISK_ORDER[policy.warnAtOrAbove]
  ) {
    verdict = "warn";
  }

  return { verdict, level, reversibility: top?.reversibility, rule: top?.rule, reason };
}
