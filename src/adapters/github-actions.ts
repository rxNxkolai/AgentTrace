import type { AgentTraceEvent } from "../schema/types.js";

/** Event shape adapters emit (writeEvent fills v/seq/sessionId). */
export type ImportedEvent = Omit<AgentTraceEvent, "v" | "seq" | "sessionId">;
export interface ImportResult {
  runId: string;
  events: ImportedEvent[];
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function failed(conclusion: unknown): boolean {
  const c = str(conclusion).toLowerCase();
  return c === "failure" || c === "cancelled" || c === "timed_out" || c === "action_required";
}

/**
 * Parse the JSON from `gh run view <id> --json
 * databaseId,displayTitle,headBranch,status,conclusion,createdAt,updatedAt,jobs`
 * into an AgentTrace run. Defensive: tolerates missing fields.
 */
export function parseGithubActions(input: unknown): ImportResult {
  const run = (input ?? {}) as Record<string, unknown>;
  const id = run["databaseId"] ?? run["id"] ?? Date.now();
  const runId = `gha-${String(id)}`;
  const started = str(run["createdAt"], new Date().toISOString());
  const ended = str(run["updatedAt"], started);
  const conclusion = run["conclusion"];

  const events: ImportedEvent[] = [];
  events.push({
    ts: started,
    type: "run_start",
    source: "github-actions",
    hookEvent: "github-actions",
    title: `Workflow: ${str(run["displayTitle"], "GitHub Actions run")}`,
    data: { workflow: str(run["displayTitle"]), branch: str(run["headBranch"]) },
    sourcePayloadSanitized: {},
    risk: null,
  });

  const jobs = Array.isArray(run["jobs"]) ? (run["jobs"] as Record<string, unknown>[]) : [];
  for (const job of jobs) {
    const steps = Array.isArray(job["steps"]) ? (job["steps"] as Record<string, unknown>[]) : [];
    for (const step of steps) {
      const ts = str(step["startedAt"], started);
      const name = str(step["name"], "step");
      events.push({
        ts,
        type: "command",
        source: "github-actions",
        hookEvent: "github-actions",
        title: `${str(job["name"], "job")} › ${name}`,
        data: { command: name, conclusion: str(step["conclusion"]) },
        sourcePayloadSanitized: {},
        risk: null,
      });
      if (failed(step["conclusion"])) {
        events.push({
          ts: str(step["completedAt"], ts),
          type: "error",
          source: "github-actions",
          hookEvent: "github-actions",
          title: `Failed step: ${name}`,
          data: { message: `step "${name}" concluded ${str(step["conclusion"])}` },
          sourcePayloadSanitized: {},
          risk: null,
        });
      }
    }
  }

  events.push({
    ts: ended,
    type: "run_end",
    source: "github-actions",
    hookEvent: "github-actions",
    title: "Workflow end",
    data: { conclusion: str(conclusion), status: failed(conclusion) ? "failed" : "success" },
    sourcePayloadSanitized: {},
    risk: null,
  });

  return { runId, events };
}
