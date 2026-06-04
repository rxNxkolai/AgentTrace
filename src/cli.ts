#!/usr/bin/env node
import { Command } from "commander";
import { VERSION } from "./version.js";
import { printInit, runInit } from "./commands/init.js";
import { runList } from "./commands/list.js";
import { runShow } from "./commands/show.js";
import { runReceipt } from "./commands/receipt.js";
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
  .command("list")
  .description("List recorded runs.")
  .option("-n, --limit <n>", "max runs to show", (v) => parseInt(v, 10))
  .option("--json", "output JSON")
  .action((opts) => {
    runList(process.cwd(), { limit: opts.limit, json: opts.json });
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
  .action((run, opts) => {
    process.exitCode = runReceipt(process.cwd(), run, { out: opts.out, json: opts.json });
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
