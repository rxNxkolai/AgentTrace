import fs from "node:fs";
import path from "node:path";
import { SCHEMA_VERSION, type AgentTraceEvent } from "../schema/types.js";
import { eventsDirFor } from "../util/paths.js";

let seq = 0;

/**
 * Write one event to a run's events dir using the same atomic temp-then-rename scheme as the
 * capture runtime. Used by adapters that produce events in-process (e.g. `agenttrace run`).
 */
export function writeEvent(
  root: string,
  sessionId: string,
  event: Omit<AgentTraceEvent, "v" | "seq" | "sessionId">,
): void {
  const full: AgentTraceEvent = {
    v: SCHEMA_VERSION,
    seq: seq++,
    sessionId,
    ...event,
  };
  const dir = eventsDirFor(root, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const rand = Math.random().toString(36).slice(2, 8);
  const base = `${full.ts.replace(/[:.]/g, "-")}-${String(full.seq).padStart(4, "0")}-${full.hookEvent}-${rand}`;
  const tmp = path.join(dir, `.tmp-${rand}-${base}`);
  const dest = path.join(dir, `${base}.json`);
  fs.writeFileSync(tmp, JSON.stringify(full), "utf8");
  fs.renameSync(tmp, dest);
}
