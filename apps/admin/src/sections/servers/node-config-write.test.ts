import { describe, expect, it } from "vitest";
import {
  globalWriteMatches,
  isDefiniteRejection,
  safeBackendError,
  serverWriteMatches,
} from "./node-config-write";
import { v3 } from "./routing-fixtures.test-util";

const routing: API.NodeRouting = v3({
  version: 3,
  outbounds: [],
  rules: [],
  default_outbound_id: "direct",
});
const global: API.NodeConfig = {
  node_secret: "",
  node_pull_interval: 0,
  node_push_interval: 30,
  traffic_report_threshold: 0,
  routing,
  routing_revision: 3,
  routing_mode: "global",
  routing_capabilities: [1],
};
const projection: API.NodeRoutingProjection = {
  ...routing,
  mode: "inherited",
  source: "global",
  source_server_id: 0,
  source_revision: 3,
  local_transition_revision: 0,
};
const values: API.ServerNodeConfigValues = {
  routing: projection,
  routing_revision: 3,
  routing_mode: "inherited",
};
const server: API.GetServerNodeConfigResponse = {
  global: values,
  effective: values,
  override: {
    inherit_routing: true,
    routing: null,
    routing_revision: 0,
  },
  routing_status: { known: false, reporter_verified: false, synced: false },
};
describe("presence-sensitive node settings readback", () => {
  it("compares only dirty global fields", () => {
    expect(
      globalWriteMatches(
        { routing, routing_revision: 3 },
        {
          ...global,
          routing_revision: 4,
          node_secret: "changed",
        },
        3
      )
    ).toBe(true);
    expect(
      globalWriteMatches(
        { node_pull_interval: 60 },
        { ...global, node_pull_interval: 61 },
        3
      )
    ).toBe(false);
  });
  it("confirms a save when backend sorts account selectors and normalizes DNS", () => {
    const desired: API.NodeRouting = {
      ...routing,
      version: 3,
      rules: [
        {
          id: "rr_22222222-2222-4222-8222-222222222222",
          enabled: true,
          remark: "",
          kind: "domain",
          values: ["domain:example.com"],
          user_ids: [21, 1],
          outbound_id: "direct",
        },
      ],
      user_defaults: [
        { user_id: 21, outbound_id: "block" },
        { user_id: 1, outbound_id: "direct" },
      ],
      dns: {
        query_strategy: "UseIP",
        resolvers: [
          {
            id: "dns_44444444-4444-4444-8444-444444444444",
            protocol: "udp",
            address: "DNS.Example.COM.:0053",
            bootstrap_ip: "2001:0db8:0:0:0:0:0:1",
            domains: [],
            outbound_id: "direct",
          },
        ],
      },
    };
    const observed = structuredClone(desired);
    observed.rules[0]!.user_ids = [1, 21];
    observed.user_defaults!.reverse();
    observed.dns!.resolvers[0]!.address = "dns.example.com.:53";
    observed.dns!.resolvers[0]!.bootstrap_ip = "2001:db8::1";
    expect(
      globalWriteMatches(
        { routing: desired, routing_revision: 3 },
        { ...global, routing: observed, routing_revision: 4 },
        3
      )
    ).toBe(true);
    const response: API.GetServerNodeConfigResponse = {
      ...server,
      override: {
        ...server.override,
        inherit_routing: false,
        routing: observed,
        routing_revision: 1,
      },
    };
    expect(
      serverWriteMatches(
        { server_id: 7, routing: desired, routing_revision: 0 },
        response,
        0
      )
    ).toBe(true);
    const different = structuredClone(response);
    different.override.routing!.user_defaults![0]!.outbound_id = "block";
    expect(
      serverWriteMatches(
        { server_id: 7, routing: desired, routing_revision: 0 },
        different,
        0
      )
    ).toBe(false);
    expect(desired.rules[0]!.user_ids).toEqual([21, 1]);
    expect(desired.user_defaults!.map((entry) => entry.user_id)).toEqual([
      21, 1,
    ]);
  });
  it("redacts backend validation messages and treats only explicit preconditions as definite", () => {
    expect(
      safeBackendError({
        response: {
          data: {
            code: 400,
            msg: 'field settings password="secret" oauth_token=abc',
          },
        },
      })
    ).toBe("field settings password=[redacted] oauth_token=[redacted]");
    expect(
      safeBackendError({
        response: { data: { code: 10_002, msg: "redis credentials" } },
      })
    ).toBeUndefined();
    expect(
      isDefiniteRejection({
        response: { status: 200, data: { code: 140_001 } },
      })
    ).toBe(false);
    expect(
      isDefiniteRejection({ response: { status: 200, data: { code: 400 } } })
    ).toBe(true);
    expect(
      isDefiniteRejection({ response: { status: 500, data: { code: 400 } } })
    ).toBe(false);
    expect(isDefiniteRejection({ response: { status: 422 } })).toBe(true);
    expect(
      isDefiniteRejection({ response: { status: 200, data: { code: 10_002 } } })
    ).toBe(false);
  });
});
