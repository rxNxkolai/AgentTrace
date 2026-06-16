import {
  RISK_ORDER,
  type Receipt,
  type RiskFinding,
  type Run,
} from "../schema/types.js";

/** Build a sanitized receipt from a Run aggregate. Pure. */
export function generateReceipt(run: Run): Receipt {
  const goal = run.prompts[0]?.trim() || "(no prompt captured)";
  const riskyActions = run.risk.findings.filter((f) => RISK_ORDER[f.level] >= RISK_ORDER.medium);
  const decisions = run.events.filter((e) => e.type === "permission");
  const guardBlocked = decisions.filter((e) => e.data?.["decision"] === "guard_block").length;
  const guardWarned = decisions.filter((e) => e.data?.["decision"] === "guard_warn").length;

  return {
    sessionId: run.sessionId,
    source: run.source,
    goal,
    riskMax: run.risk.max,
    status: run.status,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    durationMs: run.durationMs,
    filesChanged: run.filesChanged,
    commandsRun: run.commandsRun,
    failedSteps: run.failedSteps,
    riskyActions,
    reviewChecklist: buildChecklist(run),
    nextRecommendedAction: recommend(run),
    guardBlocked,
    guardWarned,
  };
}

function buildChecklist(run: Run): string[] {
  const items: string[] = [];
  for (const f of run.risk.findings) {
    if (RISK_ORDER[f.level] >= RISK_ORDER.high) {
      items.push(`Review (${f.level}): ${f.message}`);
    }
  }
  if (run.risk.findings.some((f) => f.rule === "lockfile-changed" || f.rule === "dependency-install")) {
    items.push("Confirm dependency / lockfile changes are expected.");
  }
  if (run.failedSteps.length > 0) {
    items.push("Investigate the failed steps and re-run locally.");
  }
  if (run.filesChanged.length > 0) {
    items.push("Run the app / tests locally before merge.");
  }
  if (items.length === 0) {
    items.push("Nothing notable flagged — a normal review is sufficient.");
  }
  return [...new Set(items)];
}

function recommend(run: Run): string {
  if (run.risk.max === "critical") {
    return "Do NOT auto-merge — a critical action was detected. Review carefully before relying on this run.";
  }
  if (run.status === "failed") {
    return "Run failed — resolve the failures before using these changes.";
  }
  if (run.status === "interrupted") {
    return "Run was interrupted — verify the work is complete before relying on it.";
  }
  if (run.status === "partial") {
    return "Run partially succeeded — review failed steps before merging.";
  }
  if (run.risk.max === "high") {
    return "Review the flagged high-risk changes before merging.";
  }
  if (run.filesChanged.length > 0) {
    return "Safe to review as a normal change.";
  }
  return "No file changes recorded — nothing to merge.";
}

function fmtDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

function fmtTime(iso?: string): string {
  return iso ?? "(unknown)";
}

const STATUS_LABEL: Record<Receipt["status"], string> = {
  success: "Success",
  partial: "Success with warnings",
  failed: "Failed",
  interrupted: "Interrupted",
};

/** Render a receipt to sanitized Markdown. Pure. */
export function renderReceiptMarkdown(r: Receipt): string {
  const lines: string[] = [];
  lines.push("# AgentTrace Receipt", "");
  lines.push(`- **Run:** ${r.sessionId}`);
  lines.push(`- **Status:** ${STATUS_LABEL[r.status]}`);
  lines.push(`- **Started:** ${fmtTime(r.startedAt)}`);
  lines.push(`- **Duration:** ${fmtDuration(r.durationMs)}`);
  const adapter = r.source === "shell" ? "Shell (`run`)" : "Claude Code";
  lines.push(`- **Adapter:** ${adapter}`);
  if (r.guardBlocked || r.guardWarned) {
    lines.push(`- **Guard:** ${r.guardBlocked} blocked · ${r.guardWarned} warned`);
  }
  lines.push("");

  lines.push("## Goal", "", r.goal, "");

  lines.push("## Files Changed", "");
  if (r.filesChanged.length === 0) lines.push("_None recorded._");
  else for (const f of r.filesChanged) lines.push(`- ${f}`);
  lines.push("");

  lines.push("## Commands Run", "");
  if (r.commandsRun.length === 0) lines.push("_None recorded._");
  else for (const c of r.commandsRun) lines.push(`- \`${c}\``);
  lines.push("");

  lines.push("## Risk Flags", "");
  if (r.riskyActions.length === 0) lines.push("_No medium-or-higher risk flags._");
  else
    for (const f of r.riskyActions) {
      const tag = f.reversibility === "irreversible" ? " _(irreversible)_" : "";
      lines.push(`- **${f.level.toUpperCase()}:**${tag} ${f.message}`);
    }
  lines.push("");

  lines.push("## Failures", "");
  if (r.failedSteps.length === 0) lines.push("_None._");
  else for (const f of r.failedSteps) lines.push(`- ${f}`);
  lines.push("");

  lines.push("## Review Checklist", "");
  for (const item of r.reviewChecklist) lines.push(`- [ ] ${item}`);
  lines.push("");

  lines.push("## Final Recommendation", "", r.nextRecommendedAction, "");

  return lines.join("\n");
}
