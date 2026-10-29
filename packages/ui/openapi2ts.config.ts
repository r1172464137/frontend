import type { OpenAPIObject, SchemaObject } from "openapi3-ts";

// Required response fields reflect the cutover-only management API. Optional
// receipt and connection fields must not be manufactured by generated clients.
export const responseRequiredOverrides: Record<string, string[]> = {
  DownloadLink: [],
  NodeConfig: [
    "dns",
    "ip_strategy",
    "node_pull_interval",
    "node_push_interval",
    "node_secret",
    "routing",
    "routing_revision",
    "routing_mode",
    "routing_capabilities",
    "traffic_report_threshold",
  ],
  NodeDNS: ["proto", "address", "domains"],
  NodeOutbound: ["name", "protocol", "address", "port", "password", "rules"],
  ServerNodeConfigOverride: [
    "dns",
    "inherit_dns",
    "inherit_ip_strategy",
    "inherit_routing",
    "ip_strategy",
    "routing",
    "routing_revision",
  ],
  ServerNodeConfigValues: [
    "dns",
    "ip_strategy",
    "routing",
    "routing_mode",
    "routing_revision",
  ],
  RoutingStatusView: ["known", "reporter_verified"],
  RoutingStatusReport: ["routing_version", "received_at", "updated_at"],
};

export function requireResponseProperties(openAPIData: OpenAPIObject) {
  const schemas = openAPIData.components?.schemas ?? {};

  for (const [name, schema] of Object.entries(schemas)) {
    if (name.endsWith("Request") || "$ref" in schema) {
      continue;
    }

    const responseSchema = schema as SchemaObject;
    if (responseSchema.properties) {
      if (name.endsWith("ResponseSuccessBean")) {
        Reflect.deleteProperty(responseSchema.properties, "data");
      }
      const typeName = name.split(".").at(-1) ?? name;
      if (
        typeName === "ServerNodeConfigOverride" &&
        responseSchema.properties.routing
      ) {
        responseSchema.properties.routing = {
          allOf: [responseSchema.properties.routing],
          nullable: true,
        };
      }
      responseSchema.required =
        responseRequiredOverrides[typeName] ??
        Object.keys(responseSchema.properties);
    }
  }

  return openAPIData;
}

// Keep wire-generated names distinct from the hand-maintained narrow/presence
// types in src/node-routing-contract.d.ts. Rewrites are applied only to admin.
export function adaptAdminRoutingSchemas(openAPIData: OpenAPIObject) {
  const schemas = openAPIData.components?.schemas;
  if (!schemas) return openAPIData;
  const names: Record<string, string> = {
    "dto.NodeConfig": "dto.GeneratedNodeConfig",
    "config.NodeRouting": "config.GeneratedNodeRouting",
    "config.NodeOutbound": "config.GeneratedConfigNodeOutbound",
    "dto.GetServerNodeConfigResponse":
      "dto.GeneratedGetServerNodeConfigResponse",
    "dto.ServerNodeConfigOverride": "dto.GeneratedServerNodeConfigOverride",
    "dto.ServerNodeConfigValues": "dto.GeneratedServerNodeConfigValues",
    "dto.UpdateServerNodeConfigRequest":
      "dto.GeneratedUpdateServerNodeConfigRequest",
    "dto.RoutingStatusView": "dto.GeneratedRoutingStatusView",
  };
  for (const [oldName, newName] of Object.entries(names)) {
    if (schemas[oldName]) {
      schemas[newName] = schemas[oldName];
      Reflect.deleteProperty(schemas, oldName);
    }
  }
  function rewrite(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) rewrite(item);
      return;
    }
    const object = value as Record<string, unknown>;
    if (typeof object.$ref === "string") {
      const prefix = "#/components/schemas/";
      const name = object.$ref.startsWith(prefix)
        ? object.$ref.slice(prefix.length)
        : "";
      if (names[name]) object.$ref = prefix + names[name];
    }
    for (const item of Object.values(object)) rewrite(item);
  }
  rewrite(openAPIData);
  return openAPIData;
}

// openapi2ts only strips the prefix shared by every path. Common also serves
// /healthz and /readyz, so strip /v1 explicitly to keep names like
// getCommonSiteConfig instead of getV1CommonSiteConfig.
function commonFunctionName({
  method,
  path,
}: {
  method: string;
  path: string;
}) {
  const name = path
    .replace(/^\/v1(?=\/)/, "")
    .split("/")
    .map((segment) => {
      const word = segment
        .replace(/[-_](\w)/g, (_, letter: string) => letter.toUpperCase())
        .replace(/\W/g, "");
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join("");

  return `${method}${name}`;
}

const baseConfig = {
  requestLibPath: "import request from '@workspace/ui/lib/request';",
  serversPath: "./src/services",
  templatesFolder: "./openapi-templates",
  apiPrefix: "import.meta.env.VITE_API_PREFIX || ''",
  hook: {
    afterOpenApiDataInited: requireResponseProperties,
  },
};

const config = [
  {
    ...baseConfig,
    schemaPath:
      "https://raw.githubusercontent.com/perfect-panel/frontend/refs/heads/main/docs/public/swagger/common.json",
    projectName: "common",
    hook: {
      ...baseConfig.hook,
      customFunctionName: commonFunctionName,
    },
  },
  {
    ...baseConfig,
    schemaPath:
      "https://raw.githubusercontent.com/perfect-panel/frontend/refs/heads/main/docs/public/swagger/user.json",
    projectName: "user",
  },
  {
    ...baseConfig,
    // Admin generation must use the checked-in same-batch backend contract;
    // remote main may still be pre-cutover during local development.
    schemaPath: "../../docs/public/swagger/admin.json",
    projectName: "admin",
    hook: {
      ...baseConfig.hook,
      afterOpenApiDataInited: (data: OpenAPIObject) =>
        adaptAdminRoutingSchemas(requireResponseProperties(data)),
    },
  },
];

export default config;
