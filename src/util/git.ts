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

/** Working-tree status as "XY path" porcelain lines (best-effort, empty if not a repo). */
export function gitStatusPorcelain(cwd: string): string[] {
  const out = git(cwd, ["status", "--porcelain"]);
  if (!out) return [];
  return out.split(/\r?\n/).filter((l) => l.trim().length > 0);
}

/**
 * Paths whose working-tree status changed between two porcelain snapshots. Used by `run` to
 * isolate what the wrapped command touched from what was already dirty.
 */
export function changedPathsBetweenStatus(before: string[], after: string[]): string[] {
  const norm = (line: string) => line.slice(3).trim().replace(/^"|"$/g, "");
  const beforeSet = new Set(before);
  const changed = new Set<string>();
  for (const line of after) {
    if (!beforeSet.has(line)) changed.add(norm(line));
  }
  return [...changed].filter((p) => p.length > 0);
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
