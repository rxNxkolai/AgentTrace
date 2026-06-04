import type { RunSummary } from "../trace/read.js";
import { riskColor, statusColor, pc } from "./colors.js";

function fmtDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${s % 60}s` : `${s}s`;
}

function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) : id;
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return iso.replace("T", " ").replace(/\.\d+Z$/, "").replace("Z", "");
}

function pad(text: string, width: number): string {
  // pad based on visible length (text here is pre-color)
  if (text.length >= width) return text;
  return text + " ".repeat(width - text.length);
}

/** Render the `list` table. Receives plain summaries; applies color per cell. */
export function renderRunTable(summaries: RunSummary[]): string {
  if (summaries.length === 0) {
    return pc.dim("No runs recorded yet. Run a Claude Code session in this repo, then try again.");
  }
  const header =
    pad("RUN", 13) +
    pad("STATUS", 12) +
    pad("STARTED", 21) +
    pad("DUR", 8) +
    pad("FILES", 7) +
    pad("CMDS", 6) +
    "RISK";
  const rows = summaries.map((s) => {
    const id = pad(shortId(s.sessionId), 13);
    const status = statusColor(s.status, pad(s.status, 12));
    const started = pad(fmtDate(s.startedAt), 21);
    const dur = pad(fmtDuration(s.durationMs), 8);
    const files = pad(String(s.fileCount), 7);
    const cmds = pad(String(s.commandCount), 6);
    const risk = riskColor(s.maxRisk, s.maxRisk);
    return id + status + started + dur + files + cmds + risk;
  });
  return [pc.bold(header), ...rows].join("\n");
}
