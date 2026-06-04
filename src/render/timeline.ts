import type { Run } from "../schema/types.js";
import { riskColor, statusColor, pc } from "./colors.js";

const TYPE_GLYPH: Record<string, string> = {
  run_start: "▶",
  prompt: "✎",
  tool_call: "•",
  command: "$",
  file_change: "±",
  error: "✗",
  permission: "?",
  subagent: "⎇",
  stop: "■",
  run_end: "◀",
  passthrough: "·",
};

function clockOf(iso: string): string {
  const t = iso.indexOf("T");
  return t >= 0 ? iso.slice(t + 1, t + 13) : iso;
}

/** Render a full run timeline for `show`. */
export function renderTimeline(run: Run): string {
  const lines: string[] = [];
  lines.push(pc.bold(`Run ${run.sessionId}`));
  lines.push(
    `  status ${statusColor(run.status, run.status)}  ·  segments ${run.segments.length}  ·  ` +
      `files ${run.filesChanged.length}  ·  commands ${run.commandsRun.length}  ·  risk ${riskColor(run.risk.max, run.risk.max)}`,
  );
  if (run.prompts[0]) lines.push("  goal: " + pc.italic(truncate(run.prompts[0], 100)));
  lines.push("");

  for (const e of run.events) {
    const glyph = TYPE_GLYPH[e.type] ?? "·";
    const time = pc.dim(clockOf(e.ts));
    const tag = e.risk ? " " + riskColor(e.risk, e.risk) : "";
    lines.push(`  ${time} ${glyph} ${truncate(e.title, 100)}${tag}`);
  }

  if (run.events.length === 0) {
    lines.push(pc.dim("  (no events captured)"));
  }
  return lines.join("\n");
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
