# AgentTrace — Slice One Design

**Status:** Locked (2026-06-03)
**Scope:** Slice one only. The open-source flight recorder for AI agents — first shippable slice.
**One-liner:** AgentTrace records what a Claude Code session actually did and turns it into a readable receipt.

---

## 0. Decomposition context

The full AgentTrace vision (trace format + CLI + storage + dashboard + 5 adapters + future cloud)
is too large for one spec. It is built in slices, each reusing the trace format:

| Slice | Contents | Status |
|-------|----------|--------|
| **1 (this doc)** | Trace format + Claude Code hook capture + CLI read commands (`init`, `list`, `show`, `receipt`, `doctor`, `uninstall`) | **Building** |
| 2 | Local dashboard (`agenttrace ui`) + SQLite index + search/filter | Deferred |
| 3 | Generic shell wrapper (`agenttrace run -- <cmd>`) | Deferred |
| 4 | Import adapters (n8n, GitHub Actions) | Deferred |
| 5 | MCP server, other agents, cloud waitlist | Deferred |

The single thing slice one must prove: **can AgentTrace capture a Claude Code session
accurately enough that the receipt is genuinely useful?**

---

## 1. Scope & shape of slice one (LOCKED)

- **Wedge:** hooks-first for Claude Code. The only path that produces tool-level events
  (`PreToolUse`/`PostToolUse`/`PostToolUseFailure`/…) and therefore a rich receipt.
- **Slice one is CLI-only.** No dashboard, no SQLite, no other adapters.
- **Storage:** project-local `.agenttrace/`, wired per-repo by `agenttrace init`. Store
  location is always `${CLAUDE_PROJECT_DIR}/.agenttrace/`.
- **Repo structure:** single `agenttrace` npm package (NOT a monorepo yet). The trace format
  lives in its own module so a later workspace split is clean.
- **Stack:** Node + TypeScript, Commander for the CLI, near-zero deps on the hook hot path.
  MIT license. Installable via `npm i -g agenttrace`, `npx agenttrace`, or local dev-dependency.
- **Definition of done:** run `agenttrace init` in a real repo, do a normal Claude Code
  session, then `agenttrace list` / `show <id>` / `receipt latest` and get an accurate,
  readable account of what that session did.

### Slice-one requirements (riders from review)
1. Hook runner is a **separate tiny entrypoint** — no Commander, styling, or receipt code.
2. Capture is **fail-open** — never break or delay a Claude session; failures are silent
   except a capped internal diagnostics log.
3. Trace format is **versioned from day one** and stores both the normalized event and the
   sanitized source payload.
4. **Privacy by default** — `.agenttrace/` gitignored, secret redaction, payload caps,
   sanitized receipt export, explicit "raw traces may contain sensitive data" warning.
5. **Multiple install paths** supported (global / npx / local dev-dep); the generated hook
   must find its runtime reliably regardless.
6. `init` is **idempotent and reversible** — merges into existing settings without clobbering
   user hooks; `doctor` and `uninstall` exist.
7. Capture correctly handles: a successful session, a failed tool call, **concurrent**
   sessions/tool-calls, an **interrupted** session with no clean `SessionEnd`, and a repo
   with **existing Claude Code hooks**.

---

## 2. Capture architecture (LOCKED)

### Two entrypoints, one package
- `dist/cli.js` — Commander, terminal styling, receipt rendering (human-facing commands).
- `assets/hook.cjs` — the **self-contained runtime**. Plain CommonJS, **zero imports beyond
  Node stdlib**. Authored by hand (not compiled from the TS graph) so it can be copied
  verbatim. Its whole job: read stdin → parse → apply tool-aware capture policy → atomic
  write one event file → `exit(0)`. **Always exits 0** (a non-zero `PreToolUse` exit can block
  the tool — we never risk it).

