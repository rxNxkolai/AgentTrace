import type { ImportResult, ImportedEvent } from "./github-actions.js";

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/**
 * Parse an n8n execution export (the JSON from a saved/exported execution) into an AgentTrace
 * run. Maps each executed node to an event and surfaces node/run errors. Defensive about the
 * several shapes n8n has shipped over versions.
 */
export function parseN8n(input: unknown): ImportResult {
  const exec = (input ?? {}) as Record<string, unknown>;
  const id = exec["id"] ?? exec["executionId"] ?? Date.now();
  const runId = `n8n-${String(id)}`;
  const wf = (exec["workflowData"] ?? exec["workflow"] ?? {}) as Record<string, unknown>;
  const started = str(exec["startedAt"], new Date().toISOString());
  const stopped = str(exec["stoppedAt"], started);

  const events: ImportedEvent[] = [];
  events.push({
    ts: started,
    type: "run_start",
    source: "n8n",
    hookEvent: "n8n",
    title: `Workflow: ${str(wf["name"], "n8n workflow")}`,
    data: { workflow: str(wf["name"]), executionId: String(id) },
    sourcePayloadSanitized: {},
    risk: null,
  });

  const data = (exec["data"] ?? {}) as Record<string, unknown>;
  const resultData = (data["resultData"] ?? {}) as Record<string, unknown>;
  const runData = (resultData["runData"] ?? {}) as Record<string, unknown[]>;

  for (const [node, runsRaw] of Object.entries(runData)) {
    const runs = Array.isArray(runsRaw) ? runsRaw : [];
    for (const r of runs) {
      const nr = (r ?? {}) as Record<string, unknown>;
      const ts = typeof nr["startTime"] === "number"
        ? new Date(nr["startTime"] as number).toISOString()
        : str(nr["startTime"], started);
      const status = str(nr["executionStatus"], "success");
      events.push({
        ts,
        type: "command",
        source: "n8n",
        hookEvent: "n8n",
        title: `Node: ${node}`,
        data: { command: node, status },
        sourcePayloadSanitized: {},
        risk: null,
      });
      const nodeErr = (nr["error"] ?? {}) as Record<string, unknown>;
      if (status === "error" || nodeErr["message"]) {
        events.push({
          ts,
          type: "error",
          source: "n8n",
          hookEvent: "n8n",
          title: `Node failed: ${node}`,
          data: { message: str(nodeErr["message"], `node "${node}" errored`) },
          sourcePayloadSanitized: {},
          risk: null,
        });
      }
    }
  }

  const runError = (resultData["error"] ?? {}) as Record<string, unknown>;
  const hasError = Boolean(runError["message"]) || exec["finished"] === false;
  if (runError["message"]) {
    events.push({
      ts: stopped,
      type: "error",
      source: "n8n",
      hookEvent: "n8n",
      title: "Workflow error",
      data: { message: str(runError["message"]) },
      sourcePayloadSanitized: {},
      risk: null,
    });
  }

  events.push({
    ts: stopped,
    type: "run_end",
    source: "n8n",
    hookEvent: "n8n",
    title: "Workflow end",
    data: { status: hasError ? "failed" : "success" },
    sourcePayloadSanitized: {},
    risk: null,
  });

  return { runId, events };
}
