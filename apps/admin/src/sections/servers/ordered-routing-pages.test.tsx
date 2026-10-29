// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ServerConfig from "./server-config";
import ServerNodeConfig from "./server-node-config";

const mocks = vi.hoisted(() => ({
  config: undefined as unknown,
  pushData: undefined as ((value: unknown) => void) | undefined,
  update: vi.fn(),
  serverUpdate: vi.fn(),
  refetch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: (string | number)[] }) => {
    const serverId =
      queryKey[0] === "getServerNodeConfig" ? Number(queryKey[1]) : undefined;
    const [entry, setEntry] = useState(() => ({
      serverId,
      config: mocks.config,
    }));
    mocks.pushData = (config) => setEntry({ serverId, config });
    return {
      data:
        serverId === undefined
          ? entry.config
          : { serverId: entry.serverId, config: entry.config },
      isLoading: false,
      isError: false,
      refetch: async () => {
        mocks.refetch();
        const config = structuredClone(mocks.config);
        setEntry({ serverId, config });
        return { data: serverId === undefined ? config : { serverId, config } };
      },
    };
  },
}));
vi.mock("@workspace/ui/services/node-config", () => ({
  getSystemNodeConfig: vi.fn(),
  putSystemNodeConfig: mocks.update,
  getServerNodeConfig: vi.fn(),
  postServerNodeConfigUpdate: mocks.serverUpdate,
}));
vi.mock("@workspace/ui/components/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@workspace/ui/composed/dynamic-Inputs", () => ({
  ArrayInput: () => <div>DNS editor</div>,
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      fallback: string,
      values?: Record<string, string | number>
    ) =>
      Object.entries(values || {}).reduce(
        (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
        fallback
      ),
  }),
}));

