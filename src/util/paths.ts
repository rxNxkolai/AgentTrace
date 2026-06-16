import path from "node:path";

export function agenttraceDir(root: string): string {
  return path.join(root, ".agenttrace");
}
export function runsDir(root: string): string {
  return path.join(agenttraceDir(root), "runs");
}
export function runDir(root: string, sessionId: string): string {
  return path.join(runsDir(root), sessionId);
}
export function eventsDirFor(root: string, sessionId: string): string {
  return path.join(runDir(root, sessionId), "events");
}
export function runtimeDir(root: string): string {
  return path.join(agenttraceDir(root), "runtime");
}
export function runtimeHookPath(root: string): string {
  return path.join(runtimeDir(root), "hook.cjs");
}
export function configPath(root: string): string {
  return path.join(agenttraceDir(root), "config.json");
}
export function policyPath(root: string): string {
  return path.join(agenttraceDir(root), "policy.json");
}
export function receiptsDir(root: string): string {
  return path.join(agenttraceDir(root), "receipts");
}
export function claudeSettingsLocalPath(root: string): string {
  return path.join(root, ".claude", "settings.local.json");
}
export function gitignorePath(root: string): string {
  return path.join(root, ".gitignore");
}
