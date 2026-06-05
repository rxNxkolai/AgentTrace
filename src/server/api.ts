import { listRuns, readRun, resolveRunId } from "../trace/read.js";
import { generateReceipt } from "../receipt/generate.js";

export interface ApiResponse {
  status: number;
  contentType: string;
  body: string;
}

function json(status: number, value: unknown): ApiResponse {
  return { status, contentType: "application/json", body: JSON.stringify(value) };
}

/**
 * Handle a `/api/*` request against the local trace store. Returns null for any path that is
 * not an API route, so the caller can fall through to serving static assets. Pure except for
 * reading the trace store from disk.
 */
export function buildApiResponse(root: string, pathname: string): ApiResponse | null {
  if (!pathname.startsWith("/api/")) return null;

  // GET /api/runs
  if (pathname === "/api/runs") {
    return json(200, { runs: listRuns(root) });
  }

  // GET /api/runs/<id>  and  /api/runs/<id>/receipt
  const m = /^\/api\/runs\/([^/]+)(\/receipt)?$/.exec(pathname);
  if (m) {
    const idOrLatest = decodeURIComponent(m[1]!);
    const wantReceipt = Boolean(m[2]);
    const id = resolveRunId(root, idOrLatest);
    if (!id) return json(404, { error: `No run matching "${idOrLatest}"` });
    const run = readRun(root, id);
    if (wantReceipt) return json(200, { receipt: generateReceipt(run) });
    return json(200, { run });
  }

  return json(404, { error: "Not found" });
}
