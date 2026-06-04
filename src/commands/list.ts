import { listRuns } from "../trace/read.js";
import { renderRunTable } from "../render/table.js";

export function runList(root: string, opts: { limit?: number; json?: boolean }): void {
  const summaries = listRuns(root, opts.limit);
  if (opts.json) {
    console.log(JSON.stringify(summaries, null, 2));
    return;
  }
  console.log(renderRunTable(summaries));
}
