import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleRpc } from "../src/mcp/server.js";
import type { AgentTraceEvent, EventType } from "../src/schema/types.js";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "agenttrace-mcp-test-"));
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
    source: "shell",
    hookEvent,
    title: `${type}`,
    data,
    sourcePayloadSanitized: {},
    risk: null,
  };
  fs.writeFileSync(path.join(dir, `${ts.replace(/[:.]/g, "-")}-${counter++}.json`), JSON.stringify(e));
}

/** Parse the JSON text payload out of a tools/call result. */
function parseToolText(res: any): any {
  return JSON.parse(res.result.content[0].text);
}

describe("handleRpc", () => {
  it("initialize returns serverInfo.name agenttrace", () => {
    const res = handleRpc(root, { jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(res.result.serverInfo.name).toBe("agenttrace");
    expect(res.result.protocolVersion).toBe("2024-11-05");
  });

  it("tools/list returns the 3 tools with expected names", () => {
    const res = handleRpc(root, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const names = res.result.tools.map((t: any) => t.name);
    expect(names).toHaveLength(3);
    expect(names).toEqual(expect.arrayContaining(["list_runs", "get_receipt", "query_risk"]));
  });

  it("tools/call query_risk flags rm -rf build as critical", () => {
    const res = handleRpc(root, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "query_risk", arguments: { command: "rm -rf build" } },
    });
    const summary = parseToolText(res);
    expect(summary.max).toBe("critical");
  });

  it("tools/call list_runs returns an array against a temp store", () => {
    write("aaa-run", "run_start", "2026-06-03T09:00:00.000Z", {}, "SessionStart");
    write("aaa-run", "run_end", "2026-06-03T09:01:00.000Z", {}, "SessionEnd");
    write("bbb-run", "run_start", "2026-06-03T10:00:00.000Z", {}, "SessionStart");
    write("bbb-run", "run_end", "2026-06-03T10:01:00.000Z", {}, "SessionEnd");

    const res = handleRpc(root, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "list_runs", arguments: {} },
    });
    const runs = parseToolText(res);
    expect(Array.isArray(runs)).toBe(true);
    expect(runs.length).toBe(2);
  });

  it("tools/call with an unknown tool name returns isError true", () => {
    const res = handleRpc(root, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "does_not_exist", arguments: {} },
    });
    expect(res.result.isError).toBe(true);
  });

  it("unknown method returns error code -32601", () => {
    const res = handleRpc(root, { jsonrpc: "2.0", id: 6, method: "bogus/method" });
    expect(res.error.code).toBe(-32601);
  });

  it("returns null for a notification (no id)", () => {
    const res = handleRpc(root, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res).toBeNull();
  });
});
