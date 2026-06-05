import type { AgentTraceEvent, RiskLevel } from "../schema/types.js";

export interface RiskRule {
  name: string;
  level: RiskLevel;
  test: (event: AgentTraceEvent) => boolean;
  message: (event: AgentTraceEvent) => string;
}

function command(event: AgentTraceEvent): string {
  const c = event.data?.["command"];
  return typeof c === "string" ? c : "";
}
function pathOf(event: AgentTraceEvent): string {
  const p = event.data?.["path"];
  return typeof p === "string" ? p : "";
}
function normPath(event: AgentTraceEvent): string {
  return pathOf(event).replace(/\\/g, "/");
}
function stdoutErr(event: AgentTraceEvent): string {
  const o = event.data?.["stdout"];
  const e = event.data?.["stderr"];
  return `${typeof o === "string" ? o : ""}\n${typeof e === "string" ? e : ""}`;
}
function isCommand(event: AgentTraceEvent): boolean {
  return event.type === "command";
}
function isFileChange(event: AgentTraceEvent): boolean {
  return event.type === "file_change";
}
function isRead(event: AgentTraceEvent): boolean {
  return event.type === "tool_call" && event.data?.["tool"] === "Read";
}

const RM_RECURSIVE_FORCE = /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r|\brm\s+-rf\b/;
const POWERSHELL_RECURSIVE_FORCE_DELETE =
  /\b(?:remove-item|ri)\b(?=[^\n]*\s-recurse\b)(?=[^\n]*\s-force\b)/i;
const FILE_DELETE_COMMAND =
  /\brm\s+(?!-[a-z]*[rf])|\bgit\s+rm\b|\bdel\s+|\b(?:remove-item|ri)\b|\brmdir\b|\brd\s+\/s\b/i;

export const RISK_RULES: RiskRule[] = [
  // ---- critical ----
  {
    name: "destructive-recursive-delete",
    level: "critical",
    test: (e) => isCommand(e) && RM_RECURSIVE_FORCE.test(command(e)),
    message: () => "Recursive force-delete (rm -rf) executed.",
  },
  {
    name: "powershell-recursive-force-delete",
    level: "critical",
    test: (e) => isCommand(e) && POWERSHELL_RECURSIVE_FORCE_DELETE.test(command(e)),
    message: () => "Recursive force-delete (Remove-Item -Recurse -Force) executed.",
  },
  {
    name: "env-file-write",
    level: "critical",
    test: (e) => isFileChange(e) && /(^|\/)\.env(\.[\w-]+)?$/.test(normPath(e)),
    message: (e) => `.env file written: ${pathOf(e)}`,
  },
  {
    name: "env-file-read",
    level: "critical",
    test: (e) => isRead(e) && /(^|\/)\.env(\.[\w-]+)?$/.test(normPath(e)),
    message: (e) => `.env file read: ${pathOf(e)}`,
  },
  {
    name: "push-to-main",
    level: "critical",
    test: (e) => isCommand(e) && /git\s+push\b[^\n]*\b(main|master)\b/.test(command(e)),
    message: () => "Pushed to main/master branch.",
  },
  {
    name: "package-publish",
    level: "critical",
    test: (e) => isCommand(e) && /\b(npm|yarn|pnpm)\s+publish\b/.test(command(e)),
    message: () => "Package publish command executed.",
  },
  {
    name: "destructive-db",
    level: "critical",
    test: (e) => isCommand(e) && /\b(drop\s+(table|database)|truncate\s+table)\b/i.test(command(e)),
    message: () => "Destructive database command (DROP/TRUNCATE).",
  },
  // ---- high ----
  {
    name: "secret-in-output",
    level: "high",
    test: (e) => isCommand(e) && /\[REDACTED\]/.test(stdoutErr(e)),
    message: () => "A secret-like value was detected (and redacted) in command output.",
  },
  {
    name: "file-deletion",
    level: "high",
    test: (e) => isCommand(e) && FILE_DELETE_COMMAND.test(command(e)),
    message: () => "File deletion command executed.",
  },
  {
    name: "auth-files-touched",
    level: "high",
    test: (e) => isFileChange(e) && /(auth|session|middleware|login|password|credential)/i.test(normPath(e)),
    message: (e) => `Auth/session-related file changed: ${pathOf(e)}`,
  },
  {
    name: "migration-touched",
    level: "high",
    test: (e) => isFileChange(e) && /(^|\/)migrations?\//i.test(normPath(e)),
    message: (e) => `Database migration changed: ${pathOf(e)}`,
  },
  {
    name: "ci-cd-touched",
    level: "high",
    test: (e) => isFileChange(e) && /(\.github\/workflows\/|\.gitlab-ci|\bDockerfile\b|\.circleci\/)/i.test(normPath(e)),
    message: (e) => `CI/CD configuration changed: ${pathOf(e)}`,
  },
  // ---- medium ----
  {
    name: "dependency-install",
    level: "medium",
    test: (e) => isCommand(e) && /\b((npm|pnpm)\s+(install|add|i)\b|yarn\s+add\b|pip\s+install\b|poetry\s+add\b)/.test(command(e)),
    message: () => "Dependencies installed/added.",
  },
  {
    name: "lockfile-changed",
    level: "medium",
    test: (e) => isFileChange(e) && /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock)$/.test(normPath(e)),
    message: (e) => `Lockfile changed: ${pathOf(e)}`,
  },
  {
    name: "config-changed",
    level: "medium",
    test: (e) => isFileChange(e) && /(\.config\.(js|ts|cjs|mjs|json)$|(^|\/)(tsconfig|vite\.config|next\.config|webpack\.config)|\.(ya?ml|toml)$|(routes?|middleware)\/)/i.test(normPath(e)),
    message: (e) => `Configuration/routing file changed: ${pathOf(e)}`,
  },
  {
    name: "test-failure",
    level: "medium",
    test: (e) => e.type === "error" && /test|spec|assert|expect/i.test(`${event_title(e)} ${event_message(e)}`),
    message: () => "A test/assertion-related failure occurred.",
  },
  // ---- low ----
  {
    name: "docs-changed",
    level: "low",
    test: (e) => isFileChange(e) && /(\.(md|mdx|txt|rst)$|(^|\/)docs\/)/i.test(normPath(e)),
    message: (e) => `Docs changed: ${pathOf(e)}`,
  },
  {
    name: "formatting",
    level: "low",
    test: (e) => isCommand(e) && /(prettier|eslint\s+--fix|black\b|gofmt|rustfmt)/.test(command(e)),
    message: () => "Formatting/lint-fix command run.",
  },
  {
    name: "test-run",
    level: "low",
    test: (e) => isCommand(e) && /(\bnpm\s+test\b|\bvitest\b|\bjest\b|\bpytest\b|\bgo\s+test\b|\bcargo\s+test\b)/.test(command(e)),
    message: () => "Test suite run.",
  },
];

function event_title(e: AgentTraceEvent): string {
  return e.title || "";
}
function event_message(e: AgentTraceEvent): string {
  const m = e.data?.["message"];
  return typeof m === "string" ? m : "";
}
