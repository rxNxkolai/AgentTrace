/*
 * AgentTrace hook runtime (self-contained, zero non-stdlib deps).
 *
 * Copied verbatim to <repo>/.agenttrace/runtime/hook.cjs by `agenttrace init`, and invoked
 * by Claude Code for each lifecycle/tool event via:
 *   [ <abs node>, "${CLAUDE_PROJECT_DIR}/.agenttrace/runtime/hook.cjs", "<EventName>" ]
 *
 * Contract: read the hook payload on stdin, normalize + sanitize it, write ONE atomic event
 * file, and ALWAYS exit 0. It must never break or delay the Claude Code session. On any error
 * it appends to a capped diagnostics log and exits 0.
 *
 * This file is also require()-able: its pure helpers are exported and unit-tested directly,
 * so the runtime is covered without a build step.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const SCHEMA_VERSION = 1;
const FIELD_CAP = 10 * 1024; // 10 KB per field
const DIAG_CAP = 64 * 1024; // 64 KB ring-buffer for the diagnostics log
const MAX_DEPTH = 6;
const MAX_KEYS = 64;

const SENSITIVE_CONTENT_KEYS = new Set([
  "content",
  "new_string",
  "old_string",
  "file_text",
  "new_str",
  "old_str",
]);

const SECRET_PATTERNS = [
  /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g,
  /AKIA[0-9A-Z]{16}/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{12,}/g,
  /\b(?:PASSWORD|PASSWD|SECRET|TOKEN|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY)\b\s*[:=]\s*['"]?[^\s'"]{4,}/gi,
];

/** Redact secret-looking substrings from a string. Pure. */
function redactSecrets(input) {
  if (typeof input !== "string" || input.length === 0) return input;
  let out = input;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, "[REDACTED]");
  }
  return out;
}

/** Truncate a long string, leaving a marker. Pure. */
function truncate(input, cap) {
  const limit = typeof cap === "number" ? cap : FIELD_CAP;
  if (typeof input !== "string") return input;
  if (input.length <= limit) return input;
  return input.slice(0, limit) + "…[+" + (input.length - limit) + " chars truncated]";
}

/** Scrub then cap a scalar string. Pure. */
function scrubString(input, cap) {
  return truncate(redactSecrets(input), cap);
}

/**
 * Recursively sanitize an arbitrary payload value: redact secrets, cap string length, omit
 * large/sensitive content bodies, and bound depth/breadth. Pure, allocation-only.
 */
function sanitizeValue(value, depth, parentKey) {
  if (value == null) return value;
  if (typeof value === "string") {
    if (parentKey && SENSITIVE_CONTENT_KEYS.has(parentKey)) {
      return "[omitted " + value.length + " chars]";
    }
    return scrubString(value, FIELD_CAP);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= MAX_DEPTH) return "[depth-capped]";
  if (Array.isArray(value)) {
    return value.slice(0, MAX_KEYS).map((v) => sanitizeValue(v, depth + 1, parentKey));
  }
  if (typeof value === "object") {
    const out = {};
    const keys = Object.keys(value).slice(0, MAX_KEYS);
    for (const k of keys) {
      out[k] = sanitizeValue(value[k], depth + 1, k);
    }
    return out;
  }
  return undefined;
}

/** Map a Claude hook event name + payload to a normalized AgentTrace event type. Pure. */
function mapType(hookEvent, payload) {
  switch (hookEvent) {
    case "SessionStart":
      return "run_start";
    case "SessionEnd":
      return "run_end";
    case "UserPromptSubmit":
      return "prompt";
    case "PreToolUse":
      return "tool_call";
    case "PostToolUse":
    case "PostToolBatch": {
      const tool = toolName(payload);
      if (tool === "Bash") return "command";
      if (isFileEditTool(tool)) return "file_change";
      return "tool_call";
    }
    case "PostToolUseFailure":
    case "StopFailure":
      return "error";
    case "PermissionRequest":
    case "PermissionDenied":
      return "permission";
    case "Stop":
      return "stop";
    case "SubagentStart":
    case "SubagentStop":
      return "subagent";
    default:
      return "passthrough";
  }
}

function isFileEditTool(tool) {
  return tool === "Edit" || tool === "Write" || tool === "MultiEdit" || tool === "NotebookEdit";
}

