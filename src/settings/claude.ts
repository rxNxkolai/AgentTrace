/**
 * Idempotent, reversible integration with Claude Code's `.claude/settings.local.json`.
 *
 * Claude Code hook commands are shell-command strings. We emit a quoting-safe string that
 * invokes the copied runtime with the absolute node executable and ${CLAUDE_PROJECT_DIR}:
 *
 *   "<nodePath>" "${CLAUDE_PROJECT_DIR}/.agenttrace/runtime/hook.cjs" <EventName>
 *
 * Our entries are recognized by the runtime path substring, so re-running init refreshes
 * them and uninstall removes only ours.
 */

const HOOK_PATH_MARKER = ".agenttrace/runtime/hook.cjs";

/** Canonical set of Claude Code hook events we register (the runtime normalizes any event). */
export const REGISTERED_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "SubagentStop",
  "SessionEnd",
] as const;

const TOOL_SCOPED = new Set(["PreToolUse", "PostToolUse"]);

export interface ClaudeSettings {
  hooks?: Record<string, HookMatcher[]>;
  [k: string]: unknown;
}
interface HookMatcher {
  matcher?: string;
  hooks: HookCommand[];
}
interface HookCommand {
  type: "command";
  command: string;
  [k: string]: unknown;
}

export function buildHookCommand(nodePath: string, event: string): string {
  const node = nodePath.includes(" ") ? `"${nodePath}"` : nodePath;
  return `${node} "\${CLAUDE_PROJECT_DIR}/${HOOK_PATH_MARKER}" ${event}`;
}

function isOurs(entry: HookMatcher): boolean {
  return entry.hooks?.some(
    (h) => typeof h.command === "string" && h.command.replace(/\\/g, "/").includes(HOOK_PATH_MARKER),
  );
}

/**
 * Merge AgentTrace hooks into a settings object (mutates and returns it). Removes any prior
 * AgentTrace entries first, so it is idempotent and refreshes the command on every call.
 */
export function mergeHooks(settings: ClaudeSettings, nodePath: string): ClaudeSettings {
  const hooks: Record<string, HookMatcher[]> = settings.hooks ?? {};
  for (const event of REGISTERED_EVENTS) {
    const existing = (hooks[event] ?? []).filter((entry) => !isOurs(entry));
    const matcher: HookMatcher = {
      ...(TOOL_SCOPED.has(event) ? { matcher: "*" } : {}),
      hooks: [{ type: "command", command: buildHookCommand(nodePath, event) }],
    };
    existing.push(matcher);
    hooks[event] = existing;
  }
  settings.hooks = hooks;
  return settings;
}

/** Remove only AgentTrace hook entries (mutates and returns). */
export function unmergeHooks(settings: ClaudeSettings): ClaudeSettings {
  const hooks = settings.hooks;
  if (!hooks) return settings;
  for (const event of Object.keys(hooks)) {
    const filtered = (hooks[event] ?? []).filter((entry) => !isOurs(entry));
    if (filtered.length === 0) delete hooks[event];
    else hooks[event] = filtered;
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
  return settings;
}

/** Does this settings object already contain a well-formed AgentTrace hook for every event? */
export function hooksInstalled(settings: ClaudeSettings): boolean {
  const hooks = settings.hooks;
  if (!hooks) return false;
  return REGISTERED_EVENTS.every((event) => (hooks[event] ?? []).some(isOurs));
}
