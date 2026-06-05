# Changelog

All notable changes to AgentTrace are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Local dashboard** (`agenttrace ui`): a zero-dependency HTTP server and single-page UI
  showing the run list, per-run timeline, files, commands, risk flags, and receipt, with
  search and risk/status filters. Reuses the existing trace reader; no SQLite or build step.
- `agenttrace export <run>` writes a run's sorted `events.jsonl`, with `-o` to copy it
  elsewhere ([#4](https://github.com/rxNxkolai/AgentTrace/pull/4), closes
  [#2](https://github.com/rxNxkolai/AgentTrace/issues/2)).
- Windows-aware deletion risk rules: `Remove-Item -Recurse -Force` flagged critical;
  `Remove-Item`/`ri`/`rmdir`/`rd /s` flagged high
  ([#5](https://github.com/rxNxkolai/AgentTrace/pull/5), closes
  [#1](https://github.com/rxNxkolai/AgentTrace/issues/1)).
- Code of conduct, `.gitattributes`, `.editorconfig`, and this changelog.

## [0.1.0] - 2026-06-04

First slice: Claude Code capture and the CLI.

### Added
- Self-contained capture runtime copied to `.agenttrace/runtime/hook.cjs` at `init`; tiny,
  synchronous, fail-open, with tool-aware capture (no file contents stored) and secret redaction.
- Atomic one-file-per-event storage under `.agenttrace/runs/<session-id>/events/`.
- Resume-aware, multi-segment run model and a rule-based risk engine.
- Commands: `init`, `list`, `show`, `receipt`, `doctor`, `uninstall`.
- Idempotent `.claude/settings.local.json` hook merge that preserves existing user hooks.
- Sanitized markdown receipts.
- Terminal-style logo, README, and the slice-one design doc.

[Unreleased]: https://github.com/rxNxkolai/AgentTrace/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/rxNxkolai/AgentTrace/releases/tag/v0.1.0