function toolName(payload) {
  if (!payload || typeof payload !== "object") return undefined;
  return payload.tool_name || payload.toolName || (payload.tool && payload.tool.name) || undefined;
}

function toolInput(payload) {
  if (!payload || typeof payload !== "object") return {};
  return payload.tool_input || payload.toolInput || {};
}

function toolResponse(payload) {
  if (!payload || typeof payload !== "object") return {};
  return payload.tool_response || payload.toolResponse || payload.tool_result || {};
}

/** Build the short human-readable title. Pure. */
function buildTitle(hookEvent, type, payload) {
  const tool = toolName(payload);
  const input = toolInput(payload);
  if (type === "prompt") {
    const p = typeof payload.prompt === "string" ? payload.prompt : "";
    return "Prompt: " + truncate(redactSecrets(p.replace(/\s+/g, " ").trim()), 80);
  }
  if (type === "command") {
    const cmd = typeof input.command === "string" ? input.command : "";
    return "Bash: " + truncate(redactSecrets(cmd.replace(/\s+/g, " ").trim()), 80);
  }
  if (type === "file_change") {
    return (tool || "Edit") + ": " + (input.file_path || input.path || input.notebook_path || "?");
  }
  if (type === "tool_call") {
    if (tool === "Read") return "Read: " + (input.file_path || input.path || "?");
    return (tool || "Tool") + (hookEvent === "PreToolUse" ? " (pending)" : "");
  }
  if (type === "run_start") return "Session start";
  if (type === "run_end") return "Session end";
  if (type === "error") return (tool ? tool + ": " : "") + "failure";
  if (type === "permission") return "Permission: " + (tool || hookEvent);
  if (type === "subagent") return hookEvent;
  if (type === "stop") return "Stop";
  return hookEvent;
}

/**
 * Build the normalized, tool-aware `data` object. Never includes file contents or full edit
 * bodies; keeps truncated command output. Pure.
 */
function buildData(hookEvent, type, payload) {
  const tool = toolName(payload);
  const input = toolInput(payload);
  const resp = toolResponse(payload);
  const data = {};
  if (tool) data.tool = tool;

  if (type === "prompt") {
    data.prompt = scrubString(typeof payload.prompt === "string" ? payload.prompt : "", FIELD_CAP);
    return data;
  }
  if (type === "command") {
    data.command = scrubString(typeof input.command === "string" ? input.command : "", FIELD_CAP);
    if (resp && typeof resp === "object") {
      if (resp.exit_code != null) data.exitCode = resp.exit_code;
      if (resp.exitCode != null) data.exitCode = resp.exitCode;
      const stdout = resp.stdout || resp.output;
      const stderr = resp.stderr;
      if (typeof stdout === "string") data.stdout = scrubString(stdout, 2048);
      if (typeof stderr === "string") data.stderr = scrubString(stderr, 2048);
    }
    return data;
  }
  if (type === "file_change") {
    data.path = input.file_path || input.path || input.notebook_path || undefined;
    // record change magnitude, never the bodies
    if (typeof input.new_string === "string") data.addedChars = input.new_string.length;
    if (typeof input.old_string === "string") data.removedChars = input.old_string.length;
    if (typeof input.content === "string") data.writtenChars = input.content.length;
    if (Array.isArray(input.edits)) data.editCount = input.edits.length;
    return data;
  }
  if (type === "tool_call") {
    if (tool === "Read") {
      data.path = input.file_path || input.path || undefined;
      data.note = "read (contents not captured)";
      return data;
    }
    // unknown tool: shallow, sanitized snapshot of inputs only
    data.input = sanitizeValue(input, 0, undefined);
    return data;
  }
  if (type === "error") {
    const msg = payload.error || payload.message || (resp && resp.error) || "";
    data.message = scrubString(typeof msg === "string" ? msg : JSON.stringify(msg), 2048);
    return data;
  }
  if (type === "permission") {
    data.decision = payload.decision || payload.permission || hookEvent;
    return data;
  }
  if (type === "run_start" || type === "run_end") {
    if (payload.cwd) data.cwd = payload.cwd;
    if (payload.source) data.startSource = payload.source;
    if (payload.reason) data.reason = payload.reason;
    return data;
  }
  return data;
}

