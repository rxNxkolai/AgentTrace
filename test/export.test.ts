import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runExport } from "../src/commands/export.js";
import type { AgentTraceEvent, EventType } from "../src/schema/types.js";

let root: string;
let counter = 0;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "agenttrace-export-test-"));
  counter = 0;
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function write(sessionId: string, type: EventType, ts: string, seq = 0): void {
  const dir = path.join(root, ".agenttrace", "runs", sessionId, "events");
  fs.mkdirSync(dir, { recursive: true });
  const event: AgentTraceEvent = {
    v: 1,
    ts,
    seq,
    type,
    sessionId,
    source: "claude-code",
    hookEvent: "PostToolUse",
    title: type,
    data: {},
    sourcePayloadSanitized: {},
    risk: null,
  };
  fs.writeFileSync(path.join(dir, `${counter++}.json`), JSON.stringify(event), "utf8");
}

function readJsonl(filePath: string): AgentTraceEvent[] {
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as AgentTraceEvent);
}

describe("runExport", () => {
  it("resolves latest, writes events.jsonl, and prints its path", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    write("old-run", "run_start", "2026-06-03T09:00:00.000Z");
    write("new-run", "command", "2026-06-03T12:00:02.000Z", 2);
    write("new-run", "run_start", "2026-06-03T12:00:00.000Z", 1);

    expect(runExport(root, "latest", {})).toBe(0);

    const jsonlPath = path.join(root, ".agenttrace", "runs", "new-run", "events.jsonl");
    expect(log).toHaveBeenCalledWith(jsonlPath);
    expect(readJsonl(jsonlPath).map((event) => event.type)).toEqual(["run_start", "command"]);
  });

  it("copies the exported JSONL to --out", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    write("session-abc", "run_start", "2026-06-03T10:00:00.000Z");
    const out = path.join(root, "exports", "session.jsonl");

    expect(runExport(root, "session", { out })).toBe(0);

    const storePath = path.join(root, ".agenttrace", "runs", "session-abc", "events.jsonl");
    expect(fs.readFileSync(out, "utf8")).toBe(fs.readFileSync(storePath, "utf8"));
    expect(log).toHaveBeenCalledWith(out);
  });
});
