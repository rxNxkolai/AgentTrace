import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApiResponse } from "../src/server/api.js";
import type { AgentTraceEvent, EventType } from "../src/schema/types.js";

let root: string;
let counter = 0;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "agenttrace-api-test-"));
  counter = 0;
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(sessionId: string, type: EventType, ts: string, data: Record<string, unknown> = {}, hookEvent = "PostToolUse"): void {
  const dir = path.join(root, ".agenttrace", "runs", sessionId, "events");
  fs.mkdirSync(dir, { recursive: true });
  const e: AgentTraceEvent = {
    v: 1, ts, seq: 0, type, sessionId, source: "claude-code",
    hookEvent, title: type, data, sourcePayloadSanitized: {}, risk: null,
  };
  fs.writeFileSync(path.join(dir, `${counter++}.json`), JSON.stringify(e));
}

function seedRun(id: string): void {
  write(id, "run_start", "2026-06-05T10:00:00.000Z", {}, "SessionStart");
  write(id, "prompt", "2026-06-05T10:00:01.000Z", { prompt: "fix the bug" }, "UserPromptSubmit");
  write(id, "command", "2026-06-05T10:00:05.000Z", { command: "rm -rf build" });
  write(id, "run_end", "2026-06-05T10:01:00.000Z", {}, "SessionEnd");
}

describe("buildApiResponse", () => {
  it("returns null for non-api paths", () => {
    expect(buildApiResponse(root, "/")).toBeNull();
    expect(buildApiResponse(root, "/index.html")).toBeNull();
  });

  it("lists runs at /api/runs", () => {
    seedRun("sess-1");
    const res = buildApiResponse(root, "/api/runs")!;
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0].sessionId).toBe("sess-1");
    expect(body.runs[0].maxRisk).toBe("critical");
  });

  it("returns a full run at /api/runs/:id", () => {
    seedRun("sess-2");
    const res = buildApiResponse(root, "/api/runs/sess-2")!;
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.run.sessionId).toBe("sess-2");
    expect(body.run.commandsRun).toContain("rm -rf build");
    expect(body.run.events.length).toBeGreaterThan(0);
  });

  it("resolves latest and serves a receipt", () => {
    seedRun("sess-3");
    const res = buildApiResponse(root, "/api/runs/latest/receipt")!;
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.receipt.goal).toBe("fix the bug");
    expect(body.receipt.nextRecommendedAction).toMatch(/do not auto-merge/i);
  });

  it("404s an unknown run", () => {
    const res = buildApiResponse(root, "/api/runs/nope")!;
    expect(res.status).toBe(404);
  });
});
