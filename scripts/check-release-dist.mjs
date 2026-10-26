#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// These strings identify runtime fallbacks that must never be shipped in an
// admin or user dist. Documentation outside the candidate dist is not scanned.
export const FORBIDDEN_RUNTIME_STRINGS = Object.freeze([
  ["api.ppanel.dev", "supplier API host"],
  ["stats.ppanel.dev", "supplier telemetry host"],
  ["ppanel-assets", "supplier asset repository"],
  ["tutorial@latest", "remote tutorial fallback"],
  ["cdn.jsdelivr.net/npm/monaco-editor", "Monaco jsDelivr fallback"],
  ["api.iconify.design", "Iconify API host"],
  ["api.simplesvg.com", "Iconify fallback API host"],
  ["api.unisvg.com", "Iconify fallback API host"],
  ["@lottiefiles/dotlottie", "DotLottie runtime"],
  ["dotlottie-player.wasm", "DotLottie WASM fallback"],
  ["cdn.jsdelivr.net/npm/@lottiefiles", "DotLottie jsDelivr fallback"],
  ["unpkg.com/@lottiefiles", "DotLottie unpkg fallback"],
]);

async function collectFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    } else {
      throw new Error(`unsupported release entry: ${entryPath}`);
    }
  }
  return files;
}

export async function scanReleaseDist(directory) {
  const root = path.resolve(directory);
  if (!(await stat(root)).isDirectory()) {
    throw new Error(`release candidate is not a directory: ${root}`);
  }

  const files = await collectFiles(root);
  const findings = [];
  for (const file of files) {
    const content = (await readFile(file)).toString("utf8").toLowerCase();
    for (const [needle, label] of FORBIDDEN_RUNTIME_STRINGS) {
      if (content.includes(needle)) {
        findings.push({
          file: path.relative(root, file),
          label,
          needle,
        });
      }
    }
  }

  if (findings.length > 0) {
    const details = findings
      .map(
        ({ file, label, needle }) =>
          `- ${file}: ${label} (${JSON.stringify(needle)})`
      )
      .join("\n");
    throw new Error(`forbidden runtime references found:\n${details}`);
  }

  return { filesScanned: files.length, root };
}

async function main() {
  const directory = process.argv[2];
  if (!directory || process.argv.length !== 3) {
    throw new Error(
      "usage: node scripts/check-release-dist.mjs <dist-directory>"
    );
  }

  const result = await scanReleaseDist(directory);
  console.log(
    `RELEASE_DIST_PRIVACY_OK files=${result.filesScanned} path=${result.root}`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(`RELEASE_DIST_PRIVACY_FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
