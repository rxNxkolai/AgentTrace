import { type RiskLevel } from "../schema/types.js";
import { readJson, writeJson } from "../util/fs.js";
import { policyPath } from "../util/paths.js";

export type GuardMode = "off" | "warn" | "block";

export interface GuardPolicy {
  /** off = record only (default); warn = annotate risky actions; block = deny the worst. */
  mode: GuardMode;
  /** when mode is "block", deny actions at or above this risk level */
  blockAtOrAbove: RiskLevel;
  /** annotate (warn) actions at or above this risk level */
  warnAtOrAbove: RiskLevel;
  /** commands matching any of these regexes are always allowed (escape hatch) */
  allow: string[];
}

export const DEFAULT_POLICY: GuardPolicy = {
  mode: "off",
  blockAtOrAbove: "critical",
  warnAtOrAbove: "high",
  allow: [],
};

export function loadPolicy(root: string): GuardPolicy {
  const raw = readJson<Partial<GuardPolicy>>(policyPath(root));
  if (!raw) return { ...DEFAULT_POLICY };
  return {
    mode: raw.mode ?? DEFAULT_POLICY.mode,
    blockAtOrAbove: raw.blockAtOrAbove ?? DEFAULT_POLICY.blockAtOrAbove,
    warnAtOrAbove: raw.warnAtOrAbove ?? DEFAULT_POLICY.warnAtOrAbove,
    allow: Array.isArray(raw.allow) ? raw.allow : [],
  };
}

export function savePolicy(root: string, policy: GuardPolicy): void {
  writeJson(policyPath(root), policy);
}
