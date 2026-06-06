import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runRun } from "../src/commands/run.js";
import { listRuns, readRun } from "../src/trace/read.js";

let root: string;
let cwd: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "agenttrace-run-test-"));
  cwd = process.cwd();
  process.chdir(root);
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  process.chdir(cwd);
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("runRun", () => {
  it("records a successful command with output", async () => {
    const code = await runRun(root, ["node", "-e", "console.log('hi from child')"]);
    expect(code).toBe(0);
    const runs = listRuns(root);
    expect(runs).toHaveLength(1);
    const run = readRun(root, runs[0]!.sessionId);
    expect(run.source).toBe("shell");
    expect(run.status).toBe("success");
    expect(run.commandsRun[0]).toContain("node");
    const cmdEvent = run.events.find((e) => e.type === "command")!;
    expect(String(cmdEvent.data.stdout)).toContain("hi from child");
    expect(cmdEvent.data.exitCode).toBe(0);
  });

  it("records a failed command as a failed run", async () => {
    const code = await runRun(root, ["node", "-e", "process.exit(3)"]);
    expect(code).toBe(3);
    const run = readRun(root, listRuns(root)[0]!.sessionId);
    expect(run.status).toBe("failed");
    expect(run.failedSteps.length).toBe(1);
  });

  it("returns 1 and records a spawn error for a missing binary", async () => {
    const code = await runRun(root, ["definitely-not-a-real-binary-xyz"]);
    expect(code).toBe(1);
    const run = readRun(root, listRuns(root)[0]!.sessionId);
    expect(run.status).toBe("failed");
  });

  it("rejects an empty command", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runRun(root, [])).toBe(1);
  });
});
