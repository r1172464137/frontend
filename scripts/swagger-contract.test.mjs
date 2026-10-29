import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const swaggerDir = path.join(repoRoot, "docs", "public", "swagger");
test("Swagger assets satisfy the frontend documentation contract", async () => {
  const backendManifest = (
    await readFile(path.join(swaggerDir, ".backend-generated"), "utf8")
  )
    .split("\n")
    .filter(Boolean);
  const entries = await readdir(swaggerDir);
  const jsonFiles = entries.filter((entry) => entry.endsWith(".json")).sort();

  assert.ok(
    jsonFiles.includes("ppanel.json"),
    "docs/public/swagger must include ppanel.json as the aggregate API spec"
  );
  assert.ok(
    !jsonFiles.includes("gateway.json"),
    "the retired gateway spec must not be published"
  );

  for (const fileName of backendManifest) {
    assert.ok(
      jsonFiles.includes(fileName),
      `backend manifest entry ${fileName} must exist in docs/public/swagger`
    );
  }

  for (const fileName of jsonFiles) {
    const filePath = path.join(swaggerDir, fileName);
    let spec;
    try {
      spec = JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      throw new Error(`${fileName} must be valid JSON: ${error.message}`);
    }

    assert.ok(
      typeof spec === "object" && spec !== null && !Array.isArray(spec),
      `${fileName} must contain a JSON object`
    );
    assert.ok(
      spec.swagger || spec.openapi,
      `${fileName} must declare a swagger or openapi version`
    );
    assert.ok(
      spec.paths &&
        typeof spec.paths === "object" &&
        Object.keys(spec.paths).length > 0,
      `${fileName} must contain at least one API path`
    );
  }

  console.log(
    `Validated ${jsonFiles.length} Swagger JSON file(s): ${jsonFiles.join(", ")}`
  );
});

test("admin Swagger exposes cutover-only routing and actual conflict responses", async () => {
  const spec = JSON.parse(
    await readFile(path.join(swaggerDir, "admin.json"), "utf8")
  );
  for (const definition of [
    "dto.NodeConfig",
    "dto.ServerNodeConfigOverride",
    "dto.ServerNodeConfigValues",
    "dto.UpdateServerNodeConfigRequest",
  ]) {
    const properties = spec.definitions?.[definition]?.properties;
    assert.ok(properties, `admin Swagger definition ${definition} must exist`);
    for (const field of ["routing", "routing_revision"])
      assert.ok(properties[field], `${definition}.${field} must exist`);
    for (const field of [
      "block",
      "block_ips",
      "block_protocols",
      "outbound",
      "inherit_block",
      "inherit_outbound",
    ])
      assert.equal(
        field in properties,
        false,
        `${definition}.${field} must not exist`
      );
  }
  assert.ok(
    spec.definitions["dto.RoutingStatusReport"].properties.routing_sequence
  );
  assert.ok(spec.definitions["dto.RoutingStatusReport"].properties.liveness_at);
  assert.ok(spec.paths["/v1/admin/server/create"].post.responses["422"]);
  assert.ok(spec.paths["/v1/admin/server/update"].post.responses["422"]);
  assert.ok(spec.paths["/v1/admin/system/node_config"].put.responses["409"]);
  const serverUpdate = spec.paths["/v1/admin/server/node_config/update"].post;
  assert.ok(serverUpdate.responses["409"]);
  assert.match(
    serverUpdate.description,
    /new or offline servers without requiring a routing status report/i
  );
  assert.match(serverUpdate.description, /success does not mean applied/i);
  assert.match(
    spec.paths["/v1/admin/server/node_config"].get.description,
    /unknown or pending does not prevent configuration saves/i
  );
  assert.equal(spec.paths["/v1/admin/system/node_config/preview"], undefined);
  assert.equal(spec.paths["/v1/admin/server/node_config/preview"], undefined);
});
