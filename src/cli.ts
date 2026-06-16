#!/usr/bin/env node
import { Command } from "commander";
import { VERSION } from "./version.js";
import { printInit, runInit } from "./commands/init.js";
import { runList } from "./commands/list.js";
import { runShow } from "./commands/show.js";
import { runReceipt } from "./commands/receipt.js";
import { runRun } from "./commands/run.js";
import { runExport } from "./commands/export.js";
import { runImport } from "./commands/import.js";
import { runUi } from "./commands/ui.js";
import { runGuard } from "./commands/guard.js";
import { runMcp } from "./commands/mcp.js";
import { runDoctor } from "./commands/doctor.js";
import { runUninstall } from "./commands/uninstall.js";

const program = new Command();

program
  .name("agenttrace")
  .description("The open-source flight recorder for AI agents (Claude Code adapter).")
  .version(VERSION);

program
  .command("init")
  .description("Initialize AgentTrace in this repo and wire Claude Code hooks.")
  .action(() => {
    printInit(runInit(process.cwd()));
  });

program
  .command("run")
  .description("Record any command as a run (any agent or script). Use: agenttrace run -- <command>")
  .argument("<command...>", "command to run, e.g. -- npm test")
  .action(async (command: string[]) => {
    process.exitCode = await runRun(process.cwd(), command);
  });

program
  .command("guard [subcommand] [args...]")
  .description("Policy guard: status | on [--block] | off | test -- <command>")
  .option("--block", "with `on`: block the worst actions, not just warn")
  .allowUnknownOption() // so `guard test -- rm -rf /` doesn't parse -rf as a flag
  .action((subcommand, args, opts) => {
    process.exitCode = runGuard(process.cwd(), subcommand, args ?? [], { block: opts.block });
  });

program
  .command("mcp")
  .description("Run the AgentTrace MCP stdio server (expose runs/receipts/risk to agents & IDEs).")
  .action(() => {
    process.exitCode = runMcp(process.cwd());
  });

program
  .command("list")
  .description("List recorded runs.")
  .option("-n, --limit <n>", "max runs to show", (v) => parseInt(v, 10))
  .option("--since <duration>", "only show runs started within this window (e.g. 30m, 24h, 7d)")
  .option("--json", "output JSON")
  .action((opts) => {
    runList(process.cwd(), { limit: opts.limit, since: opts.since, json: opts.json });
  });

program
  .command("show <run>")
  .description('Show a run timeline ("latest" or a run id / prefix).')
  .option("--json", "output JSON")
  .action((run, opts) => {
    process.exitCode = runShow(process.cwd(), run, { json: opts.json });
  });

program
  .command("receipt <run>")
  .description('Generate a markdown receipt ("latest" or a run id / prefix).')
  .option("-o, --out <file>", "write the receipt to a file")
  .option("--json", "output the receipt as JSON")
  .option("--card", "output a shareable SVG card instead of markdown")
  .action((run, opts) => {
    process.exitCode = runReceipt(process.cwd(), run, { out: opts.out, json: opts.json, card: opts.card });
  });

program
  .command("export <run>")
  .description('Export a run events JSONL ("latest" or a run id / prefix).')
  .option("-o, --out <file>", "copy events.jsonl to a file")
  .action((run, opts) => {
    process.exitCode = runExport(process.cwd(), run, { out: opts.out });
  });

program
  .command("import <file>")
  .description("Import an external trace (--adapter github-actions|n8n).")
  .requiredOption("--adapter <name>", "github-actions or n8n")
  .action((file, opts) => {
    process.exitCode = runImport(process.cwd(), file, opts.adapter);
  });

program
  .command("ui")
  .description("Open the local dashboard in a browser.")
  .option("-p, --port <n>", "port to listen on", (v) => parseInt(v, 10))
  .option("--no-open", "do not auto-open the browser")
  .action((opts) => {
    process.exitCode = runUi(process.cwd(), { port: opts.port, open: opts.open });
  });

program
  .command("doctor")
  .description("Verify the AgentTrace install and optionally repair it.")
  .option("--fix", "repair problems found")
  .action((opts) => {
    process.exitCode = runDoctor(process.cwd(), { fix: opts.fix });
  });

program
  .command("uninstall")
  .description("Remove AgentTrace hooks and runtime (keeps traces unless --purge).")
  .option("--purge", "also delete all recorded traces")
  .action((opts) => {
    process.exitCode = runUninstall(process.cwd(), { purge: opts.purge });
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
