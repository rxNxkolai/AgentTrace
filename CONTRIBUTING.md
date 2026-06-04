# Contributing to AgentTrace

Thanks for helping build the flight recorder for AI agents. This guide gets you from clone to pull request.

## Ground rules

- Keep the **hook path tiny and fail-open.** `assets/hook.cjs` runs on every Claude Code event. It must stay dependency-free, synchronous, and silent on error. It always exits 0. A change that risks blocking or slowing a session will not merge.
- **Never capture file contents or secrets.** Capture stores paths, command strings, change sizes, and timing. The tool-aware policy in `assets/hook.cjs` decides what is safe to keep. If you add a tool, add its policy.
- **The trace format is versioned.** Additive changes are fine. Anything that breaks old event files bumps `SCHEMA_VERSION` in `src/schema/types.ts` and gets a note in the PR.
- **Tests come with behavior.** New rules, commands, or parsing get a test. The suite is fast on purpose.

## Setup

```bash
git clone https://github.com/rxNxkolai/AgentTrace.git
cd AgentTrace
npm install
npm test          # 33 tests, runs in under a second
npm run build     # tsc -> dist
npm run dev -- list
```

## Trying it on a real session

```bash
cd some-throwaway-repo
node /path/to/AgentTrace/dist/cli.js init
# run a Claude Code session
node /path/to/AgentTrace/dist/cli.js receipt latest
```

## Where things live

| Path | What it holds |
|---|---|
| `assets/hook.cjs` | The self-contained capture runtime. Pure functions, unit-tested directly. |
| `src/schema/types.ts` | The trace format. Other slices import this. |
| `src/trace/read.ts` | Reads a run: sort, pair, segment, aggregate. |
| `src/risk/rules.ts` | The risk rule table. Most "good first issue" work lives here. |
| `src/receipt/generate.ts` | Builds and renders the markdown receipt. |
| `src/commands/` | One file per CLI command. |
| `src/settings/claude.ts` | The idempotent `settings.local.json` merge. |

## Adding a risk rule

Open `src/risk/rules.ts`, add an entry to `RISK_RULES` with a `name`, `level`, `test`, and `message`, then add a case to `test/risk.test.ts`. Rules read normalized events only, never raw payloads. Rules flag for review. They never block.

## Pull requests

1. Branch from `main`.
2. Run `npm run typecheck && npm test` before pushing. CI runs both on every PR.
3. Keep the PR focused. One change, one story.
4. Describe what you changed and why in the PR body.

New here? Filter issues by [`good first issue`](https://github.com/rxNxkolai/AgentTrace/labels/good%20first%20issue).

## License

By contributing, you agree your work ships under the [MIT License](LICENSE).
