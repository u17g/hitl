import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_TITLE = "# HITL sdk";
const PACKAGE_TITLE = "# @hitl-sdk/hitl";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(repoRoot, "README.md");
const targetPath = join(repoRoot, "packages/hitl/README.md");
const check = process.argv.includes("--check");

function toPackageReadme(content) {
  if (!content.startsWith(`${ROOT_TITLE}\n`)) {
    throw new Error(`Root README must start with "${ROOT_TITLE}"`);
  }
  return `${PACKAGE_TITLE}${content.slice(ROOT_TITLE.length)}`;
}

function readSource() {
  return readFileSync(sourcePath, "utf8");
}

function sync() {
  const expected = toPackageReadme(readSource());
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, expected);
  console.log("Synced README.md → packages/hitl/README.md");
}

function verify() {
  const expected = toPackageReadme(readSource());

  if (!existsSync(targetPath)) {
    console.error("packages/hitl/README.md is missing. Run: pnpm readme:sync");
    process.exit(1);
  }

  const actual = readFileSync(targetPath, "utf8");
  if (actual !== expected) {
    console.error(
      "packages/hitl/README.md is out of sync with README.md. Run: pnpm readme:sync",
    );
    process.exit(1);
  }
}

try {
  if (check) {
    verify();
  } else {
    sync();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
