import { spawn } from "node:child_process";
import { ensureDir } from "../util/fs.js";
import { runsDir, eventsDirFor } from "../util/paths.js";
import { writeEvent } from "../trace/write.js";
import { readRun } from "../trace/read.js";
import {
  gitBranch,
  gitHead,
  gitStatusPorcelain,
  changedEntriesBetweenStatus,
} from "../util/git.js";
import { pc } from "../render/colors.js";
import { riskColor } from "../render/colors.js";
import { loadPolicy } from "../guard/policy.js";
import { evaluateAction } from "../guard/evaluate.js";

const OUT_CAP = 4096;

/** Keep the tail of streamed output, capped. */
function capTail(buf: string, chunk: string): string {
  const next = buf + chunk;
  return next.length > OUT_CAP ? next.slice(next.length - OUT_CAP) : next;
}

function genRunId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `shell-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

function reconstruct(args: string[]): string {
  // Quote args containing whitespace OR cmd.exe metacharacters (parens, &, |, <, >, ^, quotes),
  // so commands like: node -e "require('fs')..." survive the Windows shell.
  return args
    .map((a) => (/[\s()&|<>^"'`%!]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))
    .join(" ");
}

/** `agenttrace run -- <command>`: record any command as a shell-sourced run. */
export function runRun(root: string, cmd: string[]): Promise<number> {
  return new Promise((resolve) => {
    if (cmd.length === 0) {
      console.error(pc.red("Nothing to run. Usage: agenttrace run -- <command>"));
      resolve(1);
      return;
    }

    ensureDir(runsDir(root));
    const id = genRunId();
    ensureDir(eventsDirFor(root, id));
    const cmdStr = cmd.join(" ");
    const cwd = process.cwd();
    const beforeStatus = gitStatusPorcelain(cwd);
    const startedAt = new Date().toISOString();

    writeEvent(root, id, {
      ts: startedAt,
      type: "run_start",
      source: "shell",
      hookEvent: "run",
      title: `Run: ${cmdStr}`,
      data: { cwd, gitBranch: gitBranch(cwd), commitBefore: gitHead(cwd) },
      sourcePayloadSanitized: {},
      risk: null,
    });

    // Guard: when enabled in block mode, evaluate the command before running it. Fail-open —
    // any error here lets the command proceed (never block legitimate work on a guard bug).
    try {
      const policy = loadPolicy(root);
      if (policy.mode === "block") {
        const d = evaluateAction({ command: cmdStr }, policy);
        if (d.verdict === "block") {
          const ts = new Date().toISOString();
          writeEvent(root, id, {
            ts, type: "permission", source: "shell", hookEvent: "guard",
            title: `Guard blocked: ${cmdStr}`,
            data: { decision: "guard_block", reason: d.reason, level: d.level, command: cmdStr },
            sourcePayloadSanitized: {}, risk: null,
          });
          writeEvent(root, id, {
            ts, type: "run_end", source: "shell", hookEvent: "run",
            title: "Run end (blocked)", data: { blocked: true, exitCode: null },
            sourcePayloadSanitized: {}, risk: null,
          });
          console.error("");
          console.error(pc.bgRed(pc.white(" BLOCKED ")) + " " + pc.red(d.reason));
          console.error(pc.dim(`  ${cmdStr}`));
          console.error(pc.dim("  Not executed. Override: agenttrace guard off  (or add an allow rule in .agenttrace/policy.json)"));
          resolve(2);
          return;
        }
      }
    } catch {
      /* fail-open: guard never prevents a run on its own error */
    }

    const isWin = process.platform === "win32";
    const child = isWin
      ? spawn(reconstruct(cmd), { cwd, shell: true, stdio: ["inherit", "pipe", "pipe"] })
      : spawn(cmd[0]!, cmd.slice(1), { cwd, shell: false, stdio: ["inherit", "pipe", "pipe"] });

    let out = "";
    let err = "";
    child.stdout?.on("data", (d: Buffer) => {
      process.stdout.write(d);
      out = capTail(out, d.toString());
    });
    child.stderr?.on("data", (d: Buffer) => {
      process.stderr.write(d);
      err = capTail(err, d.toString());
    });

    const finish = (code: number, spawnError?: string): void => {
      const endedAt = new Date().toISOString();
      writeEvent(root, id, {
        ts: endedAt,
        type: "command",
        source: "shell",
        hookEvent: "run",
        title: `$ ${cmdStr}`,
        data: {
          command: cmdStr,
          exitCode: code,
          ...(out ? { stdout: out } : {}),
          ...(err ? { stderr: err } : {}),
        },
        sourcePayloadSanitized: {},
        risk: null,
      });

      // file changes attributable to the command (status delta), excluding our own store
      const entries = changedEntriesBetweenStatus(beforeStatus, gitStatusPorcelain(cwd)).filter(
        (e) => !e.path.replace(/\\/g, "/").startsWith(".agenttrace/"),
      );
      for (const { path: p, status } of entries) {
        const deleted = /D/.test(status);
        const tracked = status.trim() !== "??";
        writeEvent(root, id, {
          ts: endedAt,
          type: "file_change",
          source: "shell",
          hookEvent: "run",
          title: `${deleted ? "Deleted" : "Changed"}: ${p}`,
          data: { path: p, gitStatus: status.trim(), deleted, tracked },
          sourcePayloadSanitized: {},
          risk: null,
        });
      }

      if (code !== 0 || spawnError) {
        writeEvent(root, id, {
          ts: endedAt,
          type: "error",
          source: "shell",
          hookEvent: "run",
          title: spawnError ? "Failed to start command" : `Command exited ${code}`,
          data: { message: spawnError ?? `exit code ${code}` },
          sourcePayloadSanitized: {},
          risk: null,
        });
      }

      writeEvent(root, id, {
        ts: endedAt,
        type: "run_end",
        source: "shell",
        hookEvent: "run",
        title: "Run end",
        data: { exitCode: code, commitAfter: gitHead(cwd) },
        sourcePayloadSanitized: {},
        risk: null,
      });

      printSummary(root, id, code);
      resolve(spawnError ? 1 : code);
    };

    child.on("error", (e) => finish(1, e.message));
    child.on("close", (code) => finish(code ?? 0));
  });
}

function printSummary(root: string, id: string, code: number): void {
  const run = readRun(root, id);
  const status = code === 0 ? pc.green("success") : pc.red(`failed (${code})`);
  console.log("");
  console.log(
    pc.dim("agenttrace ") +
      `recorded ${pc.bold(id.slice(0, 22))} · ${status} · ` +
      `${run.filesChanged.length} files · risk ${riskColor(run.risk.max, run.risk.max)}`,
  );
  console.log(pc.dim(`  agenttrace receipt latest   ·   agenttrace ui`));
}
