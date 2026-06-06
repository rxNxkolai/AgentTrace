import { describe, it, expect } from "vitest";
import { changedEntriesBetweenStatus } from "../src/util/git.js";

describe("changedEntriesBetweenStatus", () => {
  it("parses porcelain lines whose status starts with a space (the common case)", () => {
    const entries = changedEntriesBetweenStatus([], [" D config.ts", " M src/a.ts", "?? new.ts"]);
    const byPath = Object.fromEntries(entries.map((e) => [e.path, e.status]));
    expect(byPath["config.ts"]).toBe(" D");
    expect(byPath["src/a.ts"]).toBe(" M");
    expect(byPath["new.ts"]).toBe("??");
    // path must be intact, not missing its leading character
    expect(entries.map((e) => e.path)).toContain("config.ts");
  });

  it("only returns lines not present before", () => {
    const before = ["?? .agenttrace/"];
    const after = ["?? .agenttrace/", " D config.ts"];
    expect(changedEntriesBetweenStatus(before, after)).toEqual([{ path: "config.ts", status: " D" }]);
  });

  it("resolves renames to the new path", () => {
    const entries = changedEntriesBetweenStatus([], ["R  old.ts -> new.ts"]);
    expect(entries[0]!.path).toBe("new.ts");
  });
});