### Binary resolution — self-contained runtime copy
At `agenttrace init`:
1. Copy `assets/hook.cjs` → `${repo}/.agenttrace/runtime/hook.cjs`.
2. Write hooks into **`.claude/settings.local.json`** (local/untracked, not committed
   `settings.json`). Claude Code hook commands are **shell-command strings**, so we emit a
   quoting-safe string rather than an exec/array literal (the originally-proposed array form
   risked being unparsed by Claude Code's string-command schema):
   `"<absolute node executable>" "${CLAUDE_PROJECT_DIR}/.agenttrace/runtime/hook.cjs" <EventName>`.
   The absolute node path is double-quoted when it contains spaces (e.g. `C:\Program
   Files\nodejs\node.exe`); `${CLAUDE_PROJECT_DIR}` is emitted literally for Claude Code to
   expand. This keeps every benefit of the self-contained runtime (no PATH/npx/relocation
   coupling) while matching the documented hook format. If a future Claude Code version
   supports array/exec form, `buildHookCommand` is the single swap point.
3. Record `{ packageVersion, nodePath, installedAt, registeredEvents }` in
   `.agenttrace/config.json` (runtime freshness = `packageVersion` vs installed `VERSION`).

This beats pinning the installed package path: it survives package relocation / reinstall /
uninstall, avoids PATH and npx-cache resolution (npx re-resolves on every tool call — 1–2s
cold-start, unacceptable on the hot path), and writes nothing machine-specific into tracked
files. `doctor` compares `runtimeVersion` vs the installed `packageVersion` and refreshes the
copy when stale.

### Run identity & per-invocation atomic files
- Claude provides `session_id` in every payload. One run = `.agenttrace/runs/<session_id>/`.
- **One atomic file per hook invocation**, written temp-then-rename, under
  `.agenttrace/runs/<session_id>/events/`. Claude can fire `PostToolUse` concurrently for
  parallel/batched tool calls, so a shared append-only file would race. Per-invocation files
  eliminate the race entirely.
- `events.jsonl` (sorted, compacted) and `receipt.md` are **derived artifacts**, produced on
  read — never the write target.
- Ordering: by `ts` then `seq`. Pairing `Pre`/`Post`: by **`tool_use_id`**, not file order.

### Resume-aware run model
A session can resume, producing multiple `SessionStart`/`SessionEnd` pairs. A run holds
ordered **segments** `{ segmentId, startedAt, endedAt?, status }`. A segment with a start and
no end is `interrupted`. Run status aggregates across segments.

### Event set captured now
`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolBatch`,
`PostToolUseFailure`, `PermissionRequest`, `PermissionDenied`, `Stop`, `StopFailure`,
`SubagentStart`, `SubagentStop`, `SessionEnd`. Unmapped events are stored as `passthrough` so
new Claude events are never dropped.

**Registration vs capture:** `init` registers the canonical, confirmed Claude Code hook events
(`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`,
`SessionEnd`). The runtime itself **normalizes any event name it is handed**, so if Claude Code
emits additional events (`PostToolBatch`, `StopFailure`, `PermissionRequest`/`Denied`,
`SubagentStart`, `PostToolUseFailure`) they are captured correctly the moment registration is
extended — no runtime change required. This avoids writing unverified event names into user
settings while keeping forward compatibility.

### Event shape (versioned, dual-layer)
```jsonc
{
  "v": 1,                       // schema version, on every line
  "ts": "2026-06-03T19:14:02.511Z",
  "seq": 0,                     // monotonic within the invocation/process
  "type": "tool_call",          // normalized type
  "sessionId": "abc123",
  "segmentId": "seg-1",
  "toolUseId": "toolu_…",       // pairing key when present
  "source": "claude-code",
  "title": "Bash: npm test",
  "data": { /* normalized, tool-aware */ },
  "sourcePayloadSanitized": { /* capped, policy-filtered original payload */ },
  "risk": null                  // filled at receipt time, never at capture
}
```
Normalized `type`s: `run_start`, `prompt`, `tool_call`, `command`, `file_change`, `error`,
`permission`, `subagent`, `stop`, `run_end`, `passthrough`.

### Tool-aware capture policy (replaces naive regex-only)
Per-tool rules decide what is safe to store **before** writing:
- `Read` of any path → record *that a read happened* + the path; **never** file contents.
- `Bash` → command string + truncated stdout/stderr.
- `Edit`/`Write`/`MultiEdit` → path + change size / line delta; **not** full file bodies.
- Unknown tools → shallow, capped copy of input/output.
- A secret-pattern scrub (API keys, AWS keys, `-----BEGIN … KEY-----` blocks, `.env` values)
  runs as a second pass on whatever survives.
- Every field capped (~10 KB) with an explicit truncation marker.

### Hook discipline
Synchronous, tiny, fail-open, silent. On any error: best-effort append to a capped
`.agenttrace/diagnostic.log` (ring-buffer trimmed to N KB), then `exit(0)`.

---

## 3. Trace schema, receipt, and risk (LOCKED)

### Reading a run
`src/trace/read.ts` loads a run directory: parse every `events/*.json` (skip unparseable —
fail-open on read too), sort by `ts`+`seq`, pair `Pre`/`Post` by `toolUseId`, reconstruct
segments, and expose a `Run` aggregate. It can also compact to `events.jsonl`.

### Receipt (`agenttrace receipt <id|latest>` — the payoff)
Pure function over normalized events. Derives:
- **goal** — first `prompt` of the run
- **status** — `success` | `failed` | `partial` | `interrupted` (from segments + tool failures)
- **duration** — sum across segments
- **filesChanged** — from `file_change` events; git diff supplemental
- **commandsRun** — from `command` events
- **failedSteps** — `PostToolUseFailure` / `StopFailure`
- **riskyActions** — from the risk pass
- **reviewChecklist** + **nextRecommendedAction** — derived from risk + files touched

Output is **sanitized markdown** — summaries only, never `sourcePayloadSanitized` bodies.
Mirrors the PRD receipt layout.

### Risk engine
Pure, rule-based function over **normalized** events (never raw). Returns per-event `RiskLevel`
+ a run `riskSummary` (max level, counts, list). Implemented as an extendable rule table over
the tiers below. Heuristic — **flags for review, never blocks**.

| Tier | Examples (slice-one subset) |
|------|------------------------------|
| critical | `rm -rf`, read/write `.env`, push to `main`, `npm publish`, prod deploy, destructive DB |
| high | file deletion, secret detected in output, auth/session/migration/CI files touched |
| medium | dependency install, lockfile changed, config/route/middleware changed, test failures |
| low | docs changed, formatting, read-only commands, test run |

### Three read commands
- `list` — table from run-directory headers.
- `show` — full chronological timeline, every event, terminal-rendered.
- `receipt` — the distilled markdown doc.

---

## 4. Command surface

| Command | Behavior |
|---------|----------|
| `agenttrace init` | Create `.agenttrace/` (runs/, runtime/, config.json), copy `hook.cjs`, merge hooks into `.claude/settings.local.json` (idempotent), add `.agenttrace/` to `.gitignore`. Prints sensitive-data warning. |
| `agenttrace list [--limit N] [--json]` | Table of recent runs: id, status, started, duration, files, max risk. |
| `agenttrace show <id\|latest> [--json]` | Full timeline for one run. |
| `agenttrace receipt <id\|latest> [--out <file>]` | Generate + print sanitized markdown receipt; `--out` writes to disk. |
| `agenttrace doctor` | Verify install: settings hook present + well-formed, runtime present + version match (refresh if stale), node path valid, store writable. `--fix` repairs. |
| `agenttrace uninstall` | Remove only AgentTrace-tagged hook entries from settings and the runtime copy. Leaves traces unless `--purge`. |

`init` is the entry point (no separate `setup claude-code` in slice one — there is only one
adapter, so `init` does both). `latest` resolves to the most-recently-started run.

### `init` merge algorithm (idempotent)
1. Read `.claude/settings.local.json` (create `{}` if absent). Never touch `settings.json`.
2. For each captured event, ensure a hook entry whose command array matches our signature
   (recognized by the `hook.cjs` path + event arg). Insert if missing; update in place if
   present. Never duplicate, never remove user hooks.
3. Write back with stable formatting (2-space JSON).

---

## 5. Privacy & security

- `.agenttrace/` is added to `.gitignore` on `init`.
- Tool-aware policy + secret scrub + payload caps run **at capture**, before anything hits disk.
- Receipts are sanitized: summaries only, no raw payloads, secret-scrubbed.
- `init` prints: *"AgentTrace records prompts, commands, and file-change metadata locally under
  `.agenttrace/`. Raw traces may contain sensitive data — they are gitignored by default. Review
  before sharing or exporting."*
- Diagnostics log is capped and contains only error context, never payloads.

---

## 6. Project layout & build

```
agenttrace/
  package.json            # bin: { agenttrace: dist/cli.js }, files: [dist, assets]
  tsconfig.json
  README.md  LICENSE  .gitignore
  assets/
    hook.cjs              # self-contained runtime, shipped + copied on init
  src/
    cli.ts
    version.ts
    schema/types.ts       # SCHEMA_VERSION + all types (the "core" module)
    trace/read.ts         # read/sort/pair/segment a run dir
    risk/{rules.ts,engine.ts}
    receipt/generate.ts
    render/{table.ts,timeline.ts,colors.ts}
    settings/claude.ts    # settings.local.json merge/unmerge + signature
    commands/{init,list,show,receipt,doctor,uninstall}.ts
    util/{paths.ts,git.ts,fs.ts}
  test/
    risk.test.ts  trace-read.test.ts  receipt.test.ts  capture-policy.test.ts  settings-merge.test.ts
    fixtures/                # sample hook payloads + a synthetic run dir
```

Build: `tsc` → `dist/`. `assets/hook.cjs` ships as-is. Dev run via `tsx src/cli.ts`.
Runtime deps: `commander`, `picocolors`. Dev deps: `typescript`, `tsx`, `vitest`, `@types/node`.
The capture-policy + atomic-write logic is mirrored as **pure functions** in
`assets/hook.cjs`; `test/capture-policy.test.ts` requires that file directly and tests those
functions, so the runtime is covered without a build step.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Node cold-start per hook adds latency to Claude | hook.cjs is tiny, zero non-stdlib imports, sync, single file. Acceptable; measured in `doctor`. |
| `settings.local.json` schema drift in Claude Code | Merge by signature, tolerate unknown keys, never rewrite unrelated structure. `passthrough` events for unknown hook types. |
| Concurrent writes | One atomic file per invocation (temp+rename). No shared mutable file. |
| Secret leakage into traces | Tool-aware policy + scrub + caps at capture; sanitized receipts; gitignore. |
| Package moved/reinstalled breaks hook | Self-contained copied runtime; `doctor --fix` refreshes. |
| Interrupted/resumed sessions | Segment model; missing end → `interrupted`, end-time inferred from last event. |

---

## 8. Out of scope for slice one (explicit)
Dashboard, SQLite, search, shell wrapper, n8n/GitHub adapters, MCP server, cloud, cost
tracking, approval gates, policy engine. All deferred to later slices. The trace format is
designed so each can be added without breaking changes (`passthrough`, versioned events,
`source` discriminator).
