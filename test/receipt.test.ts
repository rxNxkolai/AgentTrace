import { describe, it, expect } from "vitest";
import { generateReceipt, renderReceiptMarkdown } from "../src/receipt/generate.js";
import { assessRisk } from "../src/risk/engine.js";
import type { AgentTraceEvent, EventType, Run } from "../src/schema/types.js";

function ev(type: EventType, data: Record<string, unknown>, hookEvent = "PostToolUse"): AgentTraceEvent {
  return {
    v: 1, ts: "2026-06-03T10:00:00.000Z", seq: 0, type, sessionId: "s",
    source: "claude-code", hookEvent, title: type, data, sourcePayloadSanitized: {}, risk: null,
  };
}

function runFrom(events: AgentTraceEvent[], status: Run["status"]): Run {
  const risk = assessRisk(events);
  return {
    sessionId: "s", source: "claude-code", segments: [], startedAt: events[0]?.ts,
    endedAt: events[events.length - 1]?.ts, status, durationMs: 492000, events,
    filesChanged: events.filter((e) => e.type === "file_change").map((e) => String(e.data.path)),
    commandsRun: events.filter((e) => e.type === "command").map((e) => String(e.data.command)),
    failedSteps: events.filter((e) => e.type === "error").map((e) => e.title),
    prompts: events.filter((e) => e.type === "prompt").map((e) => String(e.data.prompt)),
    risk,
  };
}

describe("generateReceipt", () => {
  it("derives goal, risky actions, checklist, and recommendation", () => {
    const events = [
      ev("prompt", { prompt: "fix the login bug and run tests" }, "UserPromptSubmit"),
      ev("file_change", { path: "src/middleware/auth.ts" }),
      ev("file_change", { path: "package-lock.json" }),
      ev("command", { command: "npm test" }),
    ];
    const r = generateReceipt(runFrom(events, "success"));
    expect(r.goal).toBe("fix the login bug and run tests");
    expect(r.filesChanged).toContain("src/middleware/auth.ts");
    expect(r.riskyActions.some((f) => f.level === "high")).toBe(true);
    expect(r.nextRecommendedAction).toMatch(/high-risk/i);
    expect(r.reviewChecklist.length).toBeGreaterThan(0);
  });

  it("warns hard on a critical action", () => {
    const events = [ev("command", { command: "rm -rf /" })];
    const r = generateReceipt(runFrom(events, "success"));
    expect(r.nextRecommendedAction).toMatch(/do not auto-merge/i);
  });

  it("renders sanitized markdown with the standard sections", () => {
    const events = [ev("prompt", { prompt: "do a thing" }, "UserPromptSubmit")];
    const md = renderReceiptMarkdown(generateReceipt(runFrom(events, "success")));
    expect(md).toContain("# AgentTrace Receipt");
    expect(md).toContain("## Goal");
    expect(md).toContain("## Risk Flags");
    expect(md).toContain("## Review Checklist");
    expect(md).toContain("## Final Recommendation");
  });
});
