import { describe, it, expect } from "vitest";
import {
  mergeHooks,
  unmergeHooks,
  hooksInstalled,
  buildHookCommand,
  REGISTERED_EVENTS,
  type ClaudeSettings,
} from "../src/settings/claude.js";

const NODE = "/usr/bin/node";

describe("buildHookCommand", () => {
  it("emits a CLAUDE_PROJECT_DIR-relative runtime invocation", () => {
    const cmd = buildHookCommand(NODE, "PreToolUse");
    expect(cmd).toContain("${CLAUDE_PROJECT_DIR}/.agenttrace/runtime/hook.cjs");
    expect(cmd).toContain("PreToolUse");
  });
  it("quotes a node path containing spaces", () => {
    const cmd = buildHookCommand("C:\\Program Files\\nodejs\\node.exe", "Stop");
    expect(cmd.startsWith('"C:\\Program Files\\nodejs\\node.exe"')).toBe(true);
  });
});

describe("mergeHooks", () => {
  it("registers every event and reports installed", () => {
    const s: ClaudeSettings = {};
    mergeHooks(s, NODE);
    expect(hooksInstalled(s)).toBe(true);
    for (const e of REGISTERED_EVENTS) expect(s.hooks![e]!.length).toBeGreaterThan(0);
  });

  it("is idempotent — re-running does not duplicate our entries", () => {
    const s: ClaudeSettings = {};
    mergeHooks(s, NODE);
    mergeHooks(s, NODE);
    for (const e of REGISTERED_EVENTS) {
      const ours = s.hooks![e]!.filter((m) =>
        m.hooks.some((h) => h.command.includes(".agenttrace/runtime/hook.cjs")),
      );
      expect(ours).toHaveLength(1);
    }
  });

  it("preserves pre-existing user hooks", () => {
    const s: ClaudeSettings = {
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo user-hook" }] }],
      },
    };
    mergeHooks(s, NODE);
    const userStill = s.hooks!.PreToolUse!.some((m) =>
      m.hooks.some((h) => h.command === "echo user-hook"),
    );
    expect(userStill).toBe(true);
    expect(hooksInstalled(s)).toBe(true);
  });
});

describe("unmergeHooks", () => {
  it("removes only our entries and keeps user hooks", () => {
    const s: ClaudeSettings = {
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo user-hook" }] }],
      },
    };
    mergeHooks(s, NODE);
    unmergeHooks(s);
    expect(hooksInstalled(s)).toBe(false);
    expect(s.hooks!.PreToolUse!.some((m) => m.hooks.some((h) => h.command === "echo user-hook"))).toBe(true);
  });

  it("removes the hooks key entirely when only our entries existed", () => {
    const s: ClaudeSettings = {};
    mergeHooks(s, NODE);
    unmergeHooks(s);
    expect(s.hooks).toBeUndefined();
  });
});
