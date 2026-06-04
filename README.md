# AgentTrace

**The open-source flight recorder for AI agents.**

AI agents edit files, run commands, call tools, and sometimes fail halfway through a task.
AgentTrace records what a [Claude Code](https://docs.anthropic.com/en/docs/claude-code) session
actually did and turns it into a readable receipt — so you know what changed, what failed, and
what needs review.

```bash
npm install -g agenttrace
cd your-repo
agenttrace init            # wires Claude Code hooks for this repo
# … run a normal Claude Code session …
agenttrace receipt latest  # what just happened?
```

> Slice one is **CLI-only** and **Claude Code only**. The local dashboard, the generic shell
> wrapper, and other adapters are planned next slices that reuse the same trace format. See
> [`docs/superpowers/specs/`](docs/superpowers/specs/) for the design.

## What you get

```
$ agenttrace list
RUN          STATUS      STARTED              DUR     FILES  CMDS  RISK
a1b2c3d4e5f6 success     2026-06-03 19:14:02  8m12s   4      2     medium

$ agenttrace receipt latest
# AgentTrace Receipt
- Run: a1b2c3d4e5f6
- Status: Success with warnings
- Duration: 8m 12s
...
## Risk Flags
- **HIGH:** Auth/session-related file changed: src/middleware/auth.ts
- **MEDIUM:** Lockfile changed: package-lock.json
## Final Recommendation
Review the flagged high-risk changes before merging.
```

## How it works

`agenttrace init`:
1. Creates a local `.agenttrace/` store (and gitignores it).
2. Copies a tiny self-contained runtime to `.agenttrace/runtime/hook.cjs`.
3. Registers Claude Code hooks in `.claude/settings.local.json` (merging — your existing hooks
   are never touched).

During a session, each Claude Code lifecycle/tool event invokes the runtime, which writes one
atomic event file under `.agenttrace/runs/<session_id>/events/`. The capture path is tiny,
synchronous, **fail-open** (it never breaks or delays your session), and **silent** except a
capped diagnostics log.

`list` / `show` / `receipt` read those events back: pairing tool calls, reconstructing the
timeline (including resumed sessions), assessing risk with a rule table, and rendering a
sanitized markdown receipt.

## Commands

| Command | What it does |
|---------|--------------|
| `agenttrace init` | Wire AgentTrace + Claude Code hooks in this repo. |
| `agenttrace list [-n N] [--json]` | List recorded runs. |
| `agenttrace show <run\|latest> [--json]` | Full run timeline. |
| `agenttrace receipt <run\|latest> [-o file]` | Generate a markdown receipt. |
| `agenttrace doctor [--fix]` | Verify / repair the install. |
| `agenttrace uninstall [--purge]` | Remove hooks + runtime (keeps traces unless `--purge`). |

## Privacy

Traces are local and gitignored by default. The capture path applies tool-aware policies
(file *contents* are never stored — only paths and change sizes), redacts secret-looking
values, and caps payload sizes. Receipts are sanitized summaries. Raw traces may still contain
sensitive command output — review before sharing.

## Development

```bash
npm install
npm run build      # tsc -> dist/
npm test           # vitest
npm run dev -- list
```

## License

MIT
