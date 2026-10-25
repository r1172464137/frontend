// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getProtocolDefaultConfig, useProtocolFields } from "./form-schema";
import { formSchema } from "./form-schema/schemas";
import ServerForm from "./server-form";

vi.mock("@/stores/node", () => ({
  useNode: () => ({ isProtocolUsedInNodes: () => false }),
}));

vi.mock("@workspace/ui/components/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// Icons are irrelevant here; avoid loading icon data over the network.
vi.mock("@workspace/ui/composed/icon", () => ({ Icon: () => null }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

beforeEach(() => {
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

const server = {
  name: "SNI front",
  address: "node.example.com",
  country: "SG",
  city: "Singapore",
  protocols: [
    {
      type: "vless",
      enable: true,
      ratio: 2,
      port: 443,
      transport: "tcp",
      security: "reality",
      flow: "xtls-rprx-vision",
      sni: "www.example.com",
      reality_server_addr: "www.example.com",
      reality_server_port: 443,
      reality_private_key: "test-private-key",
      reality_public_key: "test-public-key",
      reality_short_id: "aabbccdd",
      fingerprint: "firefox",
      encryption: "none",
    },
    {
      type: "hysteria2",
      enable: true,
      port: 40_000,
      security: "tls",
      sni: "node.example.com",
      cert_mode: "self",
      allow_insecure: true,
    },
  ],
} as unknown as Partial<API.Server>;

function openForm(initialValues = server, type = "vless") {
  const onSubmit = vi.fn().mockResolvedValue(false);
  const view = render(
    <ServerForm
      initialValues={initialValues}
      onSubmit={onSubmit}
      title="Edit server"
      trigger="Open server"
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Open server" }));
  fireEvent.click(screen.getByText(type, { exact: true }).closest("button")!);
  return { ...view, onSubmit };
}

function proxySwitch() {
  return screen.getByRole("switch", { name: "Accept PROXY protocol" });
}

async function save(onSubmit: ReturnType<typeof vi.fn>) {
  const calls = onSubmit.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(calls + 1));
  // Assert the actual API JSON representation, not just form state.
  return JSON.parse(JSON.stringify(onSubmit.mock.calls[calls]?.[0]));
}

describe("PROXY protocol field definitions", () => {
  it("only offers reception for transports wired by ppnode", () => {
    const { result } = renderHook(() => useProtocolFields());
    for (const type of ["vmess", "vless", "trojan"]) {
      const field = result.current[type]?.find(
        (item) => item.name === "accept_proxy_protocol"
      );
      expect(field).toMatchObject({ type: "switch", defaultValue: false });
      for (const transport of ["tcp", "ws", "websocket", "httpupgrade"]) {
        expect(field?.condition?.({ transport, security: "none" }, {})).toBe(
          true
        );
      }
      for (const transport of ["grpc", "xhttp", "splithttp", "quic"]) {
        expect(field?.condition?.({ transport }, {})).toBe(false);
      }
    }
    const ss = result.current.shadowsocks?.find(
      (item) => item.name === "accept_proxy_protocol"
    );
    expect(ss?.condition?.({ obfs: "http" }, {})).toBe(true);
    expect(ss?.condition?.({ plugin: "obfs-local" }, {})).toBe(false);
    expect(ss?.condition?.({}, {})).toBe(false);
    for (const type of [
      "hysteria2",
      "tuic",
      "anytls",
      "naive",
      "mieru",
      "shadowsocksr",
      "snell",
    ]) {
      expect(
        result.current[type]?.some(
          (field) => field.name === "accept_proxy_protocol"
        )
      ).toBe(false);
    }
  });

  it.each([
    "vmess",
    "vless",
    "trojan",
    "shadowsocks",
  ] as const)("defaults omitted legacy %s values to false and rejects string booleans", (type) => {
    expect(getProtocolDefaultConfig(type).accept_proxy_protocol).toBe(false);
    const parse = (protocol: Record<string, unknown>) =>
      formSchema.safeParse({ ...server, protocols: [{ type, ...protocol }] });
    const legacy = parse({});
    expect(legacy.success).toBe(true);
    if (legacy.success) {
      expect(legacy.data.protocols[0]).toMatchObject({
        accept_proxy_protocol: false,
      });
    }
    for (const value of [true, false]) {
      const result = parse({ accept_proxy_protocol: value });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.protocols[0]).toMatchObject({
          accept_proxy_protocol: value,
        });
      }
    }
    expect(parse({ accept_proxy_protocol: "false" }).success).toBe(false);
    expect(parse({ accept_proxy_protocol: "true" }).success).toBe(false);
  });

  it("preserves the legacy Shadowsocks HTTP-obfs configuration", () => {
    const protocol = {
      type: "shadowsocks",
      obfs: "http",
      obfs_host: "www.example.com",
      obfs_path: "/proxy",
      accept_proxy_protocol: true,
    };
    expect(
      formSchema.parse({ ...server, protocols: [protocol] }).protocols[0]
    ).toMatchObject(protocol);
  });
});

describe("server form PROXY protocol save/reopen", () => {
  it("loads an omitted legacy value as off, saves false, and can enable it", async () => {
    const { onSubmit, unmount } = openForm();
    expect(proxySwitch().getAttribute("aria-checked")).toBe("false");
    expect(
      screen.getByText(/previous hop.*must send PROXY protocol headers/)
    ).toBeTruthy();
    const original = await save(onSubmit);
    expect(original.protocols[0].accept_proxy_protocol).toBe(false);
    expect(original.protocols[0]).toMatchObject(server.protocols![0]!);
    expect(original.protocols[1]).toMatchObject(server.protocols![1]!);
    fireEvent.click(proxySwitch());
    const enabled = await save(onSubmit);
    expect(enabled.protocols[0].accept_proxy_protocol).toBe(true);
    expect({ ...enabled.protocols[0], accept_proxy_protocol: false }).toEqual(
      original.protocols[0]
    );
    expect(enabled.protocols[1]).toEqual(original.protocols[1]);
    expect(enabled).toMatchObject({
      name: server.name,
      address: server.address,
    });
    unmount();
    openForm(enabled);
    expect(proxySwitch().getAttribute("aria-checked")).toBe("true");
  });

  it("keeps existing true, toggles to a JSON false, and reopens off", async () => {
    const initialValues = {
      ...server,
      protocols: server.protocols?.map((protocol) =>
        protocol.type === "vless"
          ? { ...protocol, accept_proxy_protocol: true }
          : protocol
      ),
    };
    const { onSubmit, unmount } = openForm(initialValues);
    expect(proxySwitch().getAttribute("aria-checked")).toBe("true");
    const original = await save(onSubmit);
    expect(original.protocols[0].accept_proxy_protocol).toBe(true);
    fireEvent.click(proxySwitch());
    const disabled = await save(onSubmit);
    expect(disabled.protocols[0].accept_proxy_protocol).toBe(false);
    expect({ ...disabled.protocols[0], accept_proxy_protocol: true }).toEqual(
      original.protocols[0]
    );
    expect(disabled.protocols[1]).toEqual(original.protocols[1]);
    unmount();
    openForm(disabled);
    expect(proxySwitch().getAttribute("aria-checked")).toBe("false");
  });

  it("saves the legacy Shadowsocks HTTP-obfs switch without losing obfs settings", async () => {
    const protocol = {
      ...getProtocolDefaultConfig("shadowsocks"),
      enable: true,
      port: 8388,
      obfs: "http",
      obfs_host: "www.example.com",
      obfs_path: "/proxy",
      accept_proxy_protocol: true,
    };
    const { onSubmit } = openForm(
      { ...server, protocols: [protocol] },
      "shadowsocks"
    );
    expect(proxySwitch().getAttribute("aria-checked")).toBe("true");
    fireEvent.click(proxySwitch());
    const saved = await save(onSubmit);
    expect(saved.protocols[0]).toMatchObject({
      type: "shadowsocks",
      obfs: "http",
      obfs_host: "www.example.com",
      obfs_path: "/proxy",
      accept_proxy_protocol: false,
    });
  });

  it.each([
    true,
    false,
  ])("retains %s when switching TCP → XHTTP → TCP in the same form", async (value) => {
    const { onSubmit } = openForm();
    if (value) fireEvent.click(proxySwitch());
    const transport = screen
      .getByRole("combobox", { name: "Transport" })
      .closest('[data-slot="form-item"]')
      ?.querySelector("select");
    // Radix's native select handles the same onValueChange as its popup.
    expect(transport).toBeTruthy();
    fireEvent.change(transport!, { target: { value: "xhttp" } });
    expect(
      screen.queryByRole("switch", { name: "Accept PROXY protocol" })
    ).toBeNull();
    const hidden = await save(onSubmit);
    expect(hidden.protocols[0]).toMatchObject({
      transport: "xhttp",
      accept_proxy_protocol: value,
    });
    fireEvent.change(transport!, { target: { value: "tcp" } });
    expect(proxySwitch().getAttribute("aria-checked")).toBe(String(value));
    const restored = await save(onSubmit);
    expect(restored.protocols[0]).toMatchObject({
      transport: "tcp",
      accept_proxy_protocol: value,
      flow: "xtls-rprx-vision",
    });
  });

  it.each([
    "grpc",
    "xhttp",
  ])("preserves a hidden true value on %s without offering reception", async (transport) => {
    const initialValues = {
      ...server,
      protocols: [
        {
          ...server.protocols?.[0],
          transport,
          service_name: "proxy-service",
          path: "/proxy",
          xhttp_mode: "packet-up",
          xhttp_extra: '{"noSSEHeader":true}',
          accept_proxy_protocol: true,
        },
      ],
    } as Partial<API.Server>;
    const { onSubmit } = openForm(initialValues);
    expect(
      screen.queryByRole("switch", { name: "Accept PROXY protocol" })
    ).toBeNull();
    const saved = await save(onSubmit);
    expect(saved.protocols[0]).toMatchObject({
      transport,
      accept_proxy_protocol: true,
      reality_private_key: "test-private-key",
    });
    if (transport === "xhttp") {
      expect(saved.protocols[0]).toMatchObject({
        path: "/proxy",
        xhttp_mode: "packet-up",
        xhttp_extra: '{"noSSEHeader":true}',
      });
    } else {
      expect(saved.protocols[0].service_name).toBe("proxy-service");
    }
  });
});
