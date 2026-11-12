import { v3 } from "./routing-fixtures.test-util";
// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NodeRoutingEditor } from "./node-routing-editor";
import { RoutingDNS } from "./routing-dns";
import {
  outboundReferences,
  routingContentFromProjection,
  routingReadbackMatches,
  validateNodeRouting,
} from "./node-routing";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      _: string,
      fallback: string,
      values?: Record<string, string | number>
    ) =>
      Object.entries(values || {}).reduce(
        (s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)),
        fallback
      ),
  }),
}));
const list = vi.hoisted(() =>
  vi.fn(async ({ page }: { page: number }) => ({
    data: {
      data: {
        total: 21,
        list: [
          {
            id: page === 1 ? 1 : 21,
            auth_methods: [
              {
                auth_type: "email",
                auth_identifier:
                  page === 1 ? "one@example.test" : "last@example.test",
              },
            ],
          },
        ],
      },
    },
  }))
);
vi.mock("@workspace/ui/services/admin/admin", () => ({ getUserList: list }));
const a = "ob_11111111-1111-4111-8111-111111111111";
const b = "ob_22222222-2222-4222-8222-222222222222";
const dns = "dns_33333333-3333-4333-8333-333333333333";
const base: API.NodeRouting = v3({
  version: 3,
  outbounds: [a, b].map((id, index) => ({
    id,
    name: index ? "B" : "A",
    protocol: "http",
    address: "192.0.2.1",
    port: 80,
    password: "",
    rules: [],
    ip_rules: [],
    protocol_rules: [],
  })),
  rules: [
    {
      id: "rr_44444444-4444-4444-8444-444444444444",
      enabled: true,
      remark: "Google",
      kind: "domain",
      values: ["geosite:google-cn"],
      outbound_id: "direct",
    },
  ],
  default_outbound_id: "direct",
});
function Harness() {
  const [value, setValue] = useState(base);
  return (
    <>
      <NodeRoutingEditor value={value} onChange={setValue} />
      <RoutingDNS value={value} onChange={setValue} />
      <output data-testid="policy">{JSON.stringify(value)}</output>
    </>
  );
}
function policy(): API.NodeRouting {
  return JSON.parse(screen.getByTestId("policy").textContent || "{}");
}
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  list.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("selects account IDs across pages, scopes a rule and retains the existing match", async () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Edit 1. Google" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByPlaceholderText("Search accounts")).toBeTruthy();
  await within(dialog).findByText(/one@example.test/);
  fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
  fireEvent.click(await within(dialog).findByLabelText(/last@example.test/));
  fireEvent.click(within(dialog).getByRole("button", { name: "Apply rule" }));
  expect(policy().version).toBe(3);
  expect(policy().rules[0]).toMatchObject({
    user_ids: [21],
    values: ["geosite:google-cn"],
    outbound_id: "direct",
  });
  expect(policy().user_defaults).toEqual([]);
  expect(list).toHaveBeenCalledWith(
    expect.objectContaining({ page: 2, size: 20 })
  );
});

it("writes user defaults, front hop and ordered DNS without changing existing rules", async () => {
  render(<Harness />);
  fireEvent.click(await screen.findByLabelText(/one@example.test/));
  fireEvent.change(screen.getByLabelText("Account default outbound"), {
    target: { value: b },
  });
  fireEvent.click(screen.getByRole("button", { name: /B HTTP/ }));
  fireEvent.change(screen.getByLabelText("Connect through outbound"), {
    target: { value: a },
  });
  // The policy starts as the system default resolver; make it a UDP one.
  fireEvent.change(screen.getByLabelText("Resolver protocol"), {
    target: { value: "udp" },
  });
  fireEvent.change(screen.getByLabelText("Resolver address"), {
    target: { value: "192.0.2.53:53" },
  });
  fireEvent.change(screen.getByLabelText("DNS query outbound"), {
    target: { value: b },
  });
  expect(policy()).toMatchObject({
    version: 3,
    user_defaults: [{ user_id: 1, outbound_id: b }],
    outbounds: [{ id: a }, { id: b, via_outbound_id: a }],
    dns: {
      query_strategy: "UseIP",
      resolvers: [
        {
          protocol: "udp",
          address: "192.0.2.53:53",
          domains: [],
          outbound_id: b,
        },
      ],
    },
    rules: base.rules,
  });
  expect(validateNodeRouting(policy())).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Delete A" }));
  expect(screen.getByText(/Cannot delete this connection/)).toBeTruthy();
});

