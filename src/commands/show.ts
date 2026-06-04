import { readRun, resolveRunId } from "../trace/read.js";
import { renderTimeline } from "../render/timeline.js";
import { pc } from "../render/colors.js";

export function runShow(root: string, idOrLatest: string, opts: { json?: boolean }): number {
  const id = resolveRunId(root, idOrLatest);
  if (!id) {
    console.error(pc.red(`No run matching "${idOrLatest}". Try \`agenttrace list\`.`));
    return 1;
  }
  const run = readRun(root, id);
  if (opts.json) {
    console.log(JSON.stringify(run, null, 2));
    return 0;
  }
  console.log(renderTimeline(run));
  return 0;
}
