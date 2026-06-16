import { ensureDir, exists } from "../util/fs.js";
import { agenttraceDir, policyPath } from "../util/paths.js";
import { loadPolicy, savePolicy, type GuardPolicy } from "../guard/policy.js";
import { evaluateAction, type GuardDecision } from "../guard/evaluate.js";
import { pc, riskColor } from "../render/colors.js";

function verdictColor(d: GuardDecision): string {
  if (d.verdict === "block") return pc.bgRed(pc.white(" BLOCK "));
  if (d.verdict === "warn") return pc.yellow("WARN");
  return pc.green("allow");
}

export function runGuard(root: string, sub: string | undefined, rest: string[], opts: { block?: boolean }): number {
  switch (sub) {
    case "on": {
      ensureDir(agenttraceDir(root));
      const policy = loadPolicy(root);
      policy.mode = opts.block ? "block" : "warn";
      savePolicy(root, policy);
      console.log(pc.green(`✓ Guard is ON in ${pc.bold(policy.mode)} mode.`));
      if (policy.mode === "warn") {
        console.log(pc.dim("  Risky actions are flagged but not blocked. Use --block to deny the worst."));
      } else {
        console.log(pc.dim(`  Actions graded ${policy.blockAtOrAbove} or above will be blocked. Always fail-open.`));
      }
      return 0;
    }
    case "off": {
      ensureDir(agenttraceDir(root));
      const policy = loadPolicy(root);
      policy.mode = "off";
      savePolicy(root, policy);
      console.log(pc.green("✓ Guard is OFF — recording only."));
      return 0;
    }
    case "test": {
      const command = rest.join(" ").trim();
      if (!command) {
        console.error(pc.red("Usage: agenttrace guard test <command>"));
        return 1;
      }
      const policy = loadPolicy(root);
      // preview as if blocking, so the dry-run always shows the verdict it would give
      const preview: GuardPolicy = { ...policy, mode: "block" };
      const d = evaluateAction({ command }, preview);
      console.log(`${verdictColor(d)}  ${pc.dim(command)}`);
      console.log(`  risk ${riskColor(d.level, d.level)}${d.reversibility ? pc.dim(` · ${d.reversibility}`) : ""}`);
      console.log(`  ${d.reason}`);
      if (policy.mode === "off") console.log(pc.dim("  (guard is currently OFF — this is a preview. `agenttrace guard on --block` to enforce.)"));
      return 0;
    }
    case "status":
    case undefined: {
      const policy = loadPolicy(root);
      const has = exists(policyPath(root));
      console.log(pc.bold("AgentTrace Guard"));
      console.log(`  mode      ${policy.mode === "off" ? pc.dim("off (recording only)") : pc.green(policy.mode)}`);
      console.log(`  block ≥   ${riskColor(policy.blockAtOrAbove, policy.blockAtOrAbove)}`);
      console.log(`  warn ≥    ${riskColor(policy.warnAtOrAbove, policy.warnAtOrAbove)}`);
      console.log(`  policy    ${has ? policyPath(root) : pc.dim("default (no policy.json)")}`);
      console.log("");
      console.log(pc.dim("  agenttrace guard on [--block]   ·   agenttrace guard test <command>"));
      return 0;
    }
    default:
      console.error(pc.red(`Unknown guard subcommand "${sub}". Use: status | on | off | test`));
      return 1;
  }
}
