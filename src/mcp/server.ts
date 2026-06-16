/**
 * AgentTrace MCP (Model Context Protocol) stdio server.
 *
 * Zero npm dependencies. Implements JSON-RPC 2.0 over newline-delimited JSON
 * on stdin/stdout (the MCP stdio transport: one JSON message per line).
 *
 * The request logic lives in `handleRpc`, a pure function so it can be unit
 * tested without spinning up a process. `startServer` wires stdin/stdout to it.
 */
import { listRuns, readRun, resolveRunId } from "../trace/read.js";
import { generateReceipt } from "../receipt/generate.js";
import { assessRisk } from "../risk/engine.js";
import type { AgentTraceEvent } from "../schema/types.js";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "agenttrace";
const SERVER_VERSION = "0.7.0";

/** The tool catalog advertised via tools/list. */
const TOOLS = [
  {
    name: "list_runs",
    description:
      "List recorded AgentTrace runs (newest first). Returns an array of run summaries.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_receipt",
    description:
      "Generate a review receipt for a recorded run (a run id, prefix, or \"latest\").",
    inputSchema: {
      type: "object",
      properties: {
        run: { type: "string" },
      },
      required: ["run"],
    },
  },
  {
    name: "query_risk",
    description:
      "Assess how risky a shell command is before running it. Returns the risk summary (max, counts, findings).",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string" },
      },
      required: ["command"],
    },
  },
] as const;

/** Wrap a value as a tools/call text-content result. */
function textResult(value: unknown, isError = false): Record<string, unknown> {
  const result: Record<string, unknown> = {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
  if (isError) result["isError"] = true;
  return result;
}

/** Dispatch a tools/call by tool name. Never throws. */
function callTool(root: string, name: string, args: Record<string, unknown>): Record<string, unknown> {
  try {
    if (name === "list_runs") {
      const limit = typeof args["limit"] === "number" ? (args["limit"] as number) : undefined;
      return textResult(listRuns(root, limit));
    }

    if (name === "get_receipt") {
      const run = String(args["run"] ?? "");
      const id = resolveRunId(root, run);
      if (!id) {
        return textResult(`no run matching ${run}`, true);
      }
      return textResult(generateReceipt(readRun(root, id)));
    }

    if (name === "query_risk") {
      const command = String(args["command"] ?? "");
      const event: AgentTraceEvent = {
        v: 1,
        ts: new Date().toISOString(),
        seq: 0,
        type: "command",
        sessionId: "query",
        source: "shell",
        hookEvent: "query",
        title: command,
        data: { command },
        sourcePayloadSanitized: {},
        risk: null,
      };
      return textResult(assessRisk([event]));
    }

    return textResult(`unknown tool: ${name}`, true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return textResult(`tool error: ${message}`, true);
  }
}

/**
 * Handle a single parsed JSON-RPC request. Pure and total: returns the response
 * object, or `null` for notifications (no `id`). Never throws.
 */
export function handleRpc(root: string, req: any): any | null {
  const id = req && typeof req === "object" ? req.id : undefined;
  const method = req && typeof req === "object" ? req.method : undefined;
  const params = (req && typeof req === "object" && req.params) || {};

  // Notifications (no id) get no response.
  const isNotification = id === undefined || id === null;

  try {
    if (method === "initialize") {
      if (isNotification) return null;
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      };
    }

    if (method === "tools/list") {
      if (isNotification) return null;
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    }

    if (method === "tools/call") {
      if (isNotification) return null;
      const name = String(params.name ?? "");
      const args = (params.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<
        string,
        unknown
      >;
      const result = callTool(root, name, args);
      return { jsonrpc: "2.0", id, result };
    }

    // Notifications for unknown methods are silently ignored.
    if (isNotification) return null;

    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found" },
    };
  } catch (err) {
    if (isNotification) return null;
    const message = err instanceof Error ? err.message : String(err);
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: `Internal error: ${message}` },
    };
  }
}

/**
 * Start the stdio MCP server. Reads newline-delimited JSON requests from stdin,
 * writes one JSON response per line to stdout. Keeps the process alive via stdin.
 */
export function startServer(root: string = process.cwd()): void {
  process.stdin.setEncoding("utf8");

  let buffer = "";

  const processLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return; // guard against blank lines
    let req: unknown;
    try {
      req = JSON.parse(trimmed);
    } catch {
      // Parse error on a non-blank line: emit a JSON-RPC parse error.
      process.stdout.write(
        JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n",
      );
      return;
    }
    const res = handleRpc(root, req);
    if (res !== null) {
      process.stdout.write(JSON.stringify(res) + "\n");
    }
  };

  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      processLine(line);
    }
  });

  process.stdin.on("end", () => {
    // Flush any trailing partial line that lacked a newline.
    if (buffer.length > 0) {
      processLine(buffer);
      buffer = "";
    }
  });

  process.stdin.resume();
}
