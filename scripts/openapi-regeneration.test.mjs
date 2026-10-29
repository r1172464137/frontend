import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generateService } from "@umijs/openapi";
import config from "../packages/ui/openapi2ts.config.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
test("temporary admin OpenAPI generation is reproducible and the resulting contract typechecks", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ppanel-openapi-"));
  try {
    const admin = config.find((item) => item.projectName === "admin");
    assert.ok(admin);
    await generateService({
      ...admin,
      schemaPath: path.join(root, "docs/public/swagger/admin.json"),
      serversPath: dir,
      templatesFolder: path.join(root, "packages/ui/openapi-templates"),
    });
    for (const file of ["admin.ts", "typings.d.ts", "index.ts"]) {
      const generated = await readFile(path.join(dir, "admin", file), "utf8");
      const checkedIn = await readFile(
        path.join(root, "packages/ui/src/services/admin", file),
        "utf8"
      );
      assert.equal(
        generated,
        checkedIn,
        `${file} differs from actual generation`
      );
    }
    const types = await readFile(
      path.join(root, "packages/ui/src/node-routing-contract.d.ts"),
      "utf8"
    );
    assert.match(types, /type NodeRouting =/);
    assert.match(types, /routing_sequence\?: number/);
    assert.match(types, /liveness_at\?: number/);
    const generatedTypes = await readFile(
      path.join(dir, "admin", "typings.d.ts"),
      "utf8"
    );
    assert.match(generatedTypes, /routing_sequence\?: number/);
    assert.match(generatedTypes, /liveness_at\?: number/);
    const adapter = await readFile(
      path.join(root, "packages/ui/src/services/node-config.ts"),
      "utf8"
    );
    assert.match(adapter, /API\.UpdateNodeConfigRequest/);
    assert.match(adapter, /API\.UpdateServerNodeConfigRequest/);
    const result = spawnSync(
      process.execPath,
      [path.join(root, "node_modules/typescript/bin/tsc"), "--noEmit"],
      { cwd: path.join(root, "apps/admin"), encoding: "utf8" }
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
