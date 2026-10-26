import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  ".github/workflows/openapi-adaptation.yml",
  "utf8"
);

test("openapi adaptation workflow triggers only for main pushes that touch swagger JSON and manual reruns", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /dry_run:/);
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /paths:\n\s+- ['"]docs\/public\/swagger\/\*\.json['"]/);
  assert.doesNotMatch(workflow, /^\s+pull_request(?:_target)?:/m);
});

test("openapi adaptation workflow checks out trusted fork main with read-only permissions", () => {
  assert.match(workflow, /permissions:\n\s+contents: read/);
  assert.match(
    workflow,
    /uses: actions\/checkout@v4\n\s+with:\n\s+ref: main/
  );
  assert.doesNotMatch(
    workflow,
    /uses: actions\/checkout@v4\n\s+with:\n\s+ref: \$\{\{ github\.sha \}\}/
  );
  assert.doesNotMatch(workflow, /github\.head_ref/);
});

test("openapi adaptation workflow sends only automation webhook context and metadata", () => {
  assert.match(
    workflow,
    /AUTOMATION_WEBHOOK_URL: \$\{\{ secrets\.AUTOMATION_WEBHOOK_URL \}\}/
  );
  assert.match(
    workflow,
    /AUTOMATION_WEBHOOK_SECRET: \$\{\{ secrets\.AUTOMATION_WEBHOOK_SECRET \}\}/
  );
  assert.match(workflow, /AUTOMATION_EVENT_TYPE: openapi\.adapt/);
  assert.match(workflow, /AUTOMATION_DRY_RUN:/);
  assert.match(workflow, /GITHUB_EVENT_NAME: \$\{\{ github\.event_name \}\}/);
  assert.match(workflow, /GITHUB_EVENT_ACTION: \$\{\{ github\.event\.action \|\| '' \}\}/);
  assert.match(workflow, /GITHUB_DELIVERY: \$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /GITHUB_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /GITHUB_REF: \$\{\{ github\.ref \}\}/);
  assert.match(workflow, /GITHUB_EVENT_PATH: \$\{\{ github\.event_path \}\}/);
  assert.match(workflow, /Automation webhook is not configured/);
  assert.match(workflow, /-z \"\$AUTOMATION_WEBHOOK_URL\"/);
  assert.match(workflow, /-z \"\$AUTOMATION_WEBHOOK_SECRET\"/);
  assert.doesNotMatch(workflow, /BRIDGE_/);
});

test("openapi adaptation workflow has no generator, build, commit, or push side effects", () => {
  assert.doesNotMatch(workflow, /bun run openapi/);
  assert.doesNotMatch(workflow, /openapi2ts/);
  assert.doesNotMatch(workflow, /bun run build/);
  assert.doesNotMatch(workflow, /turbo build/);
  assert.doesNotMatch(workflow, /git\s+(?:add|commit|push)\b/);
});
