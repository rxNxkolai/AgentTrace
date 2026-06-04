import fs from "node:fs";
import { VERSION } from "../version.js";
import { assetPath } from "../util/pkg.js";
import { exists, readJson, writeJson } from "../util/fs.js";
import {
  agenttraceDir,
  claudeSettingsLocalPath,
  configPath,
  runtimeHookPath,
} from "../util/paths.js";
import { hooksInstalled, mergeHooks, type ClaudeSettings } from "../settings/claude.js";
import { pc } from "../render/colors.js";

interface Check {
  ok: boolean;
  warn?: boolean;
  label: string;
  detail: string;
  fix?: () => string;
}

interface Config {
  packageVersion?: string;
  nodePath?: string;
}

export function runDoctor(root: string, opts: { fix?: boolean }): number {
  const checks: Check[] = [];

  const dir = agenttraceDir(root);
  const initialized = exists(dir);
  checks.push({
    ok: initialized,
    label: "store",
    detail: initialized ? dir : "not initialized — run `agenttrace init`",
  });

  const writable = initialized && isWritable(dir);
  if (initialized) {
    checks.push({ ok: writable, label: "store writable", detail: writable ? "yes" : "NOT writable" });
  }

  const runtime = runtimeHookPath(root);
  const hasRuntime = exists(runtime);
  checks.push({
    ok: hasRuntime,
    label: "runtime",
    detail: hasRuntime ? runtime : "missing hook.cjs",
    fix: hasRuntime ? undefined : () => copyRuntime(runtime),
  });

  const cfg = readJson<Config>(configPath(root));
  const stale = !!cfg && cfg.packageVersion !== VERSION;
  checks.push({
    ok: !!cfg && !stale,
    warn: stale,
    label: "version",
    detail: !cfg
      ? "no config.json"
      : stale
        ? `runtime installed by v${cfg.packageVersion}, package is v${VERSION} — refresh`
        : `v${VERSION}`,
    fix: stale ? () => copyRuntime(runtime) + " (refreshed)" : undefined,
  });

  if (cfg?.nodePath) {
    const nodeOk = exists(cfg.nodePath);
    checks.push({
      ok: nodeOk,
      warn: !nodeOk,
      label: "node path",
      detail: nodeOk ? cfg.nodePath : `recorded node not found: ${cfg.nodePath} (re-run init)`,
    });
  }

  const settingsPath = claudeSettingsLocalPath(root);
  const settings = readJson<ClaudeSettings>(settingsPath);
  const installed = !!settings && hooksInstalled(settings);
  checks.push({
    ok: installed,
    label: "claude hooks",
    detail: installed ? "registered" : "not registered in settings.local.json",
    fix: installed
      ? undefined
      : () => {
          const s = settings ?? {};
          mergeHooks(s, process.execPath);
          writeJson(settingsPath, s);
          return "hooks re-registered";
        },
  });

  // render
  console.log(pc.bold("AgentTrace doctor"));
  let failed = 0;
  for (const c of checks) {
    const mark = c.ok ? pc.green("✓") : c.warn ? pc.yellow("!") : pc.red("✗");
    if (!c.ok && !c.warn) failed += 1;
    let line = `  ${mark} ${c.label}: ${c.detail}`;
    if (!c.ok && opts.fix && c.fix) {
      try {
        const msg = c.fix();
        line += pc.cyan(`  → fixed: ${msg}`);
        failed = Math.max(0, failed - 1);
      } catch (e) {
        line += pc.red(`  → fix failed: ${(e as Error).message}`);
      }
    }
    console.log(line);
  }
  if (!opts.fix && checks.some((c) => !c.ok)) {
    console.log("");
    console.log(pc.dim("  Run `agenttrace doctor --fix` to repair."));
  }
  return failed > 0 ? 1 : 0;
}

function copyRuntime(dest: string): string {
  fs.copyFileSync(assetPath("hook.cjs"), dest);
  return dest;
}

function isWritable(dir: string): boolean {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
