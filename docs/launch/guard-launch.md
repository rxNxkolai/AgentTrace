# AgentTrace Guard — Launch Kit (v0.7.0)

---

## 1. X / Twitter

### Hook Tweet (post with video)

> my AI agent just tried to `git push --force origin main`
>
> AgentTrace caught it and blocked it before it ran.
>
> this is what the BLOCKED screen looks like. attaching the video.

---

### 6-Tweet Thread

**Tweet 1 (hook — same as above)**

> my AI agent just tried to `git push --force origin main`
>
> AgentTrace caught it and blocked it before it ran.
>
> this is what the BLOCKED screen looks like. attaching the video.

---

**Tweet 2**

> i've been building AgentTrace as a flight recorder for AI agents — a tamper-proof log of every tool call, every file touched, every command run.
>
> but recording what happened after the fact doesn't help when the agent already nuked your database.
>
> so i built Guard.

---

**Tweet 3**

> Guard is a policy engine that sits in front of every tool call your agent makes.
>
> it knows which commands are irreversible: `rm -rf`, `DROP TABLE`, `npm publish`, reading or writing `.env`, force-pushing to main.
>
> before any of those execute, it either warns you or blocks them entirely.

---

**Tweet 4**

> the design decisions i cared about:
>
> - opt-in. `agenttrace guard on --block` to enable block mode. warn mode is the default.
> - fail-open. a bug in Guard can NEVER prevent legitimate work from running.
> - works for any agent via `agenttrace run -- <your command>`
> - new MCP server so any IDE or agent can query "is this risky?" before acting
> - every block is written to the run receipt

---

**Tweet 5**

> the one-liner: it's the flight recorder that can also pull the brakes.
>
> the scary thing isn't that agents make mistakes. it's that the mistakes are irreversible and you only find out after.

---

**Tweet 6**

> open source, MIT, available now.
>
> `npm install -g @rnxkolai/agenttrace`
>
> github.com/rxNxkolai/AgentTrace
>
> full Guard docs in the README. would love to hear what rules you want next.

---

---

## 2. Show HN

**Title:**

> Show HN: AgentTrace Guard — blocks irreversible AI agent commands before they run

---

**First comment (post as OP):**

> Hey HN. I've been building AgentTrace, an open-source CLI flight recorder for AI coding agents. It captures every tool call, file write, and shell command into a tamper-proof receipt.
>
> The problem: recording what happened is useful for debugging, but it doesn't help when the agent already ran `rm -rf ./` or published to npm prematurely.
>
> v0.7.0 ships Guard: a policy engine + Claude Code PreToolUse hook that intercepts tool calls before they execute and either warns or blocks based on a rule set. The default rules cover the obvious catastrophes: force-pushing to main, deleting directories recursively, reading or writing `.env`, running `DROP TABLE`, and publishing packages.
>
> A few design choices I want to be upfront about:
>
> Guard is opt-in. You run `agenttrace guard on` (warn mode) or `agenttrace guard on --block` (block mode). Nothing changes if you don't enable it.
>
> It's fail-open. If Guard itself crashes or errors, the command runs. A bug in the safety layer should never silently block legitimate work.
>
> It also works outside Claude Code. `agenttrace run -- <any command>` wraps any agent's shell invocations with the same policy check. There's also a new MCP server so agents and IDEs can query the risk level of a command over the protocol directly.
>
> Every block gets written to the run receipt alongside the normal trace, so you have a full audit trail of what was stopped and why.
>
> Would genuinely like to hear what rules people want added. The rule set is the part I'm least confident I've gotten right.
>
> npm: `npm install -g @rnxkolai/agenttrace`
> github: github.com/rxNxkolai/AgentTrace

---

---

## 3. r/ClaudeAI

**Flair:** Built with Claude

**Title:**

> I built a tool that blocks your Claude agent before it runs `rm -rf` or force-pushes to main — here's how it works

**Body:**

