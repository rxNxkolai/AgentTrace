import { execFileSync } from "node:child_process";

function git(cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 4000,
    }).trim();
  } catch {
    return undefined;
  }
}

export function gitBranch(cwd: string): string | undefined {
  return git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
}

export function gitHead(cwd: string): string | undefined {
  return git(cwd, ["rev-parse", "--short", "HEAD"]);
}

/** Supplemental: files changed between two commits (best-effort). */
export function changedFilesBetween(
  cwd: string,
  before?: string,
  after?: string,
): string[] {
  if (!before || !after || before === after) return [];
  const out = git(cwd, ["diff", "--name-only", `${before}..${after}`]);
  if (!out) return [];
  return out.split(/\r?\n/).filter((l) => l.trim().length > 0);
}
