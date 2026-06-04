import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to a file shipped in the package's `assets/` directory. */
export function assetPath(name: string): string {
  // src/util -> ../../assets in dev; dist/util -> ../../assets when built. Both land on
  // <packageRoot>/assets.
  return path.resolve(here, "..", "..", "assets", name);
}
