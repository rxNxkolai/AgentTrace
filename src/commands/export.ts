import fs from "node:fs";
import path from "node:path";
import { compactRun, resolveRunId } from "../trace/read.js";
import { ensureDir } from "../util/fs.js";
import { pc } from "../render/colors.js";

export function runExport(root: string, idOrLatest: string, opts: { out?: string }): number {
  const id = resolveRunId(root, idOrLatest);
  if (!id) {
    console.error(pc.red(`No run matching "${idOrLatest}". Try \`agenttrace list\`.`));
    return 1;
  }

  const jsonlPath = compactRun(root, id);
  if (opts.out) {
    ensureDir(path.dirname(opts.out));
    fs.copyFileSync(jsonlPath, opts.out);
    console.log(opts.out);
    return 0;
  }

  console.log(jsonlPath);
  return 0;
}
