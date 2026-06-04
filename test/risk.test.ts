import { describe, it, expect } from "vitest";
import { assessRisk } from "../src/risk/engine.js";
import type { AgentTraceEvent, EventType } from "../src/schema/types.js";

function ev(type: EventType, data: Record<string, unknown>, extra: Partial<AgentTraceEvent> = {}): AgentTraceEvent {
  return {
    v: 1,
    ts: "2026-06-03T00:00:00.000Z",
    seq: 0,
    type,
    sessionId: "s",
    source: "claude-code",
    hookEvent: "PostToolUse",
    title: extra.title ?? "",
    data,
    sourcePayloadSanitized: {},
    risk: null,
    ...extra,
  };
}

describe("assessRisk", () => {
  it("flags rm -rf as critical", () => {
    const events = [ev("command", { command: "rm -rf build" })];
    const s = assessRisk(events);
    expect(s.max).toBe("critical");
    expect(events[0]!.risk).toBe("critical");
  });

  it("flags .env writes and reads as critical", () => {
    expect(assessRisk([ev("file_change", { path: ".env" })]).max).toBe("critical");
    expect(
      assessRisk([ev("tool_call", { tool: "Read", path: "config/.env.local" })]).max,
    ).toBe("critical");
  });

  it("flags auth file changes as high and docs as low", () => {
    expect(assessRisk([ev("file_change", { path: "src/middleware/auth.ts" })]).max).toBe("high");
    expect(assessRisk([ev("file_change", { path: "docs/readme.md" })]).max).toBe("low");
  });

  it("flags dependency install and lockfile as medium", () => {
    expect(assessRisk([ev("command", { command: "npm install left-pad" })]).max).toBe("medium");
    expect(assessRisk([ev("file_change", { path: "package-lock.json" })]).max).toBe("medium");
  });

  it("detects redacted secrets in command output as high", () => {
    const s = assessRisk([ev("command", { command: "printenv", stdout: "TOKEN=[REDACTED]" })]);
    expect(s.max).toBe("high");
  });

  it("returns safe when nothing matches and counts findings", () => {
    const s = assessRisk([ev("prompt", { prompt: "hello" })]);
    expect(s.max).toBe("safe");
    expect(s.findings.length).toBe(0);
  });

  it("takes the most severe level for an event matching multiple rules", () => {
    // 'rm -rf' is critical; a plain 'rm' would be high — critical must win
    const events = [ev("command", { command: "rm -rf node_modules && npm install" })];
    const s = assessRisk(events);
    expect(events[0]!.risk).toBe("critical");
    expect(s.max).toBe("critical");
  });
});
