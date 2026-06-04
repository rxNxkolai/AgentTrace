import pc from "picocolors";
import type { RiskLevel, RunStatus } from "../schema/types.js";

export function riskColor(level: RiskLevel, text: string): string {
  switch (level) {
    case "critical":
      return pc.bgRed(pc.white(` ${text} `));
    case "high":
      return pc.red(text);
    case "medium":
      return pc.yellow(text);
    case "low":
      return pc.cyan(text);
    default:
      return pc.dim(text);
  }
}

export function statusColor(status: RunStatus, text: string): string {
  switch (status) {
    case "success":
      return pc.green(text);
    case "partial":
      return pc.yellow(text);
    case "failed":
      return pc.red(text);
    case "interrupted":
      return pc.magenta(text);
    default:
      return text;
  }
}

export { pc };
