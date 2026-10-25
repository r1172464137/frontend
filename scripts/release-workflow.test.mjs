import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/release.yml",
  import.meta.url
);

test("release workflow ignores documentation and automation-only paths", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  for (const ignoredPath of [
    "docs/**",
    ".github/**",
    "scripts/**",
    "packages/ui/openapi2ts.config.ts",
    "packages/ui/openapi-templates/**",
  ]) {
    assert.match(
      workflow,
      new RegExp(`['\"]${ignoredPath.replaceAll("*", "\\*")}['\"]`),
      `release workflow must ignore ${ignoredPath}`
    );
  }

  assert.match(workflow, /uses:\s*actions\/cache@v4/);
  assert.doesNotMatch(workflow, /uses:\s*actions\/cache@v3/);
});

test("fork releases are tag-gated and use the built-in repository token", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  assert.match(workflow, /tags:\s*\['v\*'\]/);
  assert.match(workflow, /bun-version:\s*'1\.3\.1'/);
  assert.match(workflow, /bun install --frozen-lockfile --ignore-scripts/);
  assert.match(workflow, /startsWith\(github\.ref, 'refs\/tags\/v'\)/);
  assert.match(workflow, /token:\s*\$\{\{ github\.token \}\}/);
  assert.doesNotMatch(workflow, /secrets\.GH_TOKEN/);
  assert.doesNotMatch(workflow, /types:\s*\[published\]/);
  assert.match(workflow, /bash scripts\/build-release\.sh/);
  for (const asset of [
    "ppanel-admin-web.tar.gz", "ppanel-user-web.tar.gz",
    "ppanel-admin-web-with-api.tar.gz", "ppanel-user-web-with-api.tar.gz",
    "ppanel-admin-web.zip", "ppanel-user-web.zip", "SHA256SUMS",
  ]) {
    assert.ok(workflow.includes(`release/${asset}`), `missing release asset ${asset}`);
  }
});

test("the legacy manual release command points at this fork, not upstream", async () => {
  const config = JSON.parse(await readFile(new URL("../.releaserc.json", import.meta.url), "utf8"));
  assert.equal(config.repositoryUrl, "https://github.com/r1172464137/frontend");
});
