import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const hook = require("../assets/hook.cjs") as typeof import("../assets/hook.cjs");

describe("redactSecrets", () => {
  it("redacts AWS keys, sk- tokens, bearer tokens, and KEY= assignments", () => {
    expect(hook.redactSecrets("id AKIAABCDEFGHIJKLMNOP done")).toContain("[REDACTED]");
    expect(hook.redactSecrets("key=sk-abcdef0123456789abcdef")).toContain("[REDACTED]");
    expect(hook.redactSecrets("Authorization: Bearer abcdef12345678")).toContain("[REDACTED]");
    expect(hook.redactSecrets("API_KEY=supersecretvalue")).toContain("[REDACTED]");
  });
  it("leaves ordinary text alone", () => {
    expect(hook.redactSecrets("just a normal sentence")).toBe("just a normal sentence");
  });
});

describe("truncate", () => {
  it("caps long strings with a marker", () => {
    const out = hook.truncate("x".repeat(100), 10);
    expect(out.startsWith("xxxxxxxxxx")).toBe(true);
    expect(out).toContain("truncated");
  });
  it("leaves short strings unchanged", () => {
    expect(hook.truncate("short", 10)).toBe("short");
  });
});

describe("sanitizeValue", () => {
  it("omits sensitive content bodies but keeps their size", () => {
    const out = hook.sanitizeValue({ content: "a".repeat(50) }, 0, undefined) as Record<string, string>;
    expect(out.content).toBe("[omitted 50 chars]");
  });
  it("bounds depth", () => {
    let deep: any = "leaf";
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    const out = JSON.stringify(hook.sanitizeValue(deep, 0, undefined));
    expect(out).toContain("depth-capped");
  });
});

describe("mapType", () => {
  it("maps Bash PostToolUse to command and Edit to file_change", () => {
    expect(hook.mapType("PostToolUse", { tool_name: "Bash" })).toBe("command");
    expect(hook.mapType("PostToolUse", { tool_name: "Edit" })).toBe("file_change");
    expect(hook.mapType("PreToolUse", { tool_name: "Bash" })).toBe("tool_call");
    expect(hook.mapType("SessionStart", {})).toBe("run_start");
    expect(hook.mapType("SomethingNew", {})).toBe("passthrough");
  });
});

describe("normalizeEvent", () => {
  it("captures a Read path but not contents", () => {
    const e = hook.normalizeEvent(
      "PreToolUse",
      { session_id: "s1", tool_name: "Read", tool_input: { file_path: "/x/.env" } },
      0,
      "2026-06-03T00:00:00.000Z",
    );
    expect(e.type).toBe("tool_call");
    expect(e.data.path).toBe("/x/.env");
    expect(e.data.note).toContain("not captured");
    expect(JSON.stringify(e)).not.toContain("SUPER_SECRET");
  });

  it("records edit magnitude, not the edited bodies", () => {
    const e = hook.normalizeEvent(
      "PostToolUse",
      {
        session_id: "s1",
        tool_name: "Edit",
        tool_input: { file_path: "src/a.ts", old_string: "abc", new_string: "abcdef" },
      },
      0,
      "2026-06-03T00:00:00.000Z",
    );
    expect(e.type).toBe("file_change");
    expect(e.data.path).toBe("src/a.ts");
    expect(e.data.addedChars).toBe(6);
    expect(e.data.removedChars).toBe(3);
    // the actual edited text must not survive in normalized data
    expect(JSON.stringify(e.data)).not.toContain("abcdef");
  });

  it("always stamps schema version and source", () => {
    const e = hook.normalizeEvent("Stop", { session_id: "s" }, 0, "2026-06-03T00:00:00.000Z");
    expect(e.v).toBe(hook.SCHEMA_VERSION);
    expect(e.source).toBe("claude-code");
  });
});
