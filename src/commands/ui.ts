import http from "node:http";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { buildApiResponse } from "../server/api.js";
import { assetPath } from "../util/pkg.js";
import { exists } from "../util/fs.js";
import { agenttraceDir } from "../util/paths.js";
import { pc } from "../render/colors.js";

const DEFAULT_PORT = 4317;

export function runUi(
  root: string,
  opts: { port?: number; open?: boolean },
): number {
  if (!exists(agenttraceDir(root))) {
    console.error(pc.red("No .agenttrace/ store here. Run `agenttrace init` first."));
    return 1;
  }

  const htmlPath = assetPath("dashboard.html");
  let html = "";
  try {
    html = fs.readFileSync(htmlPath, "utf8");
  } catch {
    console.error(pc.red(`Dashboard asset missing: ${htmlPath}`));
    return 1;
  }

  const port = opts.port ?? DEFAULT_PORT;

  const server = http.createServer((req, res) => {
    const pathname = (req.url ?? "/").split("?")[0] ?? "/";
    try {
      const api = buildApiResponse(root, pathname);
      if (api) {
        res.writeHead(api.status, {
          "content-type": api.contentType,
          "cache-control": "no-store",
        });
        res.end(api.body);
        return;
      }
      // everything else serves the single-page dashboard
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
  });

  server.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE") {
      console.error(pc.red(`Port ${port} is in use. Try: agenttrace ui --port ${port + 1}`));
    } else {
      console.error(pc.red(`Server error: ${e.message}`));
    }
    process.exit(1);
  });

  server.listen(port, "127.0.0.1", () => {
    const url = `http://localhost:${port}`;
    console.log(pc.bold(pc.green("AgentTrace dashboard")));
    console.log(`  ${pc.cyan(url)}`);
    console.log(pc.dim("  Press Ctrl+C to stop."));
    if (opts.open) openBrowser(url);
  });

  return 0;
}

function openBrowser(url: string): void {
  try {
    const platform = process.platform;
    if (platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } else if (platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    /* opening is best-effort */
  }
}
