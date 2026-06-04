import fs from "node:fs";
import path from "node:path";
import { VERSION } from "../version.js";
import { assetPath } from "../util/pkg.js";
import { ensureDir, exists, readJson, writeJson } from "../util/fs.js";
import {
  agenttraceDir,
  claudeSettingsLocalPath,
  configPath,
  gitignorePath,
  receiptsDir,
  runsDir,
  runtimeDir,
  runtimeHookPath,
} from "../util/paths.js";
import { mergeHooks, REGISTERED_EVENTS, type ClaudeSettings } from "../settings/claude.js";
import { pc } from "../render/colors.js";

export interface InitResult {
  root: string;
  runtimeCopied: string;
  settingsPath: string;
  registeredEvents: readonly string[];
  gitignoreUpdated: boolean;
}

export function runInit(root: string = process.cwd()): InitResult {
  ensureDir(agenttraceDir(root));
  ensureDir(runsDir(root));
  ensureDir(runtimeDir(root));
  ensureDir(receiptsDir(root));

  // 1. copy the self-contained runtime
  const src = assetPath("hook.cjs");
  const dest = runtimeHookPath(root);
  fs.copyFileSync(src, dest);

  // 2. merge hooks into .claude/settings.local.json (idempotent, never clobbers user hooks)
  const settingsPath = claudeSettingsLocalPath(root);
  ensureDir(path.dirname(settingsPath));
  const settings = readJson<ClaudeSettings>(settingsPath) ?? {};
  mergeHooks(settings, process.execPath);
  writeJson(settingsPath, settings);

  // 3. record install metadata for `doctor`
  writeJson(configPath(root), {
    packageVersion: VERSION,
    nodePath: process.execPath,
    installedAt: new Date().toISOString(),
    registeredEvents: REGISTERED_EVENTS,
  });

  // 4. gitignore the local trace store
  const gitignoreUpdated = ensureGitignored(root);

  return {
    root,
    runtimeCopied: dest,
    settingsPath,
    registeredEvents: REGISTERED_EVENTS,
    gitignoreUpdated,
  };
}

function ensureGitignored(root: string): boolean {
  const file = gitignorePath(root);
  const entry = ".agenttrace/";
  if (exists(file)) {
    const content = fs.readFileSync(file, "utf8");
    const has = content.split(/\r?\n/).some((l) => l.trim() === entry || l.trim() === ".agenttrace");
    if (has) return false;
    const sep = content.endsWith("\n") || content.length === 0 ? "" : "\n";
    fs.appendFileSync(file, `${sep}\n# AgentTrace local traces\n${entry}\n`, "utf8");
    return true;
  }
  fs.writeFileSync(file, `# AgentTrace local traces\n${entry}\n`, "utf8");
  return true;
}

export function printInit(result: InitResult): void {
  console.log(pc.bold(pc.green("✓ AgentTrace initialized")));
  console.log("");
  console.log(`  store    ${pc.dim(agenttraceDir(result.root))}`);
  console.log(`  runtime  ${pc.dim(result.runtimeCopied)}`);
  console.log(`  hooks    ${pc.dim(result.settingsPath)} (${result.registeredEvents.length} events)`);
  console.log(`  gitignore ${result.gitignoreUpdated ? "updated" : "already covered"}`);
  console.log("");
  console.log(pc.yellow("  ⚠ Privacy: AgentTrace records prompts, commands, and file-change"));
  console.log(pc.yellow("    metadata locally under .agenttrace/. Raw traces may contain"));
  console.log(pc.yellow("    sensitive data — they are gitignored by default. Review before"));
  console.log(pc.yellow("    sharing or exporting."));
  console.log("");
  console.log(`  Next: run a Claude Code session here, then ${pc.cyan("agenttrace receipt latest")}`);
}
