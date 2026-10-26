import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { FORBIDDEN_RUNTIME_STRINGS } from "./check-release-dist.mjs";

const scannerPath = fileURLToPath(
  new URL("./check-release-dist.mjs", import.meta.url)
);

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ppanel-release-privacy-"));
  const dist = path.join(root, "dist");
  await mkdir(path.join(dist, "static"), { recursive: true });
  return { dist, root };
}

function runScanner(dist) {
  return spawnSync(process.execPath, [scannerPath, dist], {
    encoding: "utf8",
  });
}

test("the final-dist scanner ignores documentation outside dist", async () => {
  const { dist, root } = await fixture();
  try {
    await writeFile(
      path.join(dist, "index.html"),
      "<main>local runtime</main>"
    );
    await writeFile(
      path.join(root, "README.md"),
      FORBIDDEN_RUNTIME_STRINGS.map(([needle]) => needle).join("\n")
    );

    const result = runScanner(dist);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /RELEASE_DIST_PRIVACY_OK/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

for (const [needle, label] of FORBIDDEN_RUNTIME_STRINGS) {
  test(`the final-dist scanner rejects ${label}: ${needle}`, async () => {
    const { dist, root } = await fixture();
    try {
      await writeFile(
        path.join(dist, "static", "runtime.js"),
        `runtimeFallback=${JSON.stringify(needle)}`
      );

      const result = runScanner(dist);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /RELEASE_DIST_PRIVACY_FAILED/);
      assert.ok(result.stderr.includes(needle), result.stderr);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
}
