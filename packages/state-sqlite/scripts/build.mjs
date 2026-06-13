import { mkdir, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(root, "dist", "cli.js");

await mkdir(dirname(outfile), { recursive: true });

await esbuild.build({
  entryPoints: [join(root, "src", "cli.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: {
    js: "#!/usr/bin/env node",
  },
});

await chmod(outfile, 0o755);