it("preserves resolver bootstrap across UDP, TCP and HTTPS without restricting hostname outbounds", () => {
  render(<Harness />);
  // The policy starts as the system default resolver; make it a UDP one.
  fireEvent.change(screen.getByLabelText("Resolver protocol"), {
    target: { value: "udp" },
  });
  fireEvent.change(screen.getByLabelText("Resolver address"), {
    target: { value: "dns.example.test:53" },
  });
  fireEvent.change(screen.getByLabelText("Bootstrap IP (hostname resolver)"), {
    target: { value: "192.0.2.53" },
  });
  for (const protocol of ["udp", "tcp", "https", "udp"]) {
    fireEvent.change(screen.getByLabelText("Resolver protocol"), {
      target: { value: protocol },
    });
    fireEvent.change(screen.getByLabelText("Resolver address"), {
      target: {
        value:
          protocol === "https"
            ? "https://dns.example.test/dns-query"
            : "dns.example.test:53",
      },
    });
    const value = policy();
    expect(value.dns?.resolvers[0]).toMatchObject({
      protocol,
      bootstrap_ip: "192.0.2.53",
    });
    expect(
      (
        screen.getByLabelText(
          "Bootstrap IP (hostname resolver)"
        ) as HTMLInputElement
      ).value
    ).toBe("192.0.2.53");
    expect(validateNodeRouting(value)).toEqual([]);
    expect(routingReadbackMatches(value, value)).toBe(true);
  }
  const hostnameOutbound = {
    ...policy(),
    outbounds: policy().outbounds.map((outbound) => ({
      ...outbound,
      address: "proxy.example.test",
    })),
  };
  expect(validateNodeRouting(hostnameOutbound)).toEqual([]);
});

it("keeps multiline DNS drafts while applying external resolver readback and labels movement", () => {
  const first = {
    id: dns,
    protocol: "udp" as const,
    address: "192.0.2.53",
    domains: ["geosite:old"],
    outbound_id: "direct",
  };
  const second = {
    ...first,
    id: "dns_55555555-5555-4555-8555-555555555555",
    domains: ["geosite:second"],
  };
  const fallback = {
    ...first,
    id: "dns_66666666-6666-4666-8666-666666666666",
    domains: [],
  };
  const initial: API.NodeRouting = {
    ...base,
    version: 3,
    user_defaults: [],
    dns: {
      query_strategy: "UseIP",
      resolvers: [first, second, fallback],
    },
  };
  function DNSHarness() {
    const [value, setValue] = useState(initial);
    return (
      <>
        <RoutingDNS value={value} onChange={setValue} />
        <button
          type="button"
          onClick={() =>
            setValue({
              ...initial,
              dns: {
                ...initial.dns!,
                resolvers: [
                  { ...first, domains: ["domain:canonical.example"] },
                  second,
                  fallback,
                ],
              },
            })
          }
        >
          Read back
        </button>
        <output data-testid="dns-value">{JSON.stringify(value.dns)}</output>
      </>
    );
  }
  render(<DNSHarness />);
  const domains = screen.getAllByLabelText(
    "Domains (one per line)"
  )[0] as HTMLTextAreaElement;
  fireEvent.change(domains, {
    target: { value: "domain:first.example\ngeosite:cn\n" },
  });
  expect(domains.value).toBe("domain:first.example\ngeosite:cn\n");
  expect(
    JSON.parse(screen.getByTestId("dns-value").textContent!).resolvers[0]
      .domains
  ).toEqual(["domain:first.example", "geosite:cn"]);
  expect(
    screen.getByRole("button", { name: "Move resolver 1 down" })
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Move resolver 2 up" })
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Read back" }));
  expect(domains.value).toBe("domain:canonical.example");
  expect(
    JSON.parse(screen.getByTestId("dns-value").textContent!).resolvers[0]
      .domains
  ).toEqual(["domain:canonical.example"]);
});

it("rejects cycles, dangling dependencies and invalid DNS default; reads v1 and v2 unchanged", () => {
  const v2: API.NodeRouting = {
    ...base,
    version: 3,
    user_defaults: [{ user_id: 21, outbound_id: a }],
    outbounds: [
      { ...base.outbounds[0]!, via_outbound_id: b },
      { ...base.outbounds[1]!, via_outbound_id: a },
    ],
    dns: {
      query_strategy: "UseIP",
      resolvers: [
        {
          id: dns,
          protocol: "udp",
          address: "192.0.2.53",
          domains: ["domain:example.com"],
          outbound_id: a,
        },
      ],
    },
  };
  expect(validateNodeRouting(v2).map((i) => i.code)).toEqual(
    expect.arrayContaining(["chainCycle", "invalidDNS"])
  );
  expect(outboundReferences(v2, a)).toMatchObject({
    chains: [expect.objectContaining({ id: b })],
    users: [{ user_id: 21, outbound_id: a }],
    resolvers: [expect.objectContaining({ id: dns })],
  });
  expect(
    validateNodeRouting({
      ...v2,
      outbounds: [{ ...base.outbounds[0]!, via_outbound_id: "missing" }],
    }).map((i) => i.code)
  ).toContain("unknownOutbound");
  expect(routingContentFromProjection(base)).toEqual(base);
  expect(routingContentFromProjection(v2)).toEqual(v2);
  expect(routingReadbackMatches(v2, v2)).toBe(true);
});
