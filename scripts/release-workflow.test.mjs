import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/release.yml",
  import.meta.url
);
const buildReleaseUrl = new URL("./build-release.sh", import.meta.url);
const netlifyUrl = new URL("../netlify.toml", import.meta.url);

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
      new RegExp(`['"]${ignoredPath.replaceAll("*", "\\*")}['"]`),
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
  assert.match(
    workflow,
    /name: Run workspace Biome checks\n\s+run: bun run check/
  );
  assert.ok(
    workflow.indexOf("run: bun run check") <
      workflow.indexOf("name: Test applications"),
    "Biome checks must run before release tests and builds"
  );
  assert.match(workflow, /cd packages\/ui && NODE_ENV=test bun run test/);
  assert.match(
    workflow,
    /bun test tests\/functions\/pages-proxy\.test\.ts tests\/functions\/api-dev-proxy\.test\.ts/
  );
  assert.match(workflow, /scripts\/release-dist-privacy\.test\.mjs/);
  assert.match(workflow, /scripts\/swagger-contract\.test\.mjs/);
  assert.match(workflow, /scripts\/openapi-source-contract\.test\.mjs/);
  assert.match(workflow, /scripts\/openapi-generator-contract\.test\.mjs/);
  assert.match(
    workflow,
    /name: Verify generated OpenAPI client\n\s+run: bun run test:openapi/
  );
  assert.ok(
    workflow.indexOf("run: bun run test:openapi") <
      workflow.indexOf("bash scripts/build-release.sh"),
    "OpenAPI regeneration must pass before release builds"
  );
  for (const asset of [
    "ppanel-admin-web.tar.gz",
    "ppanel-user-web.tar.gz",
    "ppanel-admin-web-with-api.tar.gz",
    "ppanel-user-web-with-api.tar.gz",
    "ppanel-admin-web.zip",
    "ppanel-user-web.zip",
    "SHA256SUMS",
  ]) {
    assert.ok(
      workflow.includes(`release/${asset}`),
      `missing release asset ${asset}`
    );
  }
  assert.match(workflow, /No archive embeds an API host or supplier fallback/);
});

test("ordinary root tests and releases execute real OpenAPI regeneration", async () => {
  const pkg = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8")
  );
  assert.match(pkg.scripts.test, /bun run test:openapi/);
  assert.match(
    pkg.scripts["test:openapi"],
    /bun test .*scripts\/openapi-regeneration\.test\.mjs/
  );
});

test("release variants keep an empty API base and established prefixes", async () => {
  const script = await readFile(buildReleaseUrl, "utf8");

  assert.match(script, /for PREFIX in \/api '';/);
  assert.match(
    script,
    /VITE_API_BASE_URL= VITE_API_PREFIX="\$PREFIX" bun run build/
  );
  const privacyScan = 'node "$ROOT/scripts/check-release-dist.mjs" "$DIST"';
  assert.ok(script.includes(privacyScan));
  assert.ok(
    script.indexOf(privacyScan) < script.indexOf('tar -czf "$ARCHIVE"'),
    "each dist must be privacy-scanned before its archive is created"
  );
  for (const asset of [
    "ppanel-admin-web.tar.gz",
    "ppanel-user-web.tar.gz",
    "ppanel-admin-web-with-api.tar.gz",
    "ppanel-user-web-with-api.tar.gz",
    "ppanel-admin-web.zip",
    "ppanel-user-web.zip",
  ]) {
    assert.ok(script.includes(asset), `release builder must retain ${asset}`);
  }
});

test("Netlify has no implicit API proxy target", async () => {
  const config = await readFile(netlifyUrl, "utf8");

  assert.doesNotMatch(config, /api\.ppanel\.dev/);
  assert.doesNotMatch(config, /from\s*=\s*["']\/api\/\*["']/);
  assert.match(config, /No default \/api proxy is configured/);
});

test("semantic-release uses the hardened builder and its exact assets", async () => {
  const config = JSON.parse(
    await readFile(new URL("../.releaserc.json", import.meta.url), "utf8")
  );
  assert.equal(config.repositoryUrl, "https://github.com/r1172464137/frontend");

  const execPlugin = config.plugins.find(
    ([name]) => name === "@semantic-release/exec"
  );
  assert.equal(
    execPlugin?.[1]?.prepareCmd,
    'bash scripts/build-release.sh "$PWD/release"'
  );
  assert.doesNotMatch(execPlugin?.[1]?.prepareCmd ?? "", /\.env/);

  const githubPlugin = config.plugins.find(
    ([name]) => name === "@semantic-release/github"
  );
  const assetPaths = githubPlugin?.[1]?.assets.map(({ path }) => path);
  assert.deepEqual(assetPaths, [
    "release/ppanel-admin-web.tar.gz",
    "release/ppanel-user-web.tar.gz",
    "release/ppanel-admin-web-with-api.tar.gz",
    "release/ppanel-user-web-with-api.tar.gz",
    "release/ppanel-admin-web.zip",
    "release/ppanel-user-web.zip",
    "release/SHA256SUMS",
  ]);
});