const ob = "ob_11111111-1111-4111-8111-111111111111";
const first = "rr_22222222-2222-4222-8222-222222222222";
const second = "rr_33333333-3333-4333-8333-333333333333";
const policy: API.NodeRouting = {
  version: 1,
  outbounds: [
    {
      id: ob,
      name: "Proxy",
      protocol: "vless",
      address: "host",
      port: 443,
      password: "",
      transport: "websocket",
      fingerprint: "safari",
      flow: "xtls-rprx-vision",
      uuid: "00000000-0000-4000-8000-000000000001",
      security: "tls",
      plugin_opts: {},
      stream_settings: '{"network":"tcp","security":"tls"}',
      spider_x: "/hidden",
      rules: [],
      ip_rules: [],
      protocol_rules: [],
    },
  ],
  rules: [
    {
      id: first,
      remark: "First",
      enabled: false,
      kind: "domain",
      values: ["geosite:google-cn"],
      outbound_id: ob,
    },
    {
      id: second,
      remark: "Second",
      enabled: true,
      kind: "domain",
      values: ["geosite:cn"],
      outbound_id: "block",
    },
  ],
  default_outbound_id: "direct",
};
function globalConfig(): API.NodeConfig {
  return {
    dns: [],
    ip_strategy: "prefer_ipv4",
    node_secret: "secret",
    node_pull_interval: 60,
    node_push_interval: 10,
    traffic_report_threshold: 1024,
    routing: policy,
    routing_revision: 11,
    routing_mode: "global-v1",
    routing_capabilities: [1],
  };
}
function projection(
  value: API.NodeRouting,
  mode: "global-v1" | "local-v1",
  revision: number,
  localRevision: number
): API.NodeRoutingProjection {
  return {
    ...value,
    mode: mode === "local-v1" ? "ordered-v1-local" : "ordered-v1-inherited",
    source: mode === "local-v1" ? "server" : "global",
    source_server_id: mode === "local-v1" ? 7 : 0,
    source_revision: revision,
    local_transition_revision: localRevision,
  };
}
function serverConfig(local = false): API.GetServerNodeConfigResponse {
  const global = {
    dns: [],
    ip_strategy: "prefer_ipv4",
    routing: projection(policy, "global-v1", 11, 0),
    routing_revision: 11,
    routing_mode: "global-v1",
  };
  const localRevision = local ? 7 : 0;
  return {
    global,
    effective: local
      ? {
          ...global,
          routing: projection(policy, "local-v1", localRevision, localRevision),
          routing_revision: localRevision,
          routing_mode: "local-v1",
        }
      : global,
    override: {
      inherit_ip_strategy: true,
      ip_strategy: "",
      inherit_dns: true,
      dns: [],
      inherit_routing: !local,
      routing: local ? policy : null,
      routing_revision: localRevision,
    },
    routing_status: { known: false, reporter_verified: false },
  };
}
const server = {
  id: 7,
  name: "Example",
  address: "203.0.113.1",
  protocols: [],
} as unknown as API.Server;
function selectRouting() {
  const tab = screen.getByRole("tab", { name: "Ordered routing" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}
function openGlobal() {
  fireEvent.click(
    screen
      .getByText("Node configuration")
      .closest("[data-slot='sheet-trigger']")!
  );
  selectRouting();
}
function openServer() {
  fireEvent.click(screen.getByRole("button", { name: "Node Config" }));
  selectRouting();
}
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    }
  );
  mocks.config = globalConfig();
  mocks.update.mockImplementation(
    async (payload: API.UpdateNodeConfigRequest) => {
      const current = mocks.config as API.NodeConfig;
      mocks.config = {
        ...current,
        ...payload,
        routing_revision: current.routing_revision + (payload.routing ? 1 : 0),
      };
      return { data: { code: 0 } };
    }
  );
  mocks.serverUpdate.mockImplementation(
    async (payload: API.UpdateServerNodeConfigRequest) => {
      const current = structuredClone(
        mocks.config
      ) as API.GetServerNodeConfigResponse;
      if (payload.inherit_ip_strategy !== undefined) {
        current.override.inherit_ip_strategy = payload.inherit_ip_strategy;
        current.override.ip_strategy = payload.inherit_ip_strategy
          ? ""
          : (payload.ip_strategy ?? "");
      }
      if (payload.inherit_dns !== undefined) {
        current.override.inherit_dns = payload.inherit_dns;
        current.override.dns = payload.inherit_dns
          ? []
          : (payload.dns || []).map((item) => ({
              proto: item.proto.trim(),
              address: item.address.trim(),
              server_name: (item.server_name || "").trim(),
              domains: [
                ...new Set(
                  item.domains.map((line) => line.trim()).filter(Boolean)
                ),
              ],
            }));
      }
      const changed = Boolean(payload.routing || payload.inherit_routing);
      const revision = current.override.routing_revision + (changed ? 1 : 0);
      if (payload.routing) {
        current.override = {
          ...current.override,
          routing: payload.routing,
          inherit_routing: false,
          routing_revision: revision,
        };
        current.effective = {
          ...current.effective,
          routing: projection(payload.routing, "local-v1", revision, revision),
          routing_revision: revision,
          routing_mode: "local-v1",
        };
      } else if (payload.inherit_routing) {
        current.override = {
          ...current.override,
          routing: null,
          inherit_routing: true,
          routing_revision: revision,
        };
        current.effective = {
          ...current.effective,
          routing: {
            ...current.global.routing,
            local_transition_revision: revision,
          },
          routing_revision: current.global.routing_revision,
          routing_mode: "global-v1",
        };
      }
      mocks.config = current;
      return { data: { code: 0 } };
    }
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("cutover node configuration forms", () => {
  it("resets the global DNS editor when an authoritative refresh returns []", async () => {
    mocks.config = {
      ...globalConfig(),
      dns: [{ proto: "udp", address: "1.1.1.1", domains: ["geosite:cn"] }],
    };
    render(<ServerConfig />);
    fireEvent.click(
      screen
        .getByText("Node configuration")
        .closest("[data-slot='sheet-trigger']")!
    );
    const tab = screen.getByRole("tab", { name: "DNS Configuration" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(
      (screen.getByLabelText("Resolver address") as HTMLInputElement).value
    ).toBe("1.1.1.1");
    act(() => mocks.pushData?.({ ...globalConfig(), dns: [] }));
    await waitFor(() =>
      expect(screen.queryByLabelText("Resolver address")).toBeNull()
    );
    fireEvent.click(screen.getByRole("button", { name: "Add UDP resolver" }));
    expect(
      (screen.getByLabelText("Resolver address") as HTMLInputElement).value
    ).toBe("");
  });
  it("saves normalized UDP DNS and verifies the backend-canonical readback", async () => {
    render(<ServerConfig />);
    fireEvent.click(
      screen
        .getByText("Node configuration")
        .closest("[data-slot='sheet-trigger']")!
    );
    const tab = screen.getByRole("tab", { name: "DNS Configuration" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    fireEvent.click(screen.getByRole("button", { name: "Add UDP resolver" }));
    fireEvent.change(screen.getByLabelText("Resolver address"), {
      target: { value: "DNS.Example.COM.:0053" },
    });
    fireEvent.change(screen.getByLabelText("Domain rules"), {
      target: { value: "Example.COM.\n\nsuffix:example.net\nExample.COM.\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "Saved in the panel; node application is not yet confirmed."
      )
    );
    expect(mocks.update.mock.calls[0]![0].dns).toEqual([
      {
        proto: "udp",
        address: "dns.example.com.:53",
        server_name: "",
        domains: ["full:Example.COM", "domain:example.net"],
      },
    ]);
  });
  it("saves an XHTTP header named security without mistaking it for stream security", async () => {
    const config = structuredClone(globalConfig());
    config.routing!.outbounds[0]!.transport = "xhttp";
    config.routing!.outbounds[0]!.xhttp_extra =
      '{"headers":{"security":"Bearer token"}}';
    mocks.config = config;
    render(<ServerConfig />);
    openGlobal();
    fireEvent.click(screen.getByRole("button", { name: "Move 2. Second up" }));
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "Saved in the panel; node application is not yet confirmed."
      )
    );
    expect(
      mocks.update.mock.calls[0]![0].routing.outbounds[0].xhttp_extra
    ).toBe('{"headers":{"security":"Bearer token"}}');
  });
  it("blocks incomplete raw settings until they are explicitly corrected, without falling back to form fields", async () => {
    render(<ServerConfig />);
    openGlobal();
    fireEvent.click(
      screen
        .getAllByText("Proxy")
        .find((element) => element.closest("button"))!
        .closest("button")!
    );
    const input = screen.getByRole("textbox", { name: "Raw settings JSON" });
    fireEvent.change(input, { target: { value: "{}" } });
    expect(screen.getAllByText(/invalidRawSettings/).length).toBeGreaterThan(0);
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
    const raw =
      '{"address":"actual.example","port":443,"id":"short-id","encryption":"none"}';
    fireEvent.change(input, { target: { value: raw } });
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update.mock.calls[0]![0].routing.outbounds[0]).toMatchObject({
      address: "host",
      settings: raw,
    });
  });
  it("saves global routing with top-level revision and preserves fields, false and order on reopen", async () => {
    render(<ServerConfig />);
    openGlobal();
    expect(screen.queryByRole("tab", { name: "Block Rules" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Preview|legacy/i })
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Move 2. Second up" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    const payload = mocks.update.mock
      .calls[0]![0] as API.UpdateNodeConfigRequest;
    expect(payload.routing_revision).toBe(11);
    expect(payload.routing?.rules.map((rule) => rule.id)).toEqual([
      second,
      first,
    ]);
    expect(payload.routing?.rules[1]?.enabled).toBe(false);
    expect(payload.routing?.outbounds).toEqual(policy.outbounds);
    for (const field of [
      "block",
      "block_ips",
      "block_protocols",
      "outbound",
      "routing_action",
    ])
      expect(Object.hasOwn(payload, field)).toBe(false);
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "Saved in the panel; node application is not yet confirmed."
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    openGlobal();
    expect(
      screen
        .getByRole("switch", { name: "Enable 2. First" })
        .getAttribute("data-state")
    ).toBe("unchecked");
  });
  it("preserves unsupported existing routing while allowing a non-routing edit", async () => {
    const invalid = structuredClone(policy);
    invalid.outbounds[0]!.protocol = "tuic";
    invalid.outbounds[0]!.uot = true;
    mocks.config = { ...globalConfig(), routing: invalid };
    render(<ServerConfig />);
    openGlobal();
    expect(screen.getByText(/unsupportedConnection/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Move 2. Second up" }));
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(
      screen
        .getByText("Node configuration")
        .closest("[data-slot='sheet-trigger']")!
    );
    const basic = screen.getByRole("tab", { name: "Basic Configuration" });
    fireEvent.mouseDown(basic);
    fireEvent.click(basic);
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Node pull interval" }),
      { target: { value: "90" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    const payload = mocks.update.mock
      .calls[0]![0] as API.UpdateNodeConfigRequest;
    expect(Object.hasOwn(payload, "routing")).toBe(false);
    expect((mocks.config as API.NodeConfig).routing).toEqual(invalid);
  });
  it("updates global non-routing settings without submitting a routing package or retired fields", async () => {
    render(<ServerConfig />);
    fireEvent.click(
      screen
        .getByText("Node configuration")
        .closest("[data-slot='sheet-trigger']")!
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Node pull interval" }),
      { target: { value: "90" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    const payload = mocks.update.mock
      .calls[0]![0] as API.UpdateNodeConfigRequest;
    expect(payload).toMatchObject({
      node_pull_interval: 90,
      routing_revision: 11,
    });
    for (const field of [
      "routing",
      "block",
      "block_ips",
      "block_protocols",
      "outbound",
      "routing_action",
    ])
      expect(Object.hasOwn(payload, field)).toBe(false);
  });
  it.each([
    null,
    undefined,
  ])("does not submit unedited DNS, empty IP strategy or concurrent global settings (%s)", async (dns) => {
    mocks.config = { ...globalConfig(), dns, ip_strategy: "", node_secret: "" };
    render(<ServerConfig />);
    openGlobal();
    fireEvent.click(screen.getByRole("button", { name: "Move 2. Second up" }));
    const changed = {
      ...globalConfig(),
      dns: [{ proto: "udp", address: "9.9.9.9:53", domains: [] }],
      ip_strategy: "prefer_ipv6",
      node_secret: "new secret",
      node_pull_interval: 240,
    };
    act(() => {
      mocks.config = changed;
      mocks.pushData?.(changed);
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(1));
    const payload = mocks.update.mock
      .calls[0]![0] as API.UpdateNodeConfigRequest;
    expect(payload.routing_revision).toBe(11);
    for (const key of [
      "dns",
      "ip_strategy",
      "node_secret",
      "node_pull_interval",
      "node_push_interval",
      "traffic_report_threshold",
    ])
      expect(Object.hasOwn(payload, key)).toBe(false);
    expect((mocks.config as API.NodeConfig).dns).toEqual(changed.dns);
    expect((mocks.config as API.NodeConfig).node_secret).toBe("new secret");
  });
  it("can explicitly restore the empty IP strategy without inventing IPv4", async () => {
    render(<ServerConfig />);
    fireEvent.click(
      screen
        .getByText("Node configuration")
        .closest("[data-slot='sheet-trigger']")!
    );
    const tab = screen.getByRole("tab", { name: "DNS Configuration" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    fireEvent.click(screen.getByRole("combobox", { name: "IP Strategy" }));
    fireEvent.click(screen.getByRole("option", { name: "Node default" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(
      (mocks.update.mock.calls[0]![0] as API.UpdateNodeConfigRequest)
        .ip_strategy
    ).toBe("");
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(1));
    expect((mocks.config as API.NodeConfig).ip_strategy).toBe("");
  });
  it("rejects noninteger or out-of-range node intervals", async () => {
    render(<ServerConfig />);
    fireEvent.click(
      screen
        .getByText("Node configuration")
        .closest("[data-slot='sheet-trigger']")!
    );
    const field = screen.getByRole("spinbutton", {
      name: "Node pull interval",
    });
    fireEvent.change(field, { target: { value: "1.5" } });
    selectRouting();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Enter an integer from 0 to 86400 seconds.")
    ).toBeTruthy();
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Node pull interval" }),
      { target: { value: "86401" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("marks a non-routing readback mismatch uncertain", async () => {
    mocks.update.mockResolvedValue({ data: { code: 0 } });
    render(<ServerConfig />);
    fireEvent.click(
      screen
        .getByText("Node configuration")
        .closest("[data-slot='sheet-trigger']")!
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Node pull interval" }),
      { target: { value: "90" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/readback did not confirm it/)).toBeTruthy();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
  it("keeps the global draft editable after an HTTP 200 code 400 validation rejection", async () => {
    mocks.update.mockRejectedValue({
      response: {
        status: 200,
        data: {
          code: 400,
          msg: 'routing.rules[1].values invalid; password="hidden"',
        },
      },
    });
    render(<ServerConfig />);
    openGlobal();
    fireEvent.click(screen.getByRole("button", { name: "Move 2. Second up" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(/routing.rules\[1\].values invalid/)
    ).toBeTruthy();
    expect(screen.getByText(/password=\[redacted\]/)).toBeTruthy();
    expect(screen.queryByText(/readback did not confirm it/)).toBeNull();
    expect(mocks.refetch).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Move 1. Second down" })
    );
    expect(
      screen.getByRole("button", { name: "Move 2. Second up" })
    ).toBeTruthy();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
  it("checks authoritative global readback after an HTTP 200 business error", async () => {
    const commit = mocks.update.getMockImplementation()!;
    mocks.update.mockImplementation(
      async (payload: API.UpdateNodeConfigRequest) => {
        await commit(payload);
        throw Object.assign(new Error("backend error"), {
          response: {
            status: 200,
            data: { code: 10_002, msg: "post-commit error" },
          },
        });
      }
    );
    render(<ServerConfig />);
    openGlobal();
    fireEvent.click(screen.getByRole("button", { name: "Move 2. Second up" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        expect.stringContaining("readback confirms")
      )
    );
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it("keeps a stale global draft on HTTP 409 until explicit refresh", async () => {
    mocks.update.mockRejectedValue({
      response: { status: 409, data: { code: 160_001 } },
    });
    render(<ServerConfig />);
    openGlobal();
    fireEvent.click(screen.getByRole("button", { name: "Move 2. Second up" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(/Your draft has not been saved/)
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    openGlobal();
    expect(
      screen.getByRole("button", { name: "Move 2. First up" })
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh and discard draft" })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Move 2. Second up" })
      ).toBeTruthy()
    );
  });
  it("pins the draft's global revision if a background response arrives while editing", async () => {
    render(<ServerConfig />);
    openGlobal();
    fireEvent.click(screen.getByRole("button", { name: "Move 2. Second up" }));
    const changed = { ...globalConfig(), routing_revision: 99 };
    act(() => {
      mocks.config = changed;
      mocks.pushData?.(changed);
    });
    mocks.update.mockRejectedValue({
      response: { status: 409, data: { code: 160_001 } },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(
      (mocks.update.mock.calls[0]![0] as API.UpdateNodeConfigRequest)
        .routing_revision
    ).toBe(11);
    expect(
      await screen.findByText(/Your draft has not been saved/)
    ).toBeTruthy();
  });
  it("never reuses a draft or revision for a different server row", async () => {
    mocks.config = serverConfig(true);
    const view = render(<ServerNodeConfig server={server} />);
    openServer();
    fireEvent.click(screen.getByRole("button", { name: "Move 2. Second up" }));
    view.rerender(
      <ServerNodeConfig server={{ ...server, id: 8, name: "Other" }} />
    );
    expect(
      screen.queryByRole("button", { name: "Move 2. First up" })
    ).toBeNull();
    const next = serverConfig();
    act(() => {
      mocks.config = next;
      mocks.pushData?.(next);
    });
    openServer();
    expect(screen.getByText("Inherited global ordered routing")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(mocks.serverUpdate).not.toHaveBeenCalled();
  });
  it("pins the local revision when a concurrent server response arrives", async () => {
    mocks.config = serverConfig(true);
    render(<ServerNodeConfig server={server} />);
    openServer();
    fireEvent.click(screen.getByRole("button", { name: "Move 2. Second up" }));
    const changed = serverConfig(true);
    changed.override.routing_revision = 99;
    act(() => {
      mocks.config = changed;
      mocks.pushData?.(changed);
    });
    mocks.serverUpdate.mockRejectedValue({
      response: { status: 409, data: { code: 140_002 } },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.serverUpdate).toHaveBeenCalledTimes(1));
    expect(
      (
        mocks.serverUpdate.mock
          .calls[0]![0] as API.UpdateServerNodeConfigRequest
      ).routing_revision
    ).toBe(7);
    expect(
      await screen.findByText(/Your draft has not been saved/)
    ).toBeTruthy();
  });
  it("does not overwrite concurrently changed server DNS or IP strategy during a routing save", async () => {
    const start = serverConfig(true);
    start.override.inherit_dns = false;
    start.override.dns = [{ proto: "udp", address: "1.1.1.1:53", domains: [] }];
    start.override.inherit_ip_strategy = false;
    start.override.ip_strategy = "";
    mocks.config = start;
    render(<ServerNodeConfig server={server} />);
    openServer();
    fireEvent.click(screen.getByRole("button", { name: "Move 2. Second up" }));
    const changed = structuredClone(start);
    changed.override.dns = [
      { proto: "udp", address: "9.9.9.9:53", domains: [] },
    ];
    changed.override.ip_strategy = "prefer_ipv6";
    act(() => {
      mocks.config = changed;
      mocks.pushData?.(changed);
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(1));
    const payload = mocks.serverUpdate.mock
      .calls[0]![0] as API.UpdateServerNodeConfigRequest;
    for (const field of [
      "dns",
      "ip_strategy",
      "inherit_dns",
      "inherit_ip_strategy",
    ])
      expect(Object.hasOwn(payload, field)).toBe(false);
    expect(
      (mocks.config as API.GetServerNodeConfigResponse).override
    ).toMatchObject({ dns: changed.override.dns, ip_strategy: "prefer_ipv6" });
  });
  it.each([
    null,
    undefined,
  ])("keeps unedited server DNS %s readable and absent from routing saves", async (dns) => {
    const current = serverConfig(true);
    current.override.dns = dns;
    current.effective.dns = dns;
    current.global.dns = dns;
    mocks.config = current;
    render(<ServerNodeConfig server={server} />);
    openServer();
    fireEvent.click(screen.getByRole("button", { name: "Move 2. Second up" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(1));
    const payload = mocks.serverUpdate.mock
      .calls[0]![0] as API.UpdateServerNodeConfigRequest;
    expect(Object.hasOwn(payload, "dns")).toBe(false);
    expect(Object.hasOwn(payload, "inherit_dns")).toBe(false);
  });
  it("recovers from a HTTP 200 business error after commit by authoritative readback", async () => {
    mocks.config = serverConfig(true);
    const commit = mocks.serverUpdate.getMockImplementation()!;
    mocks.serverUpdate.mockImplementation(
      async (payload: API.UpdateServerNodeConfigRequest) => {
        await commit(payload);
        throw Object.assign(new Error("cache clear failed"), {
          response: {
            status: 200,
            data: { code: 10_002, msg: "cache clear failed" },
          },
        });
      }
    );
    render(<ServerNodeConfig server={server} />);
    openServer();
    fireEvent.click(screen.getByRole("button", { name: "Move 2. Second up" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        expect.stringContaining("readback confirms")
      )
    );
    expect(mocks.serverUpdate).toHaveBeenCalledTimes(1);
    expect(
      (mocks.config as API.GetServerNodeConfigResponse).override
        .routing_revision
    ).toBe(8);
  });
  it("keeps the server draft editable after an HTTP 200 code 400 validation rejection", async () => {
    mocks.config = serverConfig(true);
    mocks.serverUpdate.mockRejectedValue({
      response: {
        status: 200,
        data: { code: 400, msg: "invalid server rule" },
      },
    });
    render(<ServerNodeConfig server={server} />);
    openServer();
    fireEvent.click(screen.getByRole("button", { name: "Move 2. Second up" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("invalid server rule")).toBeTruthy();
    expect(mocks.refetch).not.toHaveBeenCalled();
    expect(screen.queryByText(/readback did not confirm it/)).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Move 1. Second down" })
    );
    expect(
      screen.getByRole("button", { name: "Move 2. Second up" })
    ).toBeTruthy();
  });
  it("copies inherited global routing into a local draft, saves it, then explicitly returns to inheritance", async () => {
    mocks.config = serverConfig();
    render(<ServerNodeConfig server={server} />);
    openServer();
    expect(screen.getByText("Inherited global ordered routing")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add rule" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Preview|legacy/i })
    ).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Use global routing" }));
    expect(screen.getByText(/complete local copy/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Move 2. Second up" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.serverUpdate).toHaveBeenCalledTimes(1));
    const local = mocks.serverUpdate.mock
      .calls[0]![0] as API.UpdateServerNodeConfigRequest;
    expect(local.routing_revision).toBe(0);
    expect(local.routing?.rules.map((rule) => rule.id)).toEqual([
      second,
      first,
    ]);
    expect(local.routing?.rules[1]?.enabled).toBe(false);
    expect(local.routing?.outbounds).toEqual(policy.outbounds);
    for (const field of [
      "mode",
      "source",
      "source_revision",
      "local_transition_revision",
    ])
      expect(Object.hasOwn(local.routing!, field)).toBe(false);
    for (const field of [
      "block",
      "outbound",
      "inherit_block",
      "inherit_outbound",
      "inherit_routing",
    ])
      expect(Object.hasOwn(local, field)).toBe(false);
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    openServer();
    expect(
      screen
        .getByRole("switch", { name: "Enable 2. First" })
        .getAttribute("data-state")
    ).toBe("unchecked");
    fireEvent.click(screen.getByRole("switch", { name: "Use global routing" }));
    expect(screen.getByText(/removes its local override/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.serverUpdate).toHaveBeenCalledTimes(2));
    const inherited = mocks.serverUpdate.mock
      .calls[1]![0] as API.UpdateServerNodeConfigRequest;
    expect(inherited).toMatchObject({
      server_id: 7,
      routing_revision: 1,
      inherit_routing: true,
    });
    expect(Object.hasOwn(inherited, "routing")).toBe(false);
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(2));
    expect(
      (mocks.config as API.GetServerNodeConfigResponse).override
    ).toMatchObject({
      inherit_routing: true,
      routing: null,
      routing_revision: 2,
    });
  });
  it("saves an empty local rule array, refreshes and reopens it as a local override", async () => {
    mocks.config = serverConfig(true);
    render(<ServerNodeConfig server={server} />);
    openServer();
    fireEvent.click(screen.getByRole("button", { name: "Delete 1. First" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete 1. Second" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(1));
    expect(
      (mocks.config as API.GetServerNodeConfigResponse).override.routing?.rules
    ).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    openServer();
    expect(
      screen.getByText(
        "No matching rules; all traffic uses the default outbound."
      )
    ).toBeTruthy();
    expect(
      screen
        .getByRole("switch", { name: "Use global routing" })
        .getAttribute("data-state")
    ).toBe("unchecked");
  });
  it("keeps the local draft on HTTP 409 until explicitly discarded", async () => {
    mocks.config = serverConfig(true);
    mocks.serverUpdate.mockRejectedValue({
      response: { status: 409, data: { code: 140_002 } },
    });
    render(<ServerNodeConfig server={server} />);
    openServer();
    fireEvent.click(screen.getByRole("button", { name: "Move 2. Second up" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(/Your draft has not been saved/)
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    openServer();
    expect(
      screen.getByRole("button", { name: "Move 2. First up" })
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh and discard draft" })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Move 2. Second up" })
      ).toBeTruthy()
    );
  });
  it("saves explicit empty local rules and detects ignored writes", async () => {
    mocks.config = serverConfig(true);
    mocks.serverUpdate.mockResolvedValue({ data: { code: 0 } });
    render(<ServerNodeConfig server={server} />);
    openServer();
    fireEvent.click(screen.getByRole("button", { name: "Delete 1. First" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete 1. Second" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.serverUpdate).toHaveBeenCalledTimes(1));
    const payload = mocks.serverUpdate.mock
      .calls[0]![0] as API.UpdateServerNodeConfigRequest;
    expect(payload.routing_revision).toBe(7);
    expect(payload.routing?.rules).toEqual([]);
    expect(await screen.findByText(/readback did not confirm it/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });
  it("refreshes the actual node receipt after cancelling a rule dialog", async () => {
    const current = serverConfig(true);
    mocks.config = current;
    render(<ServerNodeConfig server={server} />);
    openServer();
    fireEvent.click(screen.getByRole("button", { name: "Edit 1. First" }));
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Edit routing rule" })
      ).getByRole("button", { name: "Cancel" })
    );
    const identity = current.effective.routing;
    const next = structuredClone(current);
    next.routing_status = {
      known: true,
      reporter_verified: true,
      report: {
        routing_version: 1,
        instance_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        received_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        routing_pending: {
          mode: identity.mode,
          source: identity.source,
          source_server_id: identity.source_server_id,
          source_revision: identity.source_revision,
          local_transition_revision: identity.local_transition_revision,
        },
      },
    };
    mocks.config = next;
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(await screen.findByText("Pending node application")).toBeTruthy();
  });
  it("saves local routing with unknown node status without claiming application", async () => {
    mocks.config = serverConfig();
    render(<ServerNodeConfig server={server} />);
    openServer();
    expect(screen.getByText("Node application status unknown")).toBeTruthy();
    expect(
      screen.getByText(/can be saved while the node is offline/i)
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Use global routing" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "Saved in the panel; node application is not yet confirmed."
      )
    );
    expect(mocks.serverUpdate).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Node application status unknown")).toBeTruthy();
  });
  it("rejects an absent or unsupported global routing package rather than showing legacy controls", () => {
    mocks.config = {
      ...globalConfig(),
      routing: null,
      routing_mode: "ordered-v2",
    };
    render(<ServerConfig />);
    openGlobal();
    expect(screen.queryByRole("tab", { name: "Block Rules" })).toBeNull();
    expect(screen.getByText(/unsupported version/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });
});
