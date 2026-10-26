// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ServerConfig from "./server-config";

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
  getSystemNodeConfig: vi.fn(),
  putSystemNodeConfig: mocks.updateConfig,
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

function sentinelOutbound() {
  return {
    name: "PRESERVE-GLOBAL",
    protocol: "direct",
    address: "",
    port: 0,
    password: "",
    rules: ["domain:sentinel.example"],
    ip_rules: ["geoip:private"],
    protocol_rules: [],
    plugin: "sentinel-plugin",
    plugin_opts: { mode: "sentinel" },
    encryption_ticket: "sentinel-ticket",
    spider_x: "sentinel-spider",
    settings: '{"sentinel":true}',
    stream_settings: '{"network":"sentinel"}',
    future_additive: { keep: true },
  };
}

function baseConfig(): Record<string, any> {
  return {
    block: ["full:old.example"],
    block_ips: ["geoip:private"],
    block_protocols: [],
    dns: [],
    ip_strategy: "prefer_ipv4",
    node_pull_interval: 60,
    node_push_interval: 10,
    node_secret: "secret",
    outbound: [sentinelOutbound()],
    traffic_report_threshold: 1024,
  };
}

function openConfig() {
  fireEvent.click(
    screen
      .getByText("Node configuration")
      .closest("[data-slot='sheet-trigger']")!
  );
  const blockTab = screen.getByRole("tab", { name: "Block Rules" });
  fireEvent.mouseDown(blockTab);
  fireEvent.click(blockTab);
}

beforeEach(() => {
  mocks.config = baseConfig();
  mocks.refetch.mockResolvedValue({ data: mocks.config });
  mocks.updateConfig.mockImplementation(async (payload) => {
    mocks.config = payload;
    return { data: { data: true } };
  });
  mocks.useQuery.mockImplementation(() => ({
    data: mocks.config,
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

describe("global structured block rules", () => {
  it("saves normalized three-category payloads and reopens exact values", async () => {
    render(<ServerConfig />);
    openConfig();

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Domain / GeoSite / RE2 Regex",
      }),
      {
        target: {
          value:
            " canonical.example. \ngeosite:category-pt\nregex:(?i)tracker\ngeosite:category-pt",
        },
      }
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "IP / GeoIP / CIDR" }),
      { target: { value: " geoip:private\n10.0.0.0/8\ngeoip:private" } }
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "BitTorrent / µTP" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.updateConfig).toHaveBeenCalledTimes(1));
    expect(mocks.updateConfig.mock.calls[0]?.[0]).toMatchObject({
      block: [
        "full:canonical.example",
        "geosite:category-pt",
        "regexp:(?i)tracker",
      ],
      block_ips: ["geoip:private", "10.0.0.0/8"],
      block_protocols: ["bittorrent"],
    });
    expect(mocks.updateConfig.mock.calls[0]?.[0].outbound[0]).toMatchObject(
      sentinelOutbound()
    );

    openConfig();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Domain / GeoSite / RE2 Regex",
        }) as HTMLTextAreaElement
      ).value
    ).toBe("full:canonical.example\ngeosite:category-pt\nregexp:(?i)tracker");
    expect(
      (
        screen.getByRole("textbox", {
          name: "IP / GeoIP / CIDR",
        }) as HTMLTextAreaElement
      ).value
    ).toBe("geoip:private\n10.0.0.0/8");
    expect(
      (
        screen.getByRole("checkbox", {
          name: "BitTorrent / µTP",
        }) as HTMLButtonElement
      ).getAttribute("data-state")
    ).toBe("checked");
  });

  it("gates an old backend while preserving ordinary legacy edits", async () => {
    const legacy = baseConfig();
    Reflect.deleteProperty(legacy, "block_ips");
    Reflect.deleteProperty(legacy, "block_protocols");
    legacy.outbound = [
      {
        name: "LEGACY",
        protocol: "direct",
        address: "",
        port: 0,
        password: "",
        rules: ["full:legacy.example"],
      },
    ];
    mocks.config = legacy;

    render(<ServerConfig />);
    openConfig();

    expect(screen.getByText(/Backend upgrade required/)).toBeTruthy();
    expect(
      (
        screen.getByRole("textbox", {
          name: "IP / GeoIP / CIDR",
        }) as HTMLTextAreaElement
      ).disabled
    ).toBe(true);
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Domain / GeoSite / RE2 Regex",
      }),
      { target: { value: "full:legacy.example\nfull:new.example" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.updateConfig).toHaveBeenCalledTimes(1));
    const payload = mocks.updateConfig.mock.calls[0]?.[0] as Record<
      string,
      any
    >;
    expect(payload.block).toEqual(["full:legacy.example", "full:new.example"]);
    expect(Object.hasOwn(payload, "block_ips")).toBe(false);
    expect(Object.hasOwn(payload, "block_protocols")).toBe(false);
    expect(Object.hasOwn(payload.outbound[0], "ip_rules")).toBe(false);
    expect(Object.hasOwn(payload.outbound[0], "protocol_rules")).toBe(false);
  });
});
