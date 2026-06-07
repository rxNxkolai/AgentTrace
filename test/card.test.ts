import { describe, it, expect } from "vitest";
import { renderReceiptCard } from "../src/receipt/card.js";
import type { Receipt } from "../src/schema/types.js";

function receipt(over: Partial<Receipt> = {}): Receipt {
  return {
    sessionId: "shell-abc",
    source: "shell",
    goal: "refactor auth and ship it",
    riskMax: "critical",
    status: "success",
    durationMs: 492000,
    filesChanged: ["src/auth.ts", "package-lock.json"],
    commandsRun: ["npm test"],
    failedSteps: [],
    riskyActions: [
      { level: "critical", reversibility: "irreversible", rule: "push-to-main", message: "Pushed to main/master branch.", eventTs: "", eventTitle: "" },
      { level: "medium", reversibility: "recoverable", rule: "dependency-install", message: "Dependencies installed.", eventTs: "", eventTitle: "" },
    ],
    reviewChecklist: [],
    nextRecommendedAction: "Do NOT auto-merge. Critical, irreversible actions detected.",
    ...over,
  };
}

describe("renderReceiptCard", () => {
  it("produces a valid svg with the key facts", () => {
    const svg = renderReceiptCard(receipt());
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).toContain("AGENT");
    expect(svg).toContain("refactor auth and ship it");
    expect(svg).toContain("CRITICAL");
    expect(svg).toContain("irreversible");
    expect(svg).toContain("Do NOT auto-merge");
  });

  it("escapes XML-special characters in the goal", () => {
    const svg = renderReceiptCard(receipt({ goal: 'fix <script> & "quotes"' }));
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).not.toContain("<script>");
  });

  it("handles a clean run with no risky actions", () => {
    const svg = renderReceiptCard(receipt({ riskMax: "safe", riskyActions: [], nextRecommendedAction: "Safe to review as a normal change." }));
    expect(svg).toContain("No medium-or-higher risk flags.");
    expect(svg.startsWith("<svg")).toBe(true);
  });
});
