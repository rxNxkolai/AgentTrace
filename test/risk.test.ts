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

  it("flags PowerShell recursive force deletes as critical", () => {
    const events = [ev("command", { command: "Remove-Item -Recurse -Force build" })];
    const s = assessRisk(events);
    expect(s.max).toBe("critical");
    expect(events[0]!.risk).toBe("critical");
    expect(s.findings[0]!.rule).toBe("powershell-recursive-force-delete");
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

  it("flags outbound side-effectful network calls as high + irreversible", () => {
    for (const cmd of ["git push origin feature", "vercel deploy --prod", "curl -X POST https://api.x/create"]) {
      const s = assessRisk([ev("command", { command: cmd })]);
      expect(s.max).toBe("high");
      expect(s.findings[0]!.reversibility).toBe("irreversible");
    }
  });

  it("flags writes outside the project dir as medium", () => {
    expect(assessRisk([ev("command", { command: "git config --global user.email a@b.c" })]).max).toBe("medium");
    expect(assessRisk([ev("command", { command: "cp secrets ~/.ssh/key" })]).max).toBe("medium");
  });

  it("grades deletions by git context (tracked = recoverable, untracked = irreversible)", () => {
    const tracked = assessRisk([ev("file_change", { path: "src/a.ts", deleted: true, tracked: true })]);
    expect(tracked.max).toBe("medium");
    expect(tracked.findings[0]!.reversibility).toBe("recoverable");

    const untracked = assessRisk([ev("file_change", { path: "scratch.ts", deleted: true, tracked: false })]);
    expect(untracked.max).toBe("high");
    expect(untracked.findings[0]!.reversibility).toBe("irreversible");
  });

  it("tags reversibility on findings", () => {
    expect(assessRisk([ev("command", { command: "rm -rf build" })]).findings[0]!.reversibility).toBe("irreversible");
    expect(assessRisk([ev("file_change", { path: "docs/x.md" })]).findings[0]!.reversibility).toBe("reversible");
    expect(assessRisk([ev("command", { command: "npm install x" })]).findings[0]!.reversibility).toBe("recoverable");
  });

  it("flags Windows file deletion commands as high", () => {
    expect(assessRisk([ev("command", { command: "Remove-Item file.txt" })]).max).toBe("high");
    expect(assessRisk([ev("command", { command: "ri file.txt" })]).max).toBe("high");
    expect(assessRisk([ev("command", { command: "rmdir build" })]).max).toBe("high");
    expect(assessRisk([ev("command", { command: "rd /s build" })]).max).toBe("high");
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
