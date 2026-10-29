import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  requireResponseProperties,
  responseRequiredOverrides,
} from "../packages/ui/openapi2ts.config.ts";

const root = new URL("../", import.meta.url);
const types = [
  "NodeConfig",
  "NodeOutbound",
  "ServerNodeConfigOverride",
  "ServerNodeConfigValues",
  "RoutingStatusView",
];
function typeBody(source, typeName) {
  const match = source.match(
    new RegExp(`type ${typeName} = \\{([\\s\\S]*?)\\};`)
  );
  if (!match) throw new Error(`generated typings must contain ${typeName}`);
  return match[1];
}
test("OpenAPI generator uses cutover-only required fields and nullable inheritance", async () => {
  const swagger = JSON.parse(
    await readFile(new URL("docs/public/swagger/admin.json", root), "utf8")
  );
  const schemas = {};
  for (const name of types) {
    assert.ok(swagger.definitions?.[`dto.${name}`]);
    schemas[`dto.${name}`] = structuredClone(
      swagger.definitions[`dto.${name}`]
    );
  }
  const transformed = requireResponseProperties({ components: { schemas } });
  for (const name of types)
    assert.deepEqual(
      transformed.components.schemas[`dto.${name}`].required,
      responseRequiredOverrides[name]
    );
  assert.equal(
    transformed.components.schemas["dto.ServerNodeConfigOverride"].properties
      .routing.nullable,
    true
  );
  for (const name of [
    "NodeConfig",
    "ServerNodeConfigOverride",
    "ServerNodeConfigValues",
  ]) {
    const props = schemas[`dto.${name}`].properties;
    for (const field of [
      "block",
      "block_ips",
      "block_protocols",
      "outbound",
      "inherit_block",
      "inherit_outbound",
    ])
      assert.equal(field in props, false, `${name}.${field} is retired`);
  }
});
test("checked-in management typings carry routing and contain no retired write fields", async () => {
  const source = await readFile(
    new URL("packages/ui/src/node-routing-contract.d.ts", root),
    "utf8"
  );
  assert.match(typeBody(source, "NodeConfig"), /routing: NodeRouting;/);
  assert.match(
    typeBody(source, "ServerNodeConfigOverride"),
    /routing: NodeRouting \| null;/
  );
  assert.match(
    typeBody(source, "ServerNodeConfigOverride"),
    /inherit_routing: boolean;/
  );
  const body = typeBody(source, "UpdateServerNodeConfigRequest");
  assert.match(body, /routing_revision\?: number;/);
  assert.match(body, /inherit_routing\?: boolean;/);
  for (const field of [
    "block",
    "outbound",
    "inherit_block",
    "inherit_outbound",
  ])
    assert.doesNotMatch(body, new RegExp(`\\n    ${field}\\??:`));
});
