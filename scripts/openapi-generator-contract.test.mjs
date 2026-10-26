import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  requireResponseProperties,
  responseRequiredOverrides,
} from "../packages/ui/openapi2ts.config.ts";

const repoRoot = new URL("../", import.meta.url);

const additiveResponseFields = {
  NodeConfig: ["block_ips", "block_protocols"],
  NodeOutbound: ["ip_rules", "protocol_rules"],
  ServerNodeConfigOverride: ["block_ips", "block_protocols"],
  ServerNodeConfigValues: ["block_ips", "block_protocols"],
};

function typeBody(source, typeName) {
  const match = source.match(
    new RegExp(`type ${typeName} = \\{([\\s\\S]*?)\\n  \\};`)
  );
  if (!match) throw new Error(`generated typings must contain ${typeName}`);
  return match[1];
}

test("OpenAPI generation keeps additive route response fields optional", async () => {
  const swagger = JSON.parse(
    await readFile(new URL("docs/public/swagger/admin.json", repoRoot), "utf8")
  );
  const schemas = {};
  for (const typeName of Object.keys(additiveResponseFields)) {
    const definition = swagger.definitions?.[`dto.${typeName}`];
    assert.ok(definition, `admin Swagger must contain dto.${typeName}`);
    schemas[`dto.${typeName}`] = structuredClone(definition);
  }

  const transformed = requireResponseProperties({
    components: { schemas },
  });
  for (const [typeName, optionalFields] of Object.entries(
    additiveResponseFields
  )) {
    const required =
      transformed.components.schemas[`dto.${typeName}`].required ?? [];
    assert.deepEqual(
      required,
      responseRequiredOverrides[typeName],
      `${typeName} must use its mixed-version required-property override`
    );
    for (const field of optionalFields) {
      assert.equal(
        required.includes(field),
        false,
        `${typeName}.${field} must stay optional for shape capability detection`
      );
    }
  }
});

test("checked-in admin typings retain the generator's optional route fields", async () => {
  const typings = await readFile(
    new URL("packages/ui/src/services/admin/typings.d.ts", repoRoot),
    "utf8"
  );
  for (const [typeName, fields] of Object.entries(additiveResponseFields)) {
    const body = typeBody(typings, typeName);
    for (const field of fields) {
      assert.match(
        body,
        new RegExp(`\\n    ${field}\\?: string\\[\\];`),
        `${typeName}.${field} must be optional in generated typings`
      );
    }
  }

  const request = typeBody(typings, "UpdateServerNodeConfigRequest");
  for (const field of ["block_ips", "block_protocols"]) {
    assert.match(request, new RegExp(`\\n    ${field}\\?: string\\[\\];`));
  }
});
