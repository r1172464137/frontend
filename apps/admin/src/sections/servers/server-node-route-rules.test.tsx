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
  config: {} as Record<string, any>,
  refetch: vi.fn(),
  updateConfig: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
}));

vi.mock("@workspace/ui/services/admin/admin", () => ({
  getServerNodeConfig: vi.fn(),
  postServerNodeConfigUpdate: mocks.updateConfig,
}));

vi.mock("@workspace/ui/components/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@workspace/ui/composed/dynamic-Inputs", () => ({
  ArrayInput: () => <div>DNS editor</div>,
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

function outbound() {
  return {
    name: "CN-DIRECT",
    protocol: "direct",
    address: "",
    port: 0,
    password: "",
    rules: ["geosite:cn"],
    ip_rules: ["geoip:cn"],
    protocol_rules: ["bittorrent"],
    plugin: "override-plugin",
    plugin_opts: { mode: "override-sentinel" },
    encryption_ticket: "override-ticket",
    spider_x: "override-spider",
    settings: '{"override":true}',
    stream_settings: '{"network":"override"}',
    future_override_field: ["preserve-me"],
  };
}

function structuredConfig() {
  return {
    effective: {
      block: ["full:global.example", "geosite:category-pt"],
      block_ips: ["geoip:private"],
      block_protocols: ["bittorrent"],
      dns: [],
      ip_strategy: "prefer_ipv6",
      outbound: [outbound()],
    },
    global: {
      block: ["full:global.example", "geosite:category-pt"],
      block_ips: ["geoip:private"],
      block_protocols: ["bittorrent"],
      dns: [],
      ip_strategy: "prefer_ipv6",
      outbound: [outbound()],
    },
    override: {
      block: [],
      block_ips: [],
      block_protocols: [],
      dns: [],
      inherit_block: true,
      inherit_dns: true,
      inherit_ip_strategy: true,
      inherit_outbound: false,
      ip_strategy: "prefer_ipv4",
      outbound: [outbound()],
    },
  };
}

function openBlockTab() {
  fireEvent.click(screen.getByRole("button", { name: "Node Config" }));
  const blockTab = screen.getByRole("tab", { name: /Block Rules/ });
  fireEvent.mouseDown(blockTab);
  fireEvent.click(blockTab);
}

beforeEach(() => {
  mocks.config = structuredConfig();
  mocks.refetch.mockImplementation(async () => ({ data: mocks.config }));
  mocks.updateConfig.mockImplementation(async (payload) => {
    mocks.config = {
      ...mocks.config,
      effective: {
        ...mocks.config.effective,
        block: payload.block,
        block_ips: payload.block_ips,
        block_protocols: payload.block_protocols,
        outbound: payload.outbound,
      },
      override: {
        ...mocks.config.override,
        ...payload,
      },
    };
    return { data: { data: true } };
  });
  mocks.useQuery.mockImplementation(() => ({
    data: mocks.config,
    isError: false,
    isLoading: false,
    refetch: mocks.refetch,
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    }
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("per-server structured block overrides", () => {
  it("shows all inherited counts, saves one three-category override, and reopens it", async () => {
    render(<ServerNodeConfig server={server} />);
    openBlockTab();

    expect(screen.getByRole("tabpanel").textContent).toContain(
      "2 domain, 1 IP, and 1 protocol block rules are provided by the global configuration."
    );

    fireEvent.click(
      screen.getByRole("switch", { name: "Use global block rules" })
    );
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Domain / GeoSite / RE2 Regex",
      }),
      { target: { value: "suffix:server.example" } }
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "IP / GeoIP / CIDR" }),
      { target: { value: "203.0.113.0/24\n2001:db8::/32" } }
    );
    // The inherited effective protocol value becomes the initial override.
    expect(
      screen
        .getByRole("checkbox", { name: "BitTorrent / µTP" })
        .getAttribute("data-state")
    ).toBe("checked");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.updateConfig).toHaveBeenCalledTimes(1));
    expect(mocks.updateConfig.mock.calls[0]?.[0]).toMatchObject({
      server_id: 7,
      inherit_block: false,
      block: ["domain:server.example"],
      block_ips: ["203.0.113.0/24", "2001:db8::/32"],
      block_protocols: ["bittorrent"],
    });
    // Outbound match arrays are hidden on another tab but must survive this save.
    expect(mocks.updateConfig.mock.calls[0]?.[0].outbound[0]).toMatchObject(
      outbound()
    );

    openBlockTab();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Domain / GeoSite / RE2 Regex",
        }) as HTMLTextAreaElement
      ).value
    ).toBe("domain:server.example");
    expect(
      (
        screen.getByRole("textbox", {
          name: "IP / GeoIP / CIDR",
        }) as HTMLTextAreaElement
      ).value
    ).toBe("203.0.113.0/24\n2001:db8::/32");
    expect(
      screen
        .getByRole("checkbox", { name: "BitTorrent / µTP" })
        .getAttribute("data-state")
    ).toBe("checked");
  });
});
