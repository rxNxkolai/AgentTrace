import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseGithubActions } from "../src/adapters/github-actions.js";
import { parseN8n } from "../src/adapters/n8n.js";
import { runImport } from "../src/commands/import.js";
import { readRun, listRuns } from "../src/trace/read.js";

const GHA = {
  databaseId: 123,
  displayTitle: "CI",
  headBranch: "main",
  status: "completed",
  conclusion: "failure",
  createdAt: "2026-06-06T10:00:00.000Z",
  updatedAt: "2026-06-06T10:05:00.000Z",
  jobs: [
    {
      name: "build",
      steps: [
        { name: "checkout", conclusion: "success", startedAt: "2026-06-06T10:00:01.000Z" },
        { name: "test", conclusion: "failure", startedAt: "2026-06-06T10:00:30.000Z", completedAt: "2026-06-06T10:04:00.000Z" },
      ],
    },
  ],
};

const N8N = {
  id: 55,
  workflowData: { name: "Nightly Sync" },
  startedAt: "2026-06-06T02:00:00.000Z",
  stoppedAt: "2026-06-06T02:00:09.000Z",
  finished: true,
  data: {
    resultData: {
      runData: {
        "HTTP Request": [{ startTime: 1717639200000, executionStatus: "success" }],
        Code: [{ startTime: 1717639205000, executionStatus: "error", error: { message: "boom" } }],
      },
    },
  },
};

describe("parseGithubActions", () => {
  it("maps a run + steps + failure", () => {
    const { runId, events } = parseGithubActions(GHA);
    expect(runId).toBe("gha-123");
    expect(events[0]!.type).toBe("run_start");
    expect(events.some((e) => e.type === "command" && e.data.command === "test")).toBe(true);
    expect(events.some((e) => e.type === "error")).toBe(true);
    expect(events.at(-1)!.type).toBe("run_end");
    expect(events.at(-1)!.data.status).toBe("failed");
  });
  it("does not throw on empty input", () => {
    expect(() => parseGithubActions({})).not.toThrow();
    expect(() => parseGithubActions(null)).not.toThrow();
  });
});

describe("parseN8n", () => {
  it("maps a workflow + nodes + node error", () => {
    const { runId, events } = parseN8n(N8N);
    expect(runId).toBe("n8n-55");
    expect(events.some((e) => e.type === "command" && e.data.command === "HTTP Request")).toBe(true);
    expect(events.some((e) => e.type === "error" && String(e.data.message).includes("boom"))).toBe(true);
    expect(events.at(-1)!.type).toBe("run_end");
  });
  it("does not throw on empty input", () => {
    expect(() => parseN8n({})).not.toThrow();
  });
});

describe("runImport", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "agenttrace-import-test-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("imports a github-actions file into a readable run", () => {
    const f = path.join(root, "gha.json");
    fs.writeFileSync(f, JSON.stringify(GHA));
    expect(runImport(root, f, "github-actions")).toBe(0);
    const run = readRun(root, listRuns(root)[0]!.sessionId);
    expect(run.source).toBe("github-actions");
    expect(run.status).toBe("failed");
  });

  it("imports an n8n file", () => {
    const f = path.join(root, "n8n.json");
    fs.writeFileSync(f, JSON.stringify(N8N));
    expect(runImport(root, f, "n8n")).toBe(0);
    const run = readRun(root, listRuns(root)[0]!.sessionId);
    expect(run.source).toBe("n8n");
  });

  it("rejects an unknown adapter and a missing file", () => {
    expect(runImport(root, "x.json", "bogus")).toBe(1);
    expect(runImport(root, path.join(root, "nope.json"), "n8n")).toBe(1);
  });
});
