import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import request from "@workspace/ui/lib/request";
import { postServerCreate } from "@workspace/ui/services/admin/admin";
import {
  getServerNodeConfig,
  getSystemNodeConfig,
  postServerNodeConfigUpdate,
  putSystemNodeConfig,
} from "@workspace/ui/services/node-config";
import { afterAll, beforeAll, expect, it } from "vitest";
import { isRoutingConflict } from "./node-routing";

let server: Server;
let originalBase: string | undefined;
let captured: unknown;
const routing: API.NodeRouting = {
  version: 1,
  outbounds: [],
  rules: [],
  default_outbound_id: "direct",
};
const globalConfig: API.NodeConfig = {
  node_secret: "secret",
  node_pull_interval: 60,
  node_push_interval: 10,
  traffic_report_threshold: 1024,
  ip_strategy: "prefer_ipv4",
  dns: [],
  routing,
  routing_revision: 3,
  routing_mode: "global-v1",
  routing_capabilities: [1],
};
const projected: API.NodeRoutingProjection = {
  ...routing,
  mode: "ordered-v1-inherited",
  source: "global",
  source_server_id: 0,
  source_revision: 3,
  local_transition_revision: 0,
};
const values: API.ServerNodeConfigValues = {
  dns: [],
  ip_strategy: "prefer_ipv4",
  routing: projected,
  routing_revision: 3,
  routing_mode: "global-v1",
};
const serverConfig: API.GetServerNodeConfigResponse = {
  global: values,
  effective: values,
  override: {
    dns: [],
    ip_strategy: "",
    inherit_dns: true,
    inherit_ip_strategy: true,
    inherit_routing: true,
    routing: null,
    routing_revision: 0,
  },
  routing_status: { known: false, reporter_verified: false },
};
function response(
  res: import("node:http").ServerResponse,
  status: number,
  data: unknown
) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}
beforeAll(async () => {
  server = createServer((req, res) => {
    if (
      req.method === "GET" &&
      req.url?.startsWith("/v1/admin/system/node_config")
    )
      return response(res, 200, { code: 0, msg: "", data: globalConfig });
    if (
      req.method === "GET" &&
      req.url?.startsWith("/v1/admin/server/node_config")
    )
      return response(res, 200, { code: 0, msg: "", data: serverConfig });
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      captured = JSON.parse(body);
      const value = captured as { routing_revision?: number };
      if (req.url === "/v1/admin/server/create" && req.method === "POST")
        return response(res, 200, { code: 0, msg: "", data: { id: 42 } });
      const global =
        req.url === "/v1/admin/system/node_config" && req.method === "PUT";
      const local =
        req.url === "/v1/admin/server/node_config/update" &&
        req.method === "POST";
      if (!(global || local))
        return response(res, 404, { code: 404, msg: "not found" });
      if (
        [
          "block",
          "block_ips",
          "block_protocols",
          "outbound",
          "inherit_block",
          "inherit_outbound",
          "routing_action",
        ].some((field) => Object.hasOwn(value, field))
      )
        return response(res, 422, {
          code: global ? 160_003 : 140_003,
          msg: "legacy routing removed",
        });
      if (value.routing_revision !== (global ? 3 : 0))
        return response(res, 409, {
          code: global ? 160_001 : 140_002,
          msg: "stale routing revision",
        });
      return response(res, 200, { code: 0, msg: "" });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  originalBase = request.defaults.baseURL;
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("server address unavailable");
  request.defaults.baseURL = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  request.defaults.baseURL = originalBase;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

it("reads the final server-create response with committed ID over HTTP", async () => {
  const body: API.CreateServerRequest = {
    name: "copy",
    address: "example.com",
    country: "",
    city: "",
    protocols: [],
  };
  expect((await postServerCreate(body)).data.data).toEqual({ id: 42 });
  expect(captured).toEqual(body);
});
it("reads the final global and server DTO shape over HTTP", async () => {
  expect((await getSystemNodeConfig()).data.data).toEqual(globalConfig);
  expect((await getServerNodeConfig({ server_id: 7 })).data.data).toEqual(
    serverConfig
  );
});
it("sends a complete v1 policy or explicit inheritance, with top-level revisions and no legacy fields", async () => {
  await putSystemNodeConfig(
    { routing, routing_revision: 3 },
    { skipErrorHandler: true }
  );
  expect(captured).toEqual({ routing, routing_revision: 3 });
  await postServerNodeConfigUpdate(
    { server_id: 7, inherit_routing: true, routing_revision: 0 },
    { skipErrorHandler: true }
  );
  expect(captured).toEqual({
    server_id: 7,
    inherit_routing: true,
    routing_revision: 0,
  });
});
it.each([
  ["global", 160_001],
  ["server", 140_002],
] as const)("preserves real HTTP 409 and body for %s", async (scope, code) => {
  const call =
    scope === "global"
      ? putSystemNodeConfig(
          { routing, routing_revision: 2 },
          { skipErrorHandler: true }
        )
      : postServerNodeConfigUpdate(
          { server_id: 7, routing, routing_revision: 2 },
          { skipErrorHandler: true }
        );
  const error: unknown = await call.catch((caught: unknown) => caught);
  expect(isRoutingConflict(error)).toBe(true);
  expect(error).toMatchObject({ response: { status: 409, data: { code } } });
});
it.each([
  ["global", 160_003],
  ["server", 140_003],
] as const)("observes cutover-only HTTP 422 for retired %s fields", async (scope, code) => {
  const call =
    scope === "global"
      ? putSystemNodeConfig(
          { block: [] } as unknown as API.UpdateNodeConfigRequest,
          { skipErrorHandler: true }
        )
      : postServerNodeConfigUpdate(
          {
            server_id: 7,
            inherit_block: true,
          } as unknown as API.UpdateServerNodeConfigRequest,
          { skipErrorHandler: true }
        );
  const error: unknown = await call.catch((caught: unknown) => caught);
  expect(error).toMatchObject({ response: { status: 422, data: { code } } });
});
it("bundled backend OpenAPI matches the cutover-only management fields", () => {
  const spec: {
    definitions: Record<
      string,
      { properties: Record<string, unknown>; required?: string[] }
    >;
    paths: Record<string, unknown>;
  } = JSON.parse(readFileSync("../../docs/public/swagger/ppanel.json", "utf8"));
  const keys = (name: string) =>
    Object.keys(spec.definitions[name]!.properties).sort();
  expect(keys("dto.NodeConfig")).toEqual(
    [...Object.keys(globalConfig), "routing_downgrade"].sort()
  );
  expect(keys("dto.GetServerNodeConfigResponse")).toEqual(
    [...Object.keys(serverConfig), "desired_snapshot_id"].sort()
  );
  expect(keys("dto.ServerNodeConfigOverride")).toEqual(
    Object.keys(serverConfig.override).sort()
  );
  expect(keys("dto.ServerNodeConfigValues")).toEqual(
    Object.keys(values).sort()
  );
  expect(keys("dto.UpdateServerNodeConfigRequest")).toEqual(
    [
      "dns",
      "inherit_dns",
      "inherit_ip_strategy",
      "inherit_routing",
      "ip_strategy",
      "routing",
      "routing_downgrade",
      "routing_revision",
      "server_id",
    ].sort()
  );
  const routingFields = [
    "version",
    "outbounds",
    "rules",
    "default_outbound_id",
    "user_defaults",
    "dns_policy",
  ];
  const identityFields = [
    "mode",
    "source",
    "source_server_id",
    "source_revision",
    "local_transition_revision",
  ];
  const ruleFields = [
    "id",
    "enabled",
    "remark",
    "kind",
    "values",
    "user_ids",
    "outbound_id",
  ];
  const outboundFields = [
    "address",
    "allow_insecure",
    "alpn",
    "cipher",
    "congestion_controller",
    "encryption",
    "encryption_client_padding",
    "encryption_mode",
    "encryption_password",
    "encryption_rtt",
    "encryption_ticket",
    "fingerprint",
    "flow",
    "heartbeat",
    "host",
    "id",
    "ip_rules",
    "multiplex",
    "name",
    "password",
    "path",
    "plugin",
    "plugin_opts",
    "port",
    "protocol",
    "protocol_rules",
    "reality_public_key",
    "reality_short_id",
    "reduce_rtt",
    "rules",
    "security",
    "service_name",
    "settings",
    "sni",
    "spider_x",
    "stream_settings",
    "transport",
    "udp_stream",
    "uot",
    "uot_version",
    "user",
    "uuid",
    "via_outbound_id",
    "xhttp_extra",
    "xhttp_mode",
  ];
  expect(keys("config.NodeRouting")).toEqual([...routingFields].sort());
  expect(keys("dto.NodeRoutingPolicy")).toEqual(
    [...routingFields, ...identityFields].sort()
  );
  for (const name of ["config.NodeRoute", "dto.NodeRoutingRule"])
    expect(keys(name)).toEqual([...ruleFields].sort());
  for (const name of ["config.NodeOutbound", "dto.NodeOutbound"])
    expect(keys(name)).toEqual([...outboundFields].sort());
  expect(keys("config.NodeUserDefault")).toEqual(["outbound_id", "user_id"]);
  expect(keys("config.NodeDNSPolicy")).toEqual(["query_strategy", "resolvers"]);
  expect(keys("config.NodeDNSResolver")).toEqual([
    "address",
    "bootstrap_ip",
    "domains",
    "id",
    "outbound_id",
    "protocol",
  ]);
  expect(keys("dto.RoutingCandidateIdentity")).toEqual(
    [...identityFields, "snapshot_id"].sort()
  );
  expect(keys("dto.RoutingReportError")).toEqual([
    "identity",
    "message",
    "stage",
  ]);
  expect(keys("dto.RoutingStatusView")).toEqual([
    "known",
    "report",
    "reporter_verified",
  ]);
  expect(keys("dto.RoutingStatusReport")).toEqual([
    "conflict",
    "instance_id",
    "liveness_at",
    "received_at",
    "routing_applied",
    "routing_error",
    "routing_pending",
    "routing_sequence",
    "routing_version",
    "updated_at",
  ]);
  expect(spec.definitions["config.NodeRouting"]!.properties).toMatchObject({
    dns_policy: { $ref: "#/definitions/config.NodeDNSPolicy" },
    user_defaults: {
      type: "array",
      items: { $ref: "#/definitions/config.NodeUserDefault" },
    },
    rules: { type: "array", items: { $ref: "#/definitions/config.NodeRoute" } },
    outbounds: {
      type: "array",
      items: { $ref: "#/definitions/config.NodeOutbound" },
    },
  });
  expect(spec.definitions["dto.NodeRoutingPolicy"]!.properties).toMatchObject({
    dns_policy: { $ref: "#/definitions/config.NodeDNSPolicy" },
    user_defaults: {
      type: "array",
      items: { $ref: "#/definitions/config.NodeUserDefault" },
    },
    rules: {
      type: "array",
      items: { $ref: "#/definitions/dto.NodeRoutingRule" },
    },
    outbounds: {
      type: "array",
      items: { $ref: "#/definitions/dto.NodeOutbound" },
    },
  });
  expect(
    spec.definitions["config.NodeDNSPolicy"]!.properties.resolvers
  ).toEqual({
    type: "array",
    items: { $ref: "#/definitions/config.NodeDNSResolver" },
  });
  expect(spec.definitions["dto.RoutingStatusReport"]!.properties).toMatchObject(
    {
      routing_applied: { $ref: "#/definitions/dto.RoutingCandidateIdentity" },
      routing_pending: { $ref: "#/definitions/dto.RoutingCandidateIdentity" },
      routing_error: { $ref: "#/definitions/dto.RoutingReportError" },
    }
  );
  expect(
    spec.definitions["dto.RoutingReportError"]!.properties.identity
  ).toEqual({ $ref: "#/definitions/dto.RoutingCandidateIdentity" });
  for (const name of ["config.NodeRoute", "dto.NodeRoutingRule"])
    expect(spec.definitions[name]!.properties.user_ids).toEqual({
      type: "array",
      items: { type: "integer" },
    });
  for (const name of ["config.NodeOutbound", "dto.NodeOutbound"])
    expect(spec.definitions[name]!.properties.via_outbound_id).toEqual({
      type: "string",
    });
  expect(
    spec.definitions["config.NodeDNSResolver"]!.properties.bootstrap_ip
  ).toEqual({ type: "string" });
  expect(
    spec.definitions["dto.RoutingCandidateIdentity"]!.properties.snapshot_id
  ).toEqual({ type: "string" });
  expect(
    spec.definitions["dto.GetServerNodeConfigResponse"]!.properties
      .desired_snapshot_id
  ).toEqual({ type: "string" });
  for (const name of ["dto.NodeConfig", "dto.UpdateServerNodeConfigRequest"]) {
    expect(spec.definitions[name]!.properties.routing_downgrade).toEqual({
      type: "boolean",
    });
    expect(spec.definitions[name]!.required || []).not.toContain(
      "routing_downgrade"
    );
  }
  expect(keys("dto.CreateServerResponse")).toEqual(["id"]);
  expect(spec.paths["/v1/admin/system/node_config/preview"]).toBeUndefined();
  expect(spec.paths["/v1/admin/server/node_config/preview"]).toBeUndefined();
});
