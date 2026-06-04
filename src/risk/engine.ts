import {
  RISK_ORDER,
  type AgentTraceEvent,
  type RiskFinding,
  type RiskLevel,
  type RiskSummary,
} from "../schema/types.js";
import { RISK_RULES } from "./rules.js";

function emptyCounts(): Record<RiskLevel, number> {
  return { safe: 0, low: 0, medium: 0, high: 0, critical: 0 };
}

function maxLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

/**
 * Assess a list of normalized events. Mutates each event's `risk` to its highest matching
 * rule level (or null), and returns a run-level summary. Pure aside from the in-place risk
 * tag, which is exactly the receipt-time enrichment the schema reserves.
 */
export function assessRisk(events: AgentTraceEvent[]): RiskSummary {
  const counts = emptyCounts();
  const findings: RiskFinding[] = [];
  let max: RiskLevel = "safe";

  for (const event of events) {
    let eventLevel: RiskLevel | null = null;
    let topFinding: RiskFinding | null = null;

    for (const rule of RISK_RULES) {
      let matched = false;
      try {
        matched = rule.test(event);
      } catch {
        matched = false;
      }
      if (!matched) continue;
      eventLevel = eventLevel ? maxLevel(eventLevel, rule.level) : rule.level;
      const finding: RiskFinding = {
        level: rule.level,
        rule: rule.name,
        message: safeMessage(rule, event),
        eventTs: event.ts,
        eventTitle: event.title,
      };
      if (!topFinding || RISK_ORDER[rule.level] > RISK_ORDER[topFinding.level]) {
        topFinding = finding;
      }
    }

    event.risk = eventLevel;
    if (eventLevel) {
      counts[eventLevel] += 1;
      max = maxLevel(max, eventLevel);
      if (topFinding) findings.push(topFinding);
    }
  }

  findings.sort((a, b) => RISK_ORDER[b.level] - RISK_ORDER[a.level]);
  return { max, counts, findings };
}

function safeMessage(rule: (typeof RISK_RULES)[number], event: AgentTraceEvent): string {
  try {
    return rule.message(event);
  } catch {
    return rule.name;
  }
}