/** Build the complete normalized event from a hook payload. Pure. */
function normalizeEvent(hookEvent, payload, seq, nowIso) {
  const type = mapType(hookEvent, payload);
  return {
    v: SCHEMA_VERSION,
    ts: nowIso,
    seq: seq || 0,
    type,
    sessionId: (payload && (payload.session_id || payload.sessionId)) || "unknown-session",
    toolUseId: (payload && (payload.tool_use_id || payload.toolUseId)) || undefined,
    source: "claude-code",
    hookEvent,
    title: buildTitle(hookEvent, type, payload),
    data: buildData(hookEvent, type, payload),
    sourcePayloadSanitized: sanitizeValue(payload, 0, undefined) || {},
    risk: null,
  };
}

function fsSafeStamp(iso) {
  return iso.replace(/[:.]/g, "-");
}

/** Compute the events directory for a session. Pure. */
function eventsDir(projectDir, sessionId) {
  return path.join(projectDir, ".agenttrace", "runs", sanitizeSessionId(sessionId), "events");
}

function sanitizeSessionId(id) {
  return String(id || "unknown-session").replace(/[^A-Za-z0-9._-]/g, "_");
}

/** Atomic write: temp file then rename into place. */
function writeEventFile(dir, event) {
  fs.mkdirSync(dir, { recursive: true });
  const rand = Math.random().toString(36).slice(2, 8);
  const base =
    fsSafeStamp(event.ts) +
    "-" +
    String(event.seq).padStart(4, "0") +
    "-" +
    event.hookEvent +
    "-" +
    process.pid +
    "-" +
    rand;
  const finalPath = path.join(dir, base + ".json");
  const tmpPath = path.join(dir, ".tmp-" + rand + "-" + base);
  fs.writeFileSync(tmpPath, JSON.stringify(event), "utf8");
  fs.renameSync(tmpPath, finalPath);
  return finalPath;
}

function writeDiag(projectDir, message) {
  try {
    const dir = path.join(projectDir, ".agenttrace");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "diagnostic.log");
    const line = new Date().toISOString() + " " + message + "\n";
    let existing = "";
    try {
      existing = fs.readFileSync(file, "utf8");
    } catch (_) {
      existing = "";
    }
    let next = existing + line;
    if (next.length > DIAG_CAP) next = next.slice(next.length - DIAG_CAP);
    fs.writeFileSync(file, next, "utf8");
  } catch (_) {
    /* diagnostics are best-effort; swallow */
  }
}

function resolveProjectDir(payload) {
  return (
    process.env.CLAUDE_PROJECT_DIR ||
    (payload && typeof payload.cwd === "string" ? payload.cwd : undefined) ||
    process.cwd()
  );
}

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch (_) {
    return "";
  }
}

// ---- Guard (opt-in, fail-open) ----
var GUARD_ORDER = { safe: 0, low: 1, medium: 2, high: 3, critical: 4 };

function loadPolicyMode(projectDir) {
  try {
    const pol = JSON.parse(fs.readFileSync(path.join(projectDir, ".agenttrace", "policy.json"), "utf8"));
    return {
      mode: pol.mode || "off",
      blockAtOrAbove: pol.blockAtOrAbove || "critical",
      warnAtOrAbove: pol.warnAtOrAbove || "high",
      allow: Array.isArray(pol.allow) ? pol.allow : [],
    };
  } catch (_) {
    return null;
  }
}

/** Minimal mirror of the catastrophic risk rules for the live block path. Pure. */
function guardAssess(payload) {
  const tool = toolName(payload);
  const input = toolInput(payload);
  const cmd = typeof input.command === "string" ? input.command : "";
  const np = String(input.file_path || input.path || input.notebook_path || "").replace(/\\/g, "/");
  const mk = (level, reversibility, reason) => ({ level, reversibility, reason });
  if (/\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r|\brm\s+-rf\b/.test(cmd)) return mk("critical", "irreversible", "Recursive force-delete (rm -rf)");
  if (/\b(?:remove-item|ri)\b(?=[^\n]*\s-recurse\b)(?=[^\n]*\s-force\b)/i.test(cmd)) return mk("critical", "irreversible", "Recursive force-delete (Remove-Item -Recurse -Force)");
  if (/git\s+push\b[^\n]*\b(main|master)\b/.test(cmd)) return mk("critical", "irreversible", "Push to main/master");
  if (/\b(npm|yarn|pnpm)\s+publish\b/.test(cmd)) return mk("critical", "irreversible", "Package publish");
  if (/\b(drop\s+(table|database)|truncate\s+table)\b/i.test(cmd)) return mk("critical", "irreversible", "Destructive database command");
  if (isFileEditTool(tool) && /(^|\/)\.env(\.[\w-]+)?$/.test(np)) return mk("critical", "irreversible", ".env file write: " + np);
  if (tool === "Read" && /(^|\/)\.env(\.[\w-]+)?$/.test(np)) return mk("critical", null, ".env file read: " + np);
  if (/\brm\s+(?!-[a-z]*[rf])|\bgit\s+rm\b|\bdel\s+|\b(?:remove-item|ri)\b|\brmdir\b|\brd\s+\/s\b/i.test(cmd)) return mk("high", "irreversible", "File deletion command");
  if (/\b(?:curl|wget)\b[^\n]*(?:-X\s*(?:POST|PUT|PATCH|DELETE)|--data)|\bgit\s+push\b|\b(?:vercel|netlify|fly)\s+deploy\b/i.test(cmd)) return mk("high", "irreversible", "Outbound network call with side effects");
  return null;
}

