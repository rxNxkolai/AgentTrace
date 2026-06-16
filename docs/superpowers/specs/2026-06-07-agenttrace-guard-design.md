# AgentTrace v0.7.0 — Guard + MCP

**Status:** Locked (2026-06-07), via 3-model design council (opus/sonnet/haiku).
**Transformation:** from passive black-box recorder → **active safety layer + platform**.
One line: *the flight recorder that can also pull the brakes.*

## Why (council synthesis)
- A recorder only helps *after* the crash. Guard moves the same risk+reversibility judgment to
  *before* the action, so AgentTrace prevents the regret instead of just documenting it.
- The **BLOCKED screen is the shareable artifact** ("my agent was about to do WHAT?"). Lead the
  launch with the problem, not "new version."
- Pair Guard with an **MCP server** so any agent/IDE can query the recorder and ask "is this
  risky?" → a platform signal, not a feature.

## Non-negotiable safety contract
1. **Off by default.** Pure recording until the user opts in (`agenttrace guard on`). Preserves
   the current never-interfere guarantee.
2. **Fail-open, always.** Any error, parse failure, or timeout in the guard path → **allow** the
   action and record a degraded event. A bug must never block legitimate work. Tested explicitly.
3. **Default to warn, not block.** Out of the box (once on), warn liberally, block only the
   catastrophic + irreversible (rm -rf, push to main, `.env` write, DROP/TRUNCATE, publish).
4. **Single source of judgment.** The TS evaluator reuses the existing `assessRisk` engine, so
   guard verdicts never drift from receipt grading.
5. **Every block is self-explaining + recorded.** The rule that fired + reason, and the decision
   becomes a trace event (shows in receipt + dashboard).

## Components

### Policy (`src/guard/policy.ts`)
`GuardMode = "off" | "warn" | "block"`. Policy `{ mode, blockAtOrAbove, warnAtOrAbove, allow[] }`
stored at `.agenttrace/policy.json`. Default: `{ mode:"off", blockAtOrAbove:"critical",
warnAtOrAbove:"high", allow:[] }`.

### Evaluator (`src/guard/evaluate.ts`)
Pure `evaluateAction(action, policy) → { verdict, level, reversibility?, rule?, reason }`. Builds
a synthetic event from the action, runs `assessRisk`, maps the level to a verdict via policy +
allow-list escapes.

### Enforcement (two surfaces)
- **Claude Code PreToolUse** (`assets/hook.cjs`): when policy mode ≠ off, evaluate the proposed
  tool call with a tiny self-contained mirror of the catastrophic rules; on block, emit Claude
  Code's deny decision and record a guard event. All wrapped fail-open.
- **`agenttrace run`**: when mode = block, evaluate the command before spawning; on block, refuse
  to run it and record. Makes Guard work for *any* agent, not just Claude Code.

### Commands (`src/commands/guard.ts`)
`guard status` · `guard on [--block]` · `guard off` · `guard test <cmd…>` (dry-run verdict, no
execution — the demo).

### MCP server (`src/mcp/server.ts`, built in parallel)
Dependency-free stdio JSON-RPC server. Tools: `list_runs`, `get_receipt`, `query_risk`. Exposes
the flight recorder + the risk judgment to any MCP client. Its tool schemas are the spec.

### Receipt/dashboard
Guard decisions recorded as `permission`-type events with `data.decision = guard_block|guard_warn`;
receipt shows a "Guard: N blocked, M warned" line.

## Out of scope tonight
Cloud, hosted policy, ML risk, approval workflows. Guard stays local + rule-based.
