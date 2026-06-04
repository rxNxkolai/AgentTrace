# Security Policy

AgentTrace records what AI agents do, so it sits close to sensitive data. Two things matter here: how the tool protects that data, and how you report a problem.

## How AgentTrace handles sensitive data

- **Traces are local and gitignored.** `agenttrace init` adds `.agenttrace/` to `.gitignore`.
- **The capture path never stores file contents or full edit bodies.** It keeps paths, command strings, change sizes, prompts, and timing.
- **Secret-looking values get redacted at capture**, before anything reaches disk: API keys, AWS keys, private key blocks, bearer tokens, and `KEY=value` assignments. Every field is size-capped.
- **Receipts are sanitized summaries.** They never include raw payloads.

Command output can still contain sensitive text that no pattern catches. Read a trace before you share it, and treat `.agenttrace/` as private.

## Reporting a vulnerability

Found a way to leak data, bypass redaction, or block a Claude Code session through the hook? Report it privately.

- Open a [private security advisory](https://github.com/rxNxkolai/AgentTrace/security/advisories/new) on the repo, or
- email the maintainer listed on the GitHub profile.

Please do not open a public issue for a vulnerability. Include the version, repro steps, and what data is exposed. Expect an acknowledgement within a few days.

## Scope

In scope: secret leakage into traces or receipts, redaction bypass, a hook change that can block or crash a session, and `init` writing somewhere it should not.

Out of scope: a user choosing to commit or share their own `.agenttrace/` directory.
