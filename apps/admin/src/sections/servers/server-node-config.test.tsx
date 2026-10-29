// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ServerNodeConfig from "./server-node-config";

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  updateConfig: vi.fn(),
  useQuery: vi.fn(),
}));

const policy: API.NodeRoutingProjection = {
  version: 1,
  outbounds: [],
  rules: [],
  default_outbound_id: "direct",
  mode: "ordered-v1-inherited",
  source: "global",
  source_server_id: 0,
  source_revision: 3,
  local_transition_revision: 0,
};
const config: API.GetServerNodeConfigResponse = {
  effective: {
    dns: [],
    ip_strategy: "prefer_ipv6",
    routing: policy,
    routing_revision: 3,
    routing_mode: "global-v1",
  },
  global: {
    dns: [],
    ip_strategy: "prefer_ipv6",
    routing: policy,
    routing_revision: 3,
    routing_mode: "global-v1",
  },
  override: {
    dns: [],
    inherit_dns: true,
    inherit_ip_strategy: true,
    ip_strategy: "prefer_ipv4",
    inherit_routing: true,
    routing: null,
    routing_revision: 0,
  },
  routing_status: { known: false, reporter_verified: false },
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
}));

vi.mock("@workspace/ui/services/node-config", () => ({
  getServerNodeConfig: vi.fn(),
  postServerNodeConfigUpdate: mocks.updateConfig,
}));

vi.mock("@workspace/ui/components/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("./outbound-config-input", () => ({
  OutboundConfigInput: () => <div>Outbound editor</div>,
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

const server = {
  address: "203.0.113.10",
  id: 7,
  name: "Singapore 01",
  protocols: [],
} as unknown as API.Server;

beforeEach(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: vi.fn(),
    configurable: true,
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    }
  );
  mocks.refetch.mockResolvedValue({ data: { serverId: server.id, config } });
  mocks.updateConfig.mockResolvedValue({ data: { data: true } });
  mocks.useQuery.mockReturnValue({
    data: { serverId: server.id, config },
    isError: false,
    isLoading: false,
    refetch: mocks.refetch,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

describe("server node configuration", () => {
  it("shows inherited values and only enables save after an override changes", async () => {
    render(<ServerNodeConfig server={server} />);

    fireEvent.click(screen.getByRole("button", { name: "Node Config" }));

    expect(
      screen.getByRole("heading", { name: "Node configuration overrides" })
    ).toBeTruthy();
    expect(screen.getAllByText("Using global configuration").length).toBe(2);
    expect(screen.getByText("Current global value: Prefer IPv6")).toBeTruthy();

    const save = screen.getByRole("button", { name: "Save" });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(
      screen.getByRole("switch", { name: "Use global IP strategy" })
    );
    expect((save as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(save);

    await waitFor(() => {
      expect(mocks.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          inherit_ip_strategy: false,
          ip_strategy: "prefer_ipv6",
          routing_revision: 0,
          server_id: 7,
        }),
        { skipErrorHandler: true }
      );
    });
    const payload = mocks.updateConfig.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    for (const field of [
      "routing",
      "inherit_routing",
      "block",
      "outbound",
      "inherit_block",
      "inherit_outbound",
    ])
      expect(Object.hasOwn(payload, field)).toBe(false);
  });

  it("retains the real DNS override editor and sends only non-routing fields", async () => {
    render(<ServerNodeConfig server={server} />);
    fireEvent.click(screen.getByRole("button", { name: "Node Config" }));
    fireEvent.click(
      screen.getByRole("switch", { name: "Use global DNS configuration" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Add UDP resolver" }));
    fireEvent.change(screen.getByPlaceholderText("1.1.1.1:53"), {
      target: { value: "1.1.1.1:53" },
    });
    fireEvent.change(screen.getByPlaceholderText("One domain rule per line"), {
      target: { value: "geosite:cn\nfull:example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.updateConfig).toHaveBeenCalledTimes(1));
    const payload = mocks.updateConfig.mock
      .calls[0]![0] as API.UpdateServerNodeConfigRequest;
    expect(payload).toMatchObject({
      inherit_dns: false,
      routing_revision: 0,
      dns: [
        {
          proto: "udp",
          address: "1.1.1.1:53",
          server_name: "",
          domains: ["geosite:cn", "full:example.com"],
        },
      ],
    });
    expect(Object.hasOwn(payload, "routing")).toBe(false);
    // The fixture readback intentionally ignores the write; do not report success.
    expect(await screen.findByText(/readback did not confirm it/)).toBeTruthy();
  });
  it("requires a DNS address before saving an override", async () => {
    render(<ServerNodeConfig server={server} />);
    fireEvent.click(screen.getByRole("button", { name: "Node Config" }));
    fireEvent.click(
      screen.getByRole("switch", { name: "Use global DNS configuration" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Add UDP resolver" }));
    const routingTab = screen.getByRole("tab", { name: "Ordered routing" });
    fireEvent.mouseDown(routingTab);
    fireEvent.click(routingTab);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(
        "Check the UDP resolver addresses and domain rules before saving."
      )
    ).toBeTruthy();
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });
  it("blocks invalid DNS domain regexps and preserves the multi-line draft until corrected", async () => {
    render(<ServerNodeConfig server={server} />);
    fireEvent.click(screen.getByRole("button", { name: "Node Config" }));
    fireEvent.click(
      screen.getByRole("switch", { name: "Use global DNS configuration" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Add UDP resolver" }));
    fireEvent.change(screen.getByLabelText("Resolver address"), {
      target: { value: "1.1.1.1:53" },
    });
    const domains = screen.getByLabelText(
      "Domain rules"
    ) as HTMLTextAreaElement;
    fireEvent.change(domains, { target: { value: "geosite:cn\n\nregexp:(" } });
    expect(
      screen.getByText(/Line 3: the regular expression is invalid/)
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(
        "Check the UDP resolver addresses and domain rules before saving."
      )
    ).toBeTruthy();
    expect(mocks.updateConfig).not.toHaveBeenCalled();
    expect(domains.value).toBe("geosite:cn\n\nregexp:(");
    fireEvent.change(domains, {
      target: { value: "geosite:cn\n\nregexp:^example\\.com$\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.updateConfig).toHaveBeenCalledTimes(1));
    expect(mocks.updateConfig.mock.calls[0]![0].dns[0].domains).toEqual([
      "geosite:cn",
      "regexp:^example\\.com$",
    ]);
  });
  it("blocks editing and offers a retry when loading fails", () => {
    mocks.useQuery.mockReturnValue({
      data: undefined,
      isError: true,
      isLoading: false,
      refetch: mocks.refetch,
    });

    render(<ServerNodeConfig server={server} />);
    fireEvent.click(screen.getByRole("button", { name: "Node Config" }));

    expect(screen.getByText("Unable to load configuration")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });
});
