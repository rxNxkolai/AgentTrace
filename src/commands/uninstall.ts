import fs from "node:fs";
import { readJson, writeJson, exists } from "../util/fs.js";
import { agenttraceDir, claudeSettingsLocalPath, runtimeHookPath } from "../util/paths.js";
import { unmergeHooks, type ClaudeSettings } from "../settings/claude.js";
import { pc } from "../render/colors.js";

export function runUninstall(root: string, opts: { purge?: boolean }): number {
  // 1. remove our hook entries (only ours)
  const settingsPath = claudeSettingsLocalPath(root);
  const settings = readJson<ClaudeSettings>(settingsPath);
  if (settings) {
    unmergeHooks(settings);
    writeJson(settingsPath, settings);
    console.log(pc.green("✓ Removed AgentTrace hooks from settings.local.json"));
  } else {
    console.log(pc.dim("  No settings.local.json found — nothing to unhook."));
  }

  // 2. remove the copied runtime
  const runtime = runtimeHookPath(root);
  if (exists(runtime)) {
    fs.rmSync(runtime, { force: true });
    console.log(pc.green("✓ Removed runtime hook.cjs"));
  }

  // 3. optionally purge the whole store (traces included)
  if (opts.purge) {
    const dir = agenttraceDir(root);
    if (exists(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(pc.yellow("✓ Purged .agenttrace/ (all traces deleted)"));
    }
  } else {
    console.log(pc.dim("  Traces kept under .agenttrace/. Use --purge to delete them."));
  }
  return 0;
}
