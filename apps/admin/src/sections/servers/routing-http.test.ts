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
    definitions: Record<string, { properties: Record<string, unknown> }>;
    paths: Record<string, unknown>;
  } = JSON.parse(readFileSync("../../docs/public/swagger/ppanel.json", "utf8"));
  const keys = (name: string) =>
    Object.keys(spec.definitions[name]!.properties).sort();
  expect(keys("dto.NodeConfig")).toEqual(Object.keys(globalConfig).sort());
  expect(keys("dto.GetServerNodeConfigResponse")).toEqual(
    Object.keys(serverConfig).sort()
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
      "routing_revision",
      "server_id",
    ].sort()
  );
  expect(keys("dto.CreateServerResponse")).toEqual(["id"]);
  expect(keys("dto.RoutingStatusReport")).toContain("routing_sequence");
  expect(keys("dto.RoutingStatusReport")).toContain("liveness_at");
  expect(spec.paths["/v1/admin/system/node_config/preview"]).toBeUndefined();
  expect(spec.paths["/v1/admin/server/node_config/preview"]).toBeUndefined();
});
