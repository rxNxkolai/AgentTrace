import { startServer } from "../mcp/server.js";

/**
 * Run the AgentTrace MCP stdio server. `startServer` keeps the process alive by
 * resuming stdin, so returning 0 here just sets a clean default exit code.
 */
export function runMcp(root: string): number {
  startServer(root);
  return 0;
}
