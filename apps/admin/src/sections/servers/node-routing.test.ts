import { describe, expect, it } from "vitest";
import {
  MAX_ROUTING_BYTES,
  moveRoutingRule,
  nodeRoutingSchema,
  outboundReferences,
  ROUTING_STATUS_TTL_MS,
  routingApplicationState,
  routingContentFromProjection,
  routingIdentityFromProjection,
  routingReadbackMatches,
  validateNodeRouting,
} from "./node-routing";
import { serializedJSONByteLength } from "./route-rules";

const ob = "ob_11111111-1111-4111-8111-111111111111";
const rr = "rr_22222222-2222-4222-8222-222222222222";
const rr2 = "rr_33333333-3333-4333-8333-333333333333";
function policy(): API.NodeRouting {
  return {
    version: 1,
    outbounds: [
      {
        id: ob,
        name: "SOCKS",
        protocol: "vless",
        address: "node",
        port: 443,
        password: "",
        transport: "websocket",
        fingerprint: "safari",
        flow: "xtls-rprx-vision",
        uuid: "00000000-0000-4000-8000-000000000001",
        security: "tls",
        allow_insecure: false,
        alpn: [],
        plugin_opts: {},
        stream_settings: '{"network":"tcp","security":"tls"}',
        spider_x: "/hidden",
      },
    ],
    rules: [
      {
        id: rr,
        enabled: false,
        remark: "disabled",
        kind: "domain",
        values: ["geosite:google-cn"],
        outbound_id: ob,
      },
      {
        id: rr2,
        enabled: true,
        remark: "block",
        kind: "domain",
        values: ["geosite:cn"],
        outbound_id: "block",
      },
    ],
    default_outbound_id: "direct",
  };
}
const identity: API.RoutingIdentity = {
  mode: "ordered-v1-local",
  source: "server",
  source_server_id: 7,
  source_revision: 8,
  local_transition_revision: 8,
};
const instance = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const now = 1_700_000_000_000;
function status(): API.RoutingStatusView {
  return {
    known: true,
    reporter_verified: true,
    report: {
      routing_version: 1,
      instance_id: instance,
      received_at: now / 1000,
      updated_at: now / 1000,
      routing_applied: identity,
    },
  };
}

