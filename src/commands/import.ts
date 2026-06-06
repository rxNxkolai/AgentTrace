import fs from "node:fs";
import { ensureDir } from "../util/fs.js";
import { runsDir, eventsDirFor } from "../util/paths.js";
import { writeEvent } from "../trace/write.js";
import { readRun } from "../trace/read.js";
import { parseGithubActions, type ImportResult } from "../adapters/github-actions.js";
import { parseN8n } from "../adapters/n8n.js";
import { pc, riskColor, statusColor } from "../render/colors.js";

const ADAPTERS: Record<string, (input: unknown) => ImportResult> = {
  "github-actions": parseGithubActions,
  n8n: parseN8n,
};

export function runImport(root: string, file: string, adapter: string): number {
  const parse = ADAPTERS[adapter];
  if (!parse) {
    console.error(pc.red(`Unknown adapter "${adapter}". Available: ${Object.keys(ADAPTERS).join(", ")}`));
    return 1;
  }

  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    console.error(pc.red(`Cannot read file: ${file}`));
    return 1;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    console.error(pc.red(`Not valid JSON: ${(e as Error).message}`));
    return 1;
  }

  let result: ImportResult;
  try {
    result = parse(json);
  } catch (e) {
    console.error(pc.red(`Failed to parse ${adapter} export: ${(e as Error).message}`));
    return 1;
  }

  ensureDir(runsDir(root));
  ensureDir(eventsDirFor(root, result.runId));
  for (const event of result.events) {
    writeEvent(root, result.runId, event);
  }

  const run = readRun(root, result.runId);
  console.log(pc.green(`✓ Imported ${adapter} run ${pc.bold(result.runId)}`));
  console.log(
    `  ${statusColor(run.status, run.status)} · ${run.events.length} events · ` +
      `risk ${riskColor(run.risk.max, run.risk.max)}`,
  );
  console.log(pc.dim(`  agenttrace show ${result.runId}   ·   agenttrace receipt ${result.runId}`));
  return 0;
}