> I've been shipping AgentTrace, an open-source flight recorder for Claude Code agents. It captures every tool call into a structured receipt you can replay and audit.
>
> The new version (v0.7.0) adds Guard: a PreToolUse hook that intercepts commands before Claude executes them and either warns you or blocks them outright.
>
> Default blocked actions: `rm -rf`, `git push --force` to a protected branch, reading or writing `.env` files, `DROP TABLE`, `npm publish`. The list is intentionally conservative — these are the things that are genuinely hard or impossible to undo.
>
> How it integrates with Claude Code: you run `agenttrace guard on` once, and it writes a PreToolUse hook into your Claude Code settings. From that point, every Bash and filesystem tool call routes through the policy check before Claude executes it. If it trips a rule in warn mode, Claude sees the warning in the tool response and can decide whether to proceed. In block mode, it returns an error and Claude has to ask you explicitly.
>
> It's fail-open by design. The hook can never silently prevent Claude from doing legitimate work. If the Guard process fails, the command runs.
>
> There's also an MCP server now, so other agents and IDEs can query the same policy engine over the protocol.
>
> Every block is written into the run receipt alongside the normal trace.
>
> `npm install -g @rnxkolai/agenttrace` then `agenttrace guard on`
>
> GitHub: github.com/rxNxkolai/AgentTrace
>
> Happy to answer questions about how the hook wiring works or what rules are planned next.

---

---

## 4. r/LocalLLaMA

**Flair:** Built with Claude

**Title:**

> AgentTrace Guard: a policy engine that blocks irreversible shell commands before your local agent runs them

**Body:**

> I run a lot of local agent experiments. At some point I started worrying less about whether the model was smart enough and more about what happens when it's confidently wrong at the exact wrong moment.
>
> AgentTrace is a flight recorder I built for this problem: it logs every tool call and shell command your agent makes into a structured, tamper-proof receipt. Useful for debugging model behavior across runs.
>
> New in v0.7.0: Guard. It's a policy engine that sits in front of agent tool calls and blocks the irreversible ones before they execute. Works via a Claude Code PreToolUse hook, and also via `agenttrace run -- <any command>` for other agents.
>
> Default rules cover: recursive deletes, force-pushes to main, `.env` reads/writes, DROP TABLE, npm publish. You can configure your own.
>
> Design philosophy:
> - Fail-open. Guard never silently blocks work. If the safety layer errors, the command runs.
> - Opt-in. Nothing changes until you run `agenttrace guard on`.
> - Warn-by-default. Block mode requires `--block`. Most people probably want to see what their agent *would* have blocked before committing to hard stops.
> - MCP server included so any agent or IDE can query risk level directly.
>
> Open source, MIT.
>
> `npm install -g @rnxkolai/agenttrace`
> github.com/rxNxkolai/AgentTrace

---

---

## 5. One-Liner Positioning Options

1. **"The flight recorder that can also pull the brakes."**

2. **"AgentTrace records what your AI agent did. Guard stops it before it does something you can't undo."**

3. **"An AI agent safety layer for people who've already watched one blow something up."**

---

---

## 6. Reply to Skeptics

**For: "I don't want my agent blocked / what about false positives?"**

> totally fair concern. here's how Guard is actually built:
>
> first, it's opt-in. running `agenttrace guard on` does nothing to your existing Claude Code setup by default. you have to actively enable it, and block mode requires an extra `--block` flag. if you never touch it, nothing changes.
>
> second, the default is warn, not block. in warn mode, the hook tells Claude "heads up, this command tripped a policy rule" and lets Claude decide what to do with that information. it's more like a second opinion than a hard stop.
>
> third, and this is the one i care most about: Guard is fail-open. if the Guard process crashes, errors, or times out, the command runs. a bug in the safety layer cannot silently block your agent. i'd rather have a Guard bug go unnoticed than have legitimate work silently fail.
>
> the rules are also intentionally narrow. i'm not trying to second-guess every decision. the default list is things that are genuinely hard or impossible to undo: recursive deletes, force-pushes to a protected branch, `.env` access, DROP TABLE, npm publish. if your workflow legitimately needs one of those, you can disable the specific rule.
>
> if you hit a false positive, open an issue. the rule set is the part i'm least confident about and the most interested in getting feedback on.

---
