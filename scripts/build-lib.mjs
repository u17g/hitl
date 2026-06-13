import { execSync } from "node:child_process";
import { chmod, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import * as esbuild from "esbuild";

const pkgDir = process.cwd();
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

function readJsxImportSource() {
  const tsconfigPath = join(pkgDir, "tsconfig.json");
  if (!existsSync(tsconfigPath)) return undefined;
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
  return tsconfig.compilerOptions?.jsxImportSource;
}

const jsxImportSource = readJsxImportSource();

function resolveSrcFromDist(distPath) {
  const rel = distPath.replace(/^\.\/dist\//, "").replace(/\.js$/, "");
  const candidates = [
    join("src", `${rel}.ts`),
    join("src", `${rel}.tsx`),
    join("src", rel, "index.ts"),
    join("src", rel, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(pkgDir, candidate))) {
      return candidate;
    }
  }
  throw new Error(`Cannot resolve source for export "${distPath}" in ${pkg.name}`);
}

function collectDistExports(exportsField) {
  const distPaths = new Set();

  for (const value of Object.values(exportsField ?? {})) {
    if (typeof value === "string") {
      if (value.startsWith("./dist/")) distPaths.add(value);
      continue;
    }
    if (value && typeof value === "object") {
      for (const target of [value.import, value.default, value.require]) {
        if (typeof target === "string" && target.startsWith("./dist/")) {
          distPaths.add(target);
        }
      }
    }
  }

  return [...distPaths];
}

const libEntries = collectDistExports(pkg.exports).map((distPath) =>
  join(pkgDir, resolveSrcFromDist(distPath)),
);

const binEntries = Object.values(pkg.bin ?? {}).map((distPath) =>
  join(pkgDir, resolveSrcFromDist(distPath)),
);

const entryPoints = [...new Set([...libEntries, ...binEntries])];

if (entryPoints.length === 0) {
  throw new Error(`No dist exports or bin entries found for ${pkg.name}`);
}

await mkdir(join(pkgDir, "dist"), { recursive: true });

await esbuild.build({
  entryPoints,
  outdir: join(pkgDir, "dist"),
  outbase: join(pkgDir, "src"),
  bundle: true,
  splitting: false,
  format: "esm",
  platform: "node",
  target: "node22",
  packages: "external",
  jsx: jsxImportSource ? "automatic" : undefined,
  jsxImportSource,
});

for (const [name, distPath] of Object.entries(pkg.bin ?? {})) {
  const outfile = join(pkgDir, distPath);
  const contents = readFileSync(outfile, "utf8");
  if (!contents.startsWith("#!")) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(outfile, `#!/usr/bin/env node\n${contents}`);
  }
  await chmod(outfile, 0o755);
  void name;
}

const tsconfigBuild = join(pkgDir, "tsconfig.build.json");
if (existsSync(tsconfigBuild)) {
  execSync("tsc -p tsconfig.build.json", { cwd: pkgDir, stdio: "inherit" });
}

const built = entryPoints.map((entry) => relative(pkgDir, entry)).join(", ");
console.log(`Built ${pkg.name}: ${built}`);
