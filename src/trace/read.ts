import fs from "node:fs";
import path from "node:path";
import {
  type AgentTraceEvent,
  type Run,
  type RunStatus,
  type Segment,
  type SegmentStatus,
} from "../schema/types.js";
import { assessRisk } from "../risk/engine.js";
import { eventsDirFor, runsDir } from "../util/paths.js";
import { listDirNames, listFiles } from "../util/fs.js";
import { changedFilesBetween } from "../util/git.js";

export interface RunSummary {
  sessionId: string;
  status: RunStatus;
  startedAt?: string;
  endedAt?: string;
  durationMs: number;
  fileCount: number;
  commandCount: number;
  maxRisk: Run["risk"]["max"];
  firstPrompt?: string;
}

/** Read and parse all event files for a session, sorted by ts then seq. */
export function readEvents(root: string, sessionId: string): AgentTraceEvent[] {
  const dir = eventsDirFor(root, sessionId);
  const files = listFiles(dir).filter((f) => f.endsWith(".json") && !f.startsWith(".tmp-"));
  const events: AgentTraceEvent[] = [];
  for (const f of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as AgentTraceEvent;
      if (parsed && typeof parsed === "object" && typeof parsed.ts === "string") {
        events.push(parsed);
      }
    } catch {
      // fail-open on read: skip unparseable event files
    }
  }
  events.sort((a, b) => (a.ts === b.ts ? (a.seq ?? 0) - (b.seq ?? 0) : a.ts < b.ts ? -1 : 1));
  return events;
}

function buildSegments(events: AgentTraceEvent[]): Segment[] {
  const segments: Segment[] = [];
  let open: Segment | null = null;
  let counter = 0;
  let sawErrorInOpen = false;

  const closeOpen = (endedAt: string | undefined, status: SegmentStatus) => {
    if (!open) return;
    open.endedAt = endedAt;
    open.status = status;
    segments.push(open);
    open = null;
    sawErrorInOpen = false;
  };

  for (const e of events) {
    if (e.type === "run_start") {
      if (open) closeOpen(undefined, "interrupted"); // resume without clean end
      counter += 1;
      open = { segmentId: `seg-${counter}`, startedAt: e.ts, status: "interrupted" };
    } else if (e.type === "run_end") {
      if (!open) {
        counter += 1;
        open = { segmentId: `seg-${counter}`, startedAt: e.ts, status: "interrupted" };
      }
      closeOpen(e.ts, sawErrorInOpen ? "failed" : "success");
    } else if (e.type === "error") {
      sawErrorInOpen = true;
    }
  }
  if (open) closeOpen(undefined, "interrupted");
  return segments;
}

function aggregateStatus(segments: Segment[]): RunStatus {
  if (segments.length === 0) return "interrupted";
  const hasInterrupted = segments.some((s) => s.status === "interrupted");
  const hasFailed = segments.some((s) => s.status === "failed");
  const hasSuccess = segments.some((s) => s.status === "success");
  if (hasInterrupted && !hasFailed && !hasSuccess) return "interrupted";
  if (hasInterrupted) return "partial";
  if (hasFailed && hasSuccess) return "partial";
  if (hasFailed) return "failed";
  return "success";
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter((v) => v && v.trim().length > 0))];
}

/** Build the full Run aggregate (runs the risk pass as part of reading). */
export function readRun(root: string, sessionId: string): Run {
  const events = readEvents(root, sessionId);
  const segments = buildSegments(events);
  const risk = assessRisk(events); // tags event.risk in place

  const startEvent = events.find((e) => e.type === "run_start");
  const cwd = typeof startEvent?.data?.["cwd"] === "string" ? (startEvent.data["cwd"] as string) : undefined;

  const startedAt = segments[0]?.startedAt ?? events[0]?.ts;
  const lastSeg = segments[segments.length - 1];
  const endedAt = lastSeg?.endedAt ?? events[events.length - 1]?.ts;

  let durationMs = 0;
  for (const s of segments) {
    const end = s.endedAt ? Date.parse(s.endedAt) : NaN;
    const start = Date.parse(s.startedAt);
    if (!Number.isNaN(end) && !Number.isNaN(start)) durationMs += Math.max(0, end - start);
  }

  const filesChanged = uniq(
    events.filter((e) => e.type === "file_change").map((e) => String(e.data?.["path"] ?? "")),
  );
  const commandsRun = uniq(
    events.filter((e) => e.type === "command").map((e) => String(e.data?.["command"] ?? "")),
  );
  const failedSteps = uniq(
    events.filter((e) => e.type === "error").map((e) => {
      const msg = e.data?.["message"];
      return typeof msg === "string" && msg ? `${e.title} — ${msg}` : e.title;
    }),
  );
  const prompts = events.filter((e) => e.type === "prompt").map((e) => String(e.data?.["prompt"] ?? ""));

  // Git supplement (best-effort): include files changed across the run window.
  const commitBefore = typeof startEvent?.data?.["commitBefore"] === "string" ? (startEvent.data["commitBefore"] as string) : undefined;
  const commitAfter = undefined;
  const supplemental = cwd ? changedFilesBetween(cwd, commitBefore, commitAfter) : [];
  const allFiles = uniq([...filesChanged, ...supplemental]);

  return {
    sessionId,
    source: "claude-code",
    cwd,
    segments,
    startedAt,
    endedAt,
    status: aggregateStatus(segments),
    durationMs,
    events,
    filesChanged: allFiles,
    commandsRun,
    failedSteps,
    prompts,
    risk,
  };
}

export function listRunIds(root: string): string[] {
  return listDirNames(runsDir(root));
}

/** Lightweight summaries for `list`, sorted newest-first by start time. */
export function listRuns(root: string, limit?: number): RunSummary[] {
  const ids = listRunIds(root);
  const summaries: RunSummary[] = ids.map((id) => {
    const run = readRun(root, id);
    return {
      sessionId: id,
      status: run.status,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      durationMs: run.durationMs,
      fileCount: run.filesChanged.length,
      commandCount: run.commandsRun.length,
      maxRisk: run.risk.max,
      firstPrompt: run.prompts[0],
    };
  });
  summaries.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
  return typeof limit === "number" ? summaries.slice(0, limit) : summaries;
}

/** Resolve "latest" or a (possibly partial) session id to a concrete run id. */
export function resolveRunId(root: string, idOrLatest: string): string | undefined {
  const ids = listRunIds(root);
  if (ids.length === 0) return undefined;
  if (idOrLatest === "latest") {
    const summaries = listRuns(root, 1);
    return summaries[0]?.sessionId;
  }
  if (ids.includes(idOrLatest)) return idOrLatest;
  const matches = ids.filter((id) => id.startsWith(idOrLatest));
  return matches.length === 1 ? matches[0] : undefined;
}

/** Write the derived compacted events.jsonl for a run. */
export function compactRun(root: string, sessionId: string): string {
  const events = readEvents(root, sessionId);
  const target = path.join(runsDir(root), sessionId, "events.jsonl");
  fs.writeFileSync(target, events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
  return target;
}