describe("cutover ordered routing", () => {
  it("preserves connection fields, enabled=false and empty-array presence without normalization", () => {
    const input = policy();
    const result = nodeRoutingSchema.parse(input);
    expect(result).toEqual(input);
    expect(Object.hasOwn(result.outbounds[0]!, "rules")).toBe(false);
    expect(result.outbounds[0]).toMatchObject({
      allow_insecure: false,
      alpn: [],
      transport: "websocket",
      fingerprint: "safari",
      flow: "xtls-rprx-vision",
      spider_x: "/hidden",
    });
    expect(validateNodeRouting(result)).toEqual([]);
  });
  it("separates server projection identity from persisted content", () => {
    const projection = { ...policy(), ...identity };
    expect(routingIdentityFromProjection(projection)).toEqual(identity);
    expect(routingContentFromProjection(projection)).toEqual(policy());
    expect(routingIdentityFromProjection(policy())).toBeUndefined();
  });
  it("requires enabled presence, valid references and nonempty values but permits rules: []", () => {
    const input = policy();
    expect(validateNodeRouting({ ...input, rules: [] })).toEqual([]);
    const missing: Record<string, unknown> = { ...input.rules[0] };
    Reflect.deleteProperty(missing, "enabled");
    expect(
      validateNodeRouting({ ...input, rules: [missing] }).some(
        (issue) => issue.code === "invalidShape"
      )
    ).toBe(true);
    expect(
      validateNodeRouting({
        ...input,
        rules: [{ ...input.rules[0], values: [], outbound_id: "missing" }],
      }).map((issue) => issue.code)
    ).toEqual(expect.arrayContaining(["emptyValues", "unknownOutbound"]));
    expect(
      validateNodeRouting({
        ...input,
        outbounds: [{ ...input.outbounds[0], rules: ["geosite:cn"] }],
      }).map((issue) => issue.code)
    ).toContain("nestedRules");
  });
  it("moves stable ids and finds disabled and default references", () => {
    const input = policy();
    const moved = moveRoutingRule(input, 0, 1);
    expect(moved.rules.map((rule) => rule.id)).toEqual([rr2, rr]);
    expect(input.rules[0]?.id).toBe(rr);
    expect(outboundReferences(moved, ob).rules[0]?.enabled).toBe(false);
    expect(
      outboundReferences({ ...moved, default_outbound_id: ob }, ob).isDefault
    ).toBe(true);
  });
  it("counts raw dialerProxy references without changing the raw connection", () => {
    const original = policy();
    const raw = `{"SockOpt":{"DIALERPROXY":"routing_${ob}","tcpNoDelay":true}}`;
    const second = {
      ...original.outbounds[0]!,
      id: "ob_44444444-4444-4444-8444-444444444444",
      name: "B",
      flow: "",
      stream_settings: raw,
    };
    const input: API.NodeRouting = {
      ...original,
      version: 2,
      user_defaults: [],
      outbounds: [...original.outbounds, second],
    };
    expect(outboundReferences(input, ob).chains).toEqual([second]);
    expect(validateNodeRouting(input)).toEqual([]);
    expect(input.outbounds[1]!.stream_settings).toBe(raw);
  });
  it("rejects mixed raw and structured cycles, conflicts and missing raw targets", () => {
    const original = policy();
    const b = "ob_44444444-4444-4444-8444-444444444444";
    const first = {
      ...original.outbounds[0]!,
      stream_settings: `{"sockopt":{"dialerProxy":"routing_${b}"}}`,
    };
    const second = {
      ...original.outbounds[0]!,
      id: b,
      name: "B",
      via_outbound_id: ob,
    };
    const input: API.NodeRouting = {
      ...original,
      version: 2,
      user_defaults: [],
      outbounds: [first, second],
    };
    expect(validateNodeRouting(input).map((issue) => issue.code)).toContain(
      "chainCycle"
    );
    const conflict = {
      ...input,
      outbounds: [
        { ...first, via_outbound_id: b },
        { ...second, via_outbound_id: "" },
      ],
    };
    expect(validateNodeRouting(conflict).map((issue) => issue.code)).toContain(
      "chainConflict"
    );
    const unknown = {
      ...input,
      outbounds: [
        {
          ...first,
          stream_settings: '{"sockopt":{"dialerProxy":"not-a-target"}}',
        },
        { ...second, via_outbound_id: "" },
      ],
    };
    expect(validateNodeRouting(unknown).map((issue) => issue.code)).toContain(
      "unknownOutbound"
    );
    const dangling = {
      ...unknown,
      outbounds: [
        {
          ...first,
          stream_settings:
            '{"sockopt":{"dialerProxy":"routing_ob_99999999-9999-4999-8999-999999999999"}}',
        },
        { ...second, via_outbound_id: "" },
      ],
    };
    expect(validateNodeRouting(dangling).map((issue) => issue.code)).toContain(
      "unknownOutbound"
    );
  });
  it("accepts raw Default and block terminals without custom references", () => {
    for (const tag of ["Default", "block"]) {
      const original = policy();
      const input: API.NodeRouting = {
        ...original,
        version: 2,
        user_defaults: [],
        outbounds: [
          {
            ...original.outbounds[0]!,
            flow: "",
            stream_settings: `{"sockopt":{"dialerProxy":"${tag}"}}`,
          },
        ],
      };
      expect(validateNodeRouting(input)).toEqual([]);
      expect(outboundReferences(input, ob).chains).toEqual([]);
      const conflict = {
        ...input,
        outbounds: [{ ...input.outbounds[0]!, via_outbound_id: ob }],
      };
      expect(
        validateNodeRouting(conflict).map((issue) => issue.code)
      ).toContain("chainConflict");
    }
  });
  it("enforces ordered budgets and the inclusive 1 MiB boundary", () => {
    const input = policy();
    const longValues = Array.from(
      { length: 30 },
      (_, index) => `regexp:${"a".repeat(3000)}${index}`
    );
    expect(
      validateNodeRouting({
        ...input,
        rules: [{ ...input.rules[0], values: longValues }],
      })
    ).toEqual([]);
    expect(
      validateNodeRouting({
        ...input,
        rules: [
          { ...input.rules[0], values: new Array(1025).fill("geosite:cn") },
        ],
      }).map((issue) => issue.code)
    ).toContain("tooManyValues");
    const overhead = serializedJSONByteLength({ ...input, extra: "" });
    const exact = { ...input, extra: "x".repeat(MAX_ROUTING_BYTES - overhead) };
    expect(serializedJSONByteLength(exact)).toBe(MAX_ROUTING_BYTES);
    expect(validateNodeRouting(exact).map((issue) => issue.code)).not.toContain(
      "serializedTooLarge"
    );
    expect(
      validateNodeRouting({ ...exact, extra: `${exact.extra}x` }).map(
        (issue) => issue.code
      )
    ).toContain("serializedTooLarge");
    const text = Array.from(
      { length: 67 },
      (_, index) => `regexp:${"a".repeat(4000)}${index}`
    );
    expect(
      validateNodeRouting({
        ...input,
        rules: [{ ...input.rules[0], values: text }],
      }).map((issue) => issue.code)
    ).toContain("aggregateBytes");
  });
  it("recognizes the backend's empty wire arrays and omitted zero fields in readback only", () => {
    const input = policy();
    const observed = structuredClone(input);
    const outbound = observed.outbounds[0]!;
    Reflect.deleteProperty(outbound, "allow_insecure");
    Reflect.deleteProperty(outbound, "alpn");
    Object.assign(outbound, { rules: [], ip_rules: [], protocol_rules: [] });
    expect(routingReadbackMatches(input, observed)).toBe(true);
    expect(routingReadbackMatches(input, { ...observed, rules: [] })).toBe(
      false
    );
    expect(
      routingReadbackMatches(input, {
        ...observed,
        outbounds: [{ ...outbound, stream_settings: '{"different":true}' }],
      })
    ).toBe(false);
    expect(input.outbounds[0]?.allow_insecure).toBe(false);
  });
  it("compares backend-canonical v2 account and DNS values without changing submitted policy", () => {
    const input: API.NodeRouting = {
      ...policy(),
      version: 2,
      rules: [
        { ...policy().rules[0]!, user_ids: [21, 1, 21] },
        policy().rules[1]!,
      ],
      user_defaults: [
        { user_id: 21, outbound_id: ob },
        { user_id: 1, outbound_id: "direct" },
      ],
      dns_policy: {
        query_strategy: "UseIP",
        resolvers: [
          {
            id: "dns_44444444-4444-4444-8444-444444444444",
            protocol: "udp",
            address: "DNS.Example.COM.:0053",
            domains: ["geosite:cn"],
            outbound_id: "direct",
          },
          {
            id: "dns_55555555-5555-4555-8555-555555555555",
            protocol: "tcp",
            address: "[2001:0DB8:0:0:0:0:0:53]:0053",
            bootstrap_ip: "2001:0DB8:0:0:0:0:0:1",
            domains: ["domain:example.com"],
            outbound_id: ob,
          },
          {
            id: "dns_66666666-6666-4666-8666-666666666666",
            protocol: "https",
            address: "https://DNS.Example.COM/dns-query",
            domains: [],
            outbound_id: "direct",
          },
        ],
      },
    };
    const original = structuredClone(input);
    const observed = structuredClone(input);
    observed.rules[0]!.user_ids = [1, 21];
    observed.user_defaults!.reverse();
    observed.dns_policy!.resolvers[0]!.address = "dns.example.com.:53";
    observed.dns_policy!.resolvers[1]!.address = "[2001:db8::53]:53";
    observed.dns_policy!.resolvers[1]!.bootstrap_ip = "2001:db8::1";
    expect(routingReadbackMatches(input, observed)).toBe(true);
    expect(input).toEqual(original);
    const differentUser = structuredClone(observed);
    differentUser.rules[0]!.user_ids = [1, 22];
    expect(routingReadbackMatches(input, differentUser)).toBe(false);
    const differentDefault = structuredClone(observed);
    differentDefault.user_defaults![0]!.outbound_id = ob;
    expect(routingReadbackMatches(input, differentDefault)).toBe(false);
    const differentAccount = structuredClone(observed);
    differentAccount.user_defaults![0]!.user_id = 2;
    expect(routingReadbackMatches(input, differentAccount)).toBe(false);
    const differentResolver = structuredClone(observed);
    differentResolver.dns_policy!.resolvers[0]!.address = "dns.example.com:53";
    expect(routingReadbackMatches(input, differentResolver)).toBe(false);
    const differentBootstrap = structuredClone(observed);
    differentBootstrap.dns_policy!.resolvers[1]!.bootstrap_ip = "2001:db8::2";
    expect(routingReadbackMatches(input, differentBootstrap)).toBe(false);
    const differentURL = structuredClone(observed);
    differentURL.dns_policy!.resolvers[2]!.address =
      "https://dns.example.com/dns-query";
    expect(routingReadbackMatches(input, differentURL)).toBe(false);
    const reordered = structuredClone(observed);
    reordered.rules.reverse();
    expect(routingReadbackMatches(input, reordered)).toBe(false);
  });
  it("classifies the backend-verified status using exact identity and content receipt TTL", () => {
    const view = status();
    expect(routingApplicationState(view, identity, now)).toBe("applied");
    expect(
      routingApplicationState(view, identity, now + ROUTING_STATUS_TTL_MS)
    ).toBe("unknown");
    expect(
      routingApplicationState({ ...view, known: false }, identity, now)
    ).toBe("unknown");
    expect(
      routingApplicationState(
        { ...view, reporter_verified: false },
        identity,
        now
      )
    ).toBe("unknown");
    expect(
      routingApplicationState(
        { ...view, known: false, report: { ...view.report!, conflict: true } },
        identity,
        now
      )
    ).toBe("unknown");
    for (const updatedAt of [0, 1, now / 1000 - 100_000]) {
      expect(
        routingApplicationState(
          {
            ...view,
            report: {
              ...view.report!,
              updated_at: updatedAt,
              routing_sequence: 9_007_199_254_740_992,
              liveness_at: now / 1000 + 10,
            },
          },
          identity,
          now
        )
      ).toBe("applied");
    }
    expect(
      routingApplicationState(
        {
          ...view,
          report: {
            ...view.report!,
            received_at: now / 1000 - ROUTING_STATUS_TTL_MS / 1000,
            liveness_at: now / 1000,
          },
        },
        identity,
        now
      )
    ).toBe("unknown");
    expect(
      routingApplicationState(view, { ...identity, source_revision: 9 }, now)
    ).toBe("unknown");
    const malformed = { ...identity, mode: "ordered-v2" };
    expect(
      routingApplicationState(
        { ...view, report: { ...view.report!, routing_applied: malformed } },
        malformed,
        now
      )
    ).toBe("unknown");
    const inherited: API.RoutingIdentity = {
      mode: "ordered-v1-inherited",
      source: "global",
      source_server_id: 0,
      source_revision: 3,
      local_transition_revision: 0,
    };
    expect(
      routingApplicationState(
        { ...view, report: { ...view.report!, routing_applied: inherited } },
        inherited,
        now
      )
    ).toBe("applied");
    const pending = {
      ...view,
      report: { ...view.report!, routing_pending: identity },
    };
    expect(routingApplicationState(pending, identity, now)).toBe("pending");
    const failed = {
      ...pending,
      report: {
        ...pending.report,
        routing_error: { identity, stage: "build", message: "failed" },
      },
    };
    expect(routingApplicationState(failed, identity, now)).toBe("failed");
    expect(
      routingApplicationState(
        { known: false, reporter_verified: false },
        identity,
        now
      )
    ).toBe("unknown");
  });
});
