import fs from "node:fs";
import path from "node:path";
import { readRun, resolveRunId } from "../trace/read.js";
import { generateReceipt, renderReceiptMarkdown } from "../receipt/generate.js";
import { ensureDir } from "../util/fs.js";
import { receiptsDir } from "../util/paths.js";
import { pc } from "../render/colors.js";

export function runReceipt(
  root: string,
  idOrLatest: string,
  opts: { out?: string; json?: boolean },
): number {
  const id = resolveRunId(root, idOrLatest);
  if (!id) {
    console.error(pc.red(`No run matching "${idOrLatest}". Try \`agenttrace list\`.`));
    return 1;
  }
  const run = readRun(root, id);
  const receipt = generateReceipt(run);

  if (opts.json) {
    console.log(JSON.stringify(receipt, null, 2));
    return 0;
  }

  const md = renderReceiptMarkdown(receipt);
  // always keep a copy in the store
  ensureDir(receiptsDir(root));
  fs.writeFileSync(path.join(receiptsDir(root), `${id}.md`), md, "utf8");

  if (opts.out) {
    fs.writeFileSync(opts.out, md, "utf8");
    console.log(pc.green(`✓ Receipt written to ${opts.out}`));
    return 0;
  }
  console.log(md);
  return 0;
}