/** Evaluate the proposed tool call against policy; record the decision; emit deny on block. */
function applyGuard(projectDir, payload, sessionId) {
  const policy = loadPolicyMode(projectDir);
  if (!policy || policy.mode === "off") return;
  const input = toolInput(payload);
  const cmd = typeof input.command === "string" ? input.command : "";
  for (const pat of policy.allow) {
    try {
      if (cmd && new RegExp(pat).test(cmd)) return;
    } catch (_) {
      /* ignore bad patterns */
    }
  }
  const g = guardAssess(payload);
  if (!g) return;
  const order = GUARD_ORDER[g.level] || 0;
  let verdict = null;
  if (policy.mode === "block" && order >= (GUARD_ORDER[policy.blockAtOrAbove] || 4)) verdict = "block";
  else if (order >= (GUARD_ORDER[policy.warnAtOrAbove] || 3)) verdict = "warn";
  if (!verdict) return;
  try {
    writeEventFile(eventsDir(projectDir, sessionId), {
      v: SCHEMA_VERSION,
      ts: new Date().toISOString(),
      seq: 0,
      type: "permission",
      sessionId,
      source: "claude-code",
      hookEvent: "guard",
      title: (verdict === "block" ? "Guard blocked: " : "Guard warned: ") + (cmd || g.reason),
      data: { decision: "guard_" + verdict, reason: g.reason, level: g.level, command: cmd },
      sourcePayloadSanitized: {},
      risk: null,
    });
  } catch (_) {
    /* recording is best-effort */
  }
  if (verdict === "block") {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "AgentTrace Guard: " + g.reason,
        },
      }),
    );
  }
}

/** Script entrypoint. Reads stdin, captures one event, always exits 0. */
function main() {
  let projectDir = process.cwd();
  try {
    const hookEvent = process.argv[2] || "Unknown";
    const raw = readStdin();
    let payload = {};
    if (raw && raw.trim().length > 0) {
      try {
        payload = JSON.parse(raw);
      } catch (e) {
        projectDir = resolveProjectDir({});
        writeDiag(projectDir, "parse-error " + hookEvent + ": " + (e && e.message));
        process.exit(0);
        return;
      }
    }
    projectDir = resolveProjectDir(payload);
    const effectiveEvent = payload && payload.hook_event_name ? payload.hook_event_name : hookEvent;
    const event = normalizeEvent(effectiveEvent, payload, 0, new Date().toISOString());
    writeEventFile(eventsDir(projectDir, event.sessionId), event);
    if (effectiveEvent === "PreToolUse") {
      try {
        applyGuard(projectDir, payload, event.sessionId);
      } catch (_) {
        /* fail-open: a guard error must never block the tool */
      }
    }
  } catch (e) {
    try {
      writeDiag(projectDir, "capture-error: " + (e && e.stack ? e.stack : String(e)));
    } catch (_) {
      /* swallow */
    }
  } finally {
    process.exit(0);
  }
}

module.exports = {
  SCHEMA_VERSION,
  redactSecrets,
  truncate,
  scrubString,
  sanitizeValue,
  mapType,
  buildTitle,
  buildData,
  normalizeEvent,
  eventsDir,
  sanitizeSessionId,
  isFileEditTool,
  guardAssess,
};

if (require.main === module) {
  main();
}
