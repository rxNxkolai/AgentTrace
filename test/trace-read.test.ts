import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readRun, listRuns, resolveRunId } from "../src/trace/read.js";
import type { AgentTraceEvent, EventType } from "../src/schema/types.js";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "agenttrace-test-"));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

let counter = 0;
function write(sessionId: string, type: EventType, ts: string, data: Record<string, unknown> = {}, hookEvent = "PostToolUse"): void {
  const dir = path.join(root, ".agenttrace", "runs", sessionId, "events");
  fs.mkdirSync(dir, { recursive: true });
  const e: AgentTraceEvent = {
    v: 1,
    ts,
    seq: 0,
    type,
    sessionId,
    source: "claude-code",
    hookEvent,
    title: `${type}`,
    data,
    sourcePayloadSanitized: {},
    risk: null,
  };
  fs.writeFileSync(path.join(dir, `${ts.replace(/[:.]/g, "-")}-${counter++}.json`), JSON.stringify(e));
}

describe("readRun", () => {
  it("builds a successful single-segment run with files and commands", () => {
    const id = "sess-success";
    write(id, "run_start", "2026-06-03T10:00:00.000Z", {}, "SessionStart");
    write(id, "prompt", "2026-06-03T10:00:01.000Z", { prompt: "fix the bug" }, "UserPromptSubmit");
    write(id, "command", "2026-06-03T10:00:05.000Z", { command: "npm test" });
    write(id, "file_change", "2026-06-03T10:00:06.000Z", { path: "src/a.ts" });
    write(id, "run_end", "2026-06-03T10:02:00.000Z", {}, "SessionEnd");

    const run = readRun(root, id);
    expect(run.status).toBe("success");
    expect(run.segments).toHaveLength(1);
    expect(run.filesChanged).toContain("src/a.ts");
    expect(run.commandsRun).toContain("npm test");
    expect(run.prompts[0]).toBe("fix the bug");
    expect(run.durationMs).toBe(120000);
  });

  it("marks a run with no SessionEnd as interrupted", () => {
    const id = "sess-interrupted";
    write(id, "run_start", "2026-06-03T10:00:00.000Z", {}, "SessionStart");
    write(id, "command", "2026-06-03T10:00:05.000Z", { command: "ls" });
    const run = readRun(root, id);
    expect(run.status).toBe("interrupted");
    expect(run.segments[0]!.status).toBe("interrupted");
  });

  it("marks a run containing an error as failed", () => {
    const id = "sess-failed";
    write(id, "run_start", "2026-06-03T10:00:00.000Z", {}, "SessionStart");
    write(id, "error", "2026-06-03T10:00:03.000Z", { message: "boom" }, "PostToolUseFailure");
    write(id, "run_end", "2026-06-03T10:00:10.000Z", {}, "SessionEnd");
    const run = readRun(root, id);
    expect(run.status).toBe("failed");
    expect(run.failedSteps.length).toBe(1);
  });

  it("handles resume: two segments (interrupted then success) => partial", () => {
    const id = "sess-resume";
    write(id, "run_start", "2026-06-03T10:00:00.000Z", {}, "SessionStart");
    write(id, "command", "2026-06-03T10:00:01.000Z", { command: "echo a" });
    // resume without a clean end -> first segment interrupted
    write(id, "run_start", "2026-06-03T11:00:00.000Z", {}, "SessionStart");
    write(id, "run_end", "2026-06-03T11:05:00.000Z", {}, "SessionEnd");
    const run = readRun(root, id);
    expect(run.segments).toHaveLength(2);
    expect(run.segments[0]!.status).toBe("interrupted");
    expect(run.segments[1]!.status).toBe("success");
    expect(run.status).toBe("partial");
  });

  it("ignores unparseable and .tmp- files (fail-open on read)", () => {
    const id = "sess-garbage";
    const dir = path.join(root, ".agenttrace", "runs", id, "events");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "broken.json"), "{ not json");
    fs.writeFileSync(path.join(dir, ".tmp-partial"), "ignore me");
    write(id, "command", "2026-06-03T10:00:01.000Z", { command: "ls" });
    const run = readRun(root, id);
    expect(run.events).toHaveLength(1);
  });
});

describe("listRuns / resolveRunId", () => {
  it("lists newest-first and resolves latest + prefix", () => {
    write("aaa-old", "run_start", "2026-06-03T09:00:00.000Z", {}, "SessionStart");
    write("aaa-old", "run_end", "2026-06-03T09:01:00.000Z", {}, "SessionEnd");
    write("bbb-new", "run_start", "2026-06-03T12:00:00.000Z", {}, "SessionStart");
    write("bbb-new", "run_end", "2026-06-03T12:01:00.000Z", {}, "SessionEnd");

    const runs = listRuns(root);
    expect(runs[0]!.sessionId).toBe("bbb-new");
    expect(resolveRunId(root, "latest")).toBe("bbb-new");
    expect(resolveRunId(root, "aaa")).toBe("aaa-old");
    expect(resolveRunId(root, "zzz")).toBeUndefined();
  });
});
