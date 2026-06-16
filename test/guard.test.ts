import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { evaluateAction } from "../src/guard/evaluate.js";
import { loadPolicy, savePolicy, DEFAULT_POLICY } from "../src/guard/policy.js";

const require = createRequire(import.meta.url);
const hook = require("../assets/hook.cjs") as typeof import("../assets/hook.cjs");

const BLOCK = { mode: "block" as const, blockAtOrAbove: "critical" as const, warnAtOrAbove: "high" as const, allow: [] };
const WARN = { ...BLOCK, mode: "warn" as const };
const OFF = { ...BLOCK, mode: "off" as const };

describe("evaluateAction", () => {
  it("blocks rm -rf under block mode", () => {
    const d = evaluateAction({ command: "rm -rf build" }, BLOCK);
    expect(d.verdict).toBe("block");
    expect(d.level).toBe("critical");
    expect(d.reversibility).toBe("irreversible");
  });

  it("only warns under warn mode (never blocks)", () => {
    expect(evaluateAction({ command: "rm -rf build" }, WARN).verdict).toBe("warn");
  });

  it("allows everything under off mode (recording only)", () => {
    const d = evaluateAction({ command: "rm -rf build" }, OFF);
    expect(d.verdict).toBe("allow");
    expect(d.level).toBe("critical"); // still graded, just not enforced
  });

  it("allows a benign command", () => {
    expect(evaluateAction({ command: "npm test" }, BLOCK).verdict).toBe("allow");
  });

  it("honors the allow-list escape hatch", () => {
    const policy = { ...BLOCK, allow: ["^rm -rf build$"] };
    expect(evaluateAction({ command: "rm -rf build" }, policy).verdict).toBe("allow");
  });

  it("warns (not blocks) a high-but-not-critical action under block mode", () => {
    const d = evaluateAction({ command: "git push origin feature" }, BLOCK); // outbound = high
    expect(d.verdict).toBe("warn");
  });

  it("never throws on odd input (fail-safe)", () => {
    expect(() => evaluateAction({}, BLOCK)).not.toThrow();
    expect(() => evaluateAction({ path: "x" }, BLOCK)).not.toThrow();
  });
});

describe("policy load/save", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "agenttrace-policy-"));
    fs.mkdirSync(path.join(root, ".agenttrace"), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("defaults to off when no policy file exists", () => {
    expect(loadPolicy(root).mode).toBe(DEFAULT_POLICY.mode);
    expect(loadPolicy(root).mode).toBe("off");
  });
  it("round-trips a saved policy", () => {
    savePolicy(root, { ...DEFAULT_POLICY, mode: "block" });
    expect(loadPolicy(root).mode).toBe("block");
  });
});

describe("hook.cjs guardAssess (live block-path mirror)", () => {
  it("flags catastrophic actions and ignores safe ones", () => {
    expect(hook.guardAssess({ tool_name: "Bash", tool_input: { command: "rm -rf /" } }).level).toBe("critical");
    expect(hook.guardAssess({ tool_name: "Read", tool_input: { file_path: ".env" } }).level).toBe("critical");
    expect(hook.guardAssess({ tool_name: "Write", tool_input: { file_path: "config/.env" } }).level).toBe("critical");
    expect(hook.guardAssess({ tool_name: "Bash", tool_input: { command: "git push origin main" } }).level).toBe("critical");
    expect(hook.guardAssess({ tool_name: "Bash", tool_input: { command: "npm test" } })).toBeNull();
  });
});
