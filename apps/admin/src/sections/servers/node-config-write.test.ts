import { describe, expect, it } from "vitest";
import {
  dnsIsValid,
  editableDNS,
  globalWriteMatches,
  isDefiniteRejection,
  safeBackendError,
  serverWriteMatches,
} from "./node-config-write";

const routing: API.NodeRouting = {
  version: 1,
  outbounds: [],
  rules: [],
  default_outbound_id: "direct",
};
const global: API.NodeConfig = {
  dns: null,
  ip_strategy: "",
  node_secret: "",
  node_pull_interval: 0,
  node_push_interval: 30,
  traffic_report_threshold: 0,
  routing,
  routing_revision: 3,
  routing_mode: "global-v1",
  routing_capabilities: [1],
};
const projection: API.NodeRoutingProjection = {
  ...routing,
  mode: "ordered-v1-inherited",
  source: "global",
  source_server_id: 0,
  source_revision: 3,
  local_transition_revision: 0,
};
const values: API.ServerNodeConfigValues = {
  dns: [],
  ip_strategy: "",
  routing: projection,
  routing_revision: 3,
  routing_mode: "global-v1",
};
const server: API.GetServerNodeConfigResponse = {
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
describe("presence-sensitive node settings readback", () => {
  it("reads absent/null DNS and validates new entries without manufacturing writes", () => {
    expect(editableDNS(null)).toEqual([]);
    expect(editableDNS(undefined)).toEqual([]);
    expect(dnsIsValid([{ proto: "udp", address: " ", domains: [] }])).toBe(
      false
    );
    expect(
      dnsIsValid([{ proto: "udp", address: "1.1.1.1", domains: [] }])
    ).toBe(true);
  });
  it("compares only dirty global fields and never defaults an empty strategy", () => {
    expect(
      globalWriteMatches(
        { routing, routing_revision: 3 },
        {
          ...global,
          routing_revision: 4,
          dns: [{ proto: "udp", address: "1.1.1.1", domains: [] }],
          ip_strategy: "prefer_ipv6",
          node_secret: "changed",
        },
        3
      )
    ).toBe(true);
    expect(globalWriteMatches({ ip_strategy: "" }, global, 3)).toBe(true);
    expect(
      globalWriteMatches(
        { ip_strategy: "" },
        { ...global, ip_strategy: "prefer_ipv4" },
        3
      )
    ).toBe(false);
    expect(
      globalWriteMatches(
        { node_pull_interval: 60 },
        { ...global, node_pull_interval: 61 },
        3
      )
    ).toBe(false);
  });
  it("mirrors server DNS normalization but rejects meaningful readback differences", () => {
    const payload: API.UpdateServerNodeConfigRequest = {
      server_id: 7,
      inherit_dns: false,
      dns: [
        {
          proto: " UDP ",
          address: "DNS.Example.COM.:0053",
          server_name: "",
          domains: ["Example.COM.", "suffix:example.net", "Example.COM."],
        },
      ],
    };
    const actual: API.GetServerNodeConfigResponse = {
      ...server,
      override: {
        ...server.override,
        inherit_dns: false,
        dns: [
          {
            proto: "udp",
            address: "dns.example.com.:53",
            server_name: "",
            domains: ["full:Example.COM", "domain:example.net"],
          },
        ],
      },
    };
    expect(serverWriteMatches(payload, actual, 0)).toBe(true);
    expect(
      globalWriteMatches(
        { dns: payload.dns },
        { ...global, dns: actual.override.dns },
        3
      )
    ).toBe(true);
    const ipv6Payload: API.UpdateServerNodeConfigRequest = {
      server_id: 7,
      inherit_dns: false,
      dns: [
        { proto: "udp", address: "[2001:0db8:0:0:0:0:0:1]:0053", domains: [] },
      ],
    };
    expect(
      serverWriteMatches(
        ipv6Payload,
        {
          ...actual,
          override: {
            ...actual.override,
            dns: [{ proto: "udp", address: "[2001:db8::1]:53", domains: [] }],
          },
        },
        0
      )
    ).toBe(true);
    expect(
      serverWriteMatches(
        payload,
        { ...actual, override: { ...actual.override, dns: [] } },
        0
      )
    ).toBe(false);
    expect(
      serverWriteMatches(
        { server_id: 7, inherit_ip_strategy: false, ip_strategy: "" },
        {
          ...server,
          override: {
            ...server.override,
            inherit_ip_strategy: false,
            ip_strategy: "",
          },
        },
        0
      )
    ).toBe(true);
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
