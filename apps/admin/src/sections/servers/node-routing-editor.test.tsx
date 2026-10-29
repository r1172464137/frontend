// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NodeRoutingEditor } from "./node-routing-editor";

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
const rr = "rr_22222222-2222-4222-8222-222222222222";
const rr2 = "rr_33333333-3333-4333-8333-333333333333";
const initial: API.NodeRouting = {
  version: 1,
  outbounds: [
    {
      id: ob,
      name: "Proxy",
      protocol: "vless",
      address: "example.com",
      port: 443,
      password: "",
      transport: "websocket",
      fingerprint: "firefox",
      flow: "vision",
      allow_insecure: false,
      alpn: [],
      plugin: "hidden-plugin",
      plugin_opts: { keep: true },
      settings: '{"security":"custom"}',
      stream_settings: '{"network":"custom"}',
      encryption_ticket: "ticket",
      spider_x: "hidden-path",
      multiplex: "low",
    },
  ],
  rules: [
    {
      id: rr,
      enabled: false,
      remark: "First",
      kind: "domain",
      values: ["geosite:google-cn"],
      outbound_id: ob,
    },
    {
      id: rr2,
      enabled: true,
      remark: "Second",
      kind: "domain",
      values: ["geosite:cn"],
      outbound_id: "block",
    },
  ],
  default_outbound_id: "direct",
};
function Harness({
  initialValue = initial,
}: {
  initialValue?: API.NodeRouting;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <>
      <NodeRoutingEditor onChange={setValue} value={value} />
      <output data-testid="policy">{JSON.stringify(value)}</output>
    </>
  );
}
function value(): API.NodeRouting {
  return JSON.parse(screen.getByTestId("policy").textContent || "{}");
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
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("real ordered routing editor", () => {
  it("moves with accessible buttons, toggles false and refuses deleting a disabled rule's target", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Move 2. Second up" }));
    expect(value().rules.map((rule) => rule.id)).toEqual([rr2, rr]);
    fireEvent.click(screen.getByRole("switch", { name: "Enable 2. First" }));
    expect(value().rules[1]?.enabled).toBe(true);
    fireEvent.click(screen.getByRole("switch", { name: "Enable 2. First" }));
    fireEvent.change(screen.getByLabelText("Default outbound"), {
      target: { value: ob },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete Proxy" }));
    const error = screen.getByText(/Cannot delete this connection/).textContent;
    expect(error).toContain("First");
    expect(error).toContain("Default outbound");
    expect(value().outbounds).toHaveLength(1);
  });
  it("renames a connection without normalizing transport, flow, fingerprint, presence or refs", () => {
    render(<Harness />);
    fireEvent.click(
      screen
        .getAllByText("Proxy")
        .find((element) => element.closest("button"))!
        .closest("button")!
    );
    fireEvent.change(screen.getByPlaceholderText("Configuration name"), {
      target: { value: "Renamed" },
    });
    expect(value().outbounds[0]).toEqual({
      ...initial.outbounds[0],
      name: "Renamed",
    });
    expect(value().rules[0]?.outbound_id).toBe(ob);
    expect(Object.hasOwn(value().outbounds[0]!, "rules")).toBe(false);
  });
  it("exposes VLESS REALITY and Vision without rewriting the connection", () => {
    const outbound: API.NodeRoutingOutbound = {
      id: ob,
      name: "Proxy",
      protocol: "vless",
      address: "example.com",
      port: 443,
      password: "",
      uuid: "00000000-0000-4000-8000-000000000001",
      security: "tls",
      transport: "tcp",
      reality_public_key: "A".repeat(43),
      fingerprint: "chrome",
      flow: "none",
      rules: [],
      ip_rules: [],
      protocol_rules: [],
    };
    render(<Harness initialValue={{ ...initial, outbounds: [outbound] }} />);
    fireEvent.click(
      screen
        .getAllByText("Proxy")
        .find((element) => element.closest("button"))!
        .closest("button")!
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Security" }));
    fireEvent.click(screen.getByRole("option", { name: /reality/i }));
    expect(value().outbounds[0]?.security).toBe("reality");
    fireEvent.click(screen.getByRole("combobox", { name: "Flow" }));
    fireEvent.click(
      screen.getByRole("option", { name: /^xtls-rprx-vision$/i })
    );
    expect(value().outbounds[0]).toEqual({
      ...outbound,
      security: "reality",
      flow: "xtls-rprx-vision",
    });
  });
  it("keeps an ALPN multiline draft and preserves password and raw JSON whitespace", () => {
    const outbound = {
      ...initial.outbounds[0]!,
      protocol: "trojan",
      security: "tls",
      transport: "tcp",
      plugin: "",
      plugin_opts: {},
      multiplex: "none",
      password: "original",
    };
    render(<Harness initialValue={{ ...initial, outbounds: [outbound] }} />);
    fireEvent.click(
      screen
        .getAllByText("Proxy")
        .find((element) => element.closest("button"))!
        .closest("button")!
    );
    const alpn = screen.getByRole("textbox", {
      name: "ALPN",
    }) as HTMLTextAreaElement;
    fireEvent.change(alpn, { target: { value: "h2\n" } });
    expect(alpn.value).toBe("h2\n");
    fireEvent.change(alpn, { target: { value: "h2\nhttp/1.1" } });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Password / secret" }),
      { target: { value: "  secret  " } }
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Raw settings JSON" }),
      { target: { value: '  {"password":"  keep  "}  ' } }
    );
    expect(value().outbounds[0]).toMatchObject({
      alpn: ["h2", "http/1.1"],
      password: "  secret  ",
      settings: '  {"password":"  keep  "}  ',
    });
  });
  it("explains raw settings precedence and never fills an incomplete raw connection from projected fields", () => {
    const outbound: API.NodeRoutingOutbound = {
      id: ob,
      name: "Proxy",
      protocol: "vless",
      address: "projected.example",
      port: 443,
      password: "",
      uuid: "short-id",
      transport: "tcp",
      security: "tls",
      settings: "{}",
    };
    render(<Harness initialValue={{ ...initial, outbounds: [outbound] }} />);
    fireEvent.click(
      screen
        .getAllByText("Proxy")
        .find((element) => element.closest("button"))!
        .closest("button")!
    );
    expect(
      screen.getByText(/raw settings replace the projected connection fields/i)
    ).toBeTruthy();
    expect(screen.getAllByText(/invalidRawSettings/).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByPlaceholderText("Server address"), {
      target: { value: "other.example" },
    });
    expect(screen.getAllByText(/invalidRawSettings/).length).toBeGreaterThan(0);
    expect(value().outbounds[0]?.settings).toBe("{}");
    const raw =
      '{"address":"actual.example","port":443,"id":"short-id","encryption":"none"}';
    fireEvent.change(
      screen.getByRole("textbox", { name: "Raw settings JSON" }),
      { target: { value: raw } }
    );
    expect(screen.queryByText(/invalidRawSettings/)).toBeNull();
    expect(value().outbounds[0]).toMatchObject({
      address: "other.example",
      settings: raw,
    });
  });
  it("preserves unsupported hidden values and blocks saving until explicitly corrected", () => {
    render(<Harness />);
    fireEvent.click(
      screen
        .getAllByText("Proxy")
        .find((element) => element.closest("button"))!
        .closest("button")!
    );
    expect(
      screen.getByText(/unsupported or incomplete settings/i)
    ).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Configuration name"), {
      target: { value: "Renamed" },
    });
    expect(value().outbounds[0]).toMatchObject({
      plugin: "hidden-plugin",
      multiplex: "low",
      encryption_ticket: "ticket",
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove unsupported connection options",
      })
    );
    expect(Object.hasOwn(value().outbounds[0]!, "plugin")).toBe(false);
    expect(Object.hasOwn(value().outbounds[0]!, "multiplex")).toBe(false);
    expect(value().outbounds[0]?.encryption_ticket).toBe("ticket");
    expect(value().outbounds[0]?.settings).toBe('{"security":"custom"}');
  });
  it.each([
    "mouse",
    "touch",
    "keyboard",
  ] as const)("drags across rows with %s input", async (kind) => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const row = this.closest("[data-sortable-id]");
        const index = row ? [...row.parentElement!.children].indexOf(row) : 0;
        const top = index * 120;
        return {
          x: 0,
          y: top,
          top,
          bottom: top + 100,
          left: 0,
          right: 300,
          width: 300,
          height: 100,
          toJSON: () => ({}),
        };
      }
    );
    render(<Harness />);
    const handle = screen.getByRole("button", {
      name: "Drag 1. First to reorder",
    });
    if (kind === "mouse") {
      fireEvent.mouseDown(handle, { button: 0, clientX: 20, clientY: 30 });
      fireEvent.mouseMove(document, { buttons: 1, clientX: 20, clientY: 50 });
      await new Promise((resolve) => setTimeout(resolve, 30));
      fireEvent.mouseMove(document, { buttons: 1, clientX: 20, clientY: 160 });
      await new Promise((resolve) => setTimeout(resolve, 30));
      fireEvent.mouseUp(document, { clientX: 20, clientY: 160 });
    } else if (kind === "touch") {
      const point = (y: number) => ({
        identifier: 1,
        target: handle,
        clientX: 20,
        clientY: y,
        pageX: 20,
        pageY: y,
      });
      fireEvent.touchStart(handle, {
        touches: [point(30)],
        changedTouches: [point(30)],
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      fireEvent.touchMove(handle, {
        touches: [point(160)],
        changedTouches: [point(160)],
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      fireEvent.touchEnd(handle, { touches: [], changedTouches: [point(160)] });
    } else {
      handle.focus();
      fireEvent.keyDown(handle, { code: "Space", key: " " });
      await new Promise((resolve) => setTimeout(resolve, 30));
      fireEvent.keyDown(document, { code: "ArrowDown", key: "ArrowDown" });
      await new Promise((resolve) => setTimeout(resolve, 30));
      fireEvent.keyDown(document, { code: "Space", key: " " });
    }
    await waitFor(() =>
      expect(value().rules.map((rule) => rule.id)).toEqual([rr2, rr])
    );
    // dnd-kit removes its post-drag click suppressor asynchronously.
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  it("warns when a BitTorrent rule targets SOCKS", () => {
    render(
      <Harness
        initialValue={{
          ...initial,
          outbounds: [{ ...initial.outbounds[0]!, protocol: "socks" }],
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    fireEvent.change(screen.getByLabelText("Match type"), {
      target: { value: "protocol" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "BitTorrent / µTP" }));
    fireEvent.change(screen.getByLabelText("Outbound"), {
      target: { value: ob },
    });
    expect(screen.getByText("SOCKS5 UDP support required")).toBeTruthy();
    expect(screen.getByText(/UDP Associate/)).toBeTruthy();
  });
  it("adds and edits a single-kind rule using the real dialog", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(
      (screen.getByRole("button", { name: "Apply rule" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Remark"), {
      target: { value: "Private" },
    });
    fireEvent.change(screen.getByLabelText("Match type"), {
      target: { value: "ip" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "IP / GeoIP / CIDR" }),
      { target: { value: "10.0.0.1/8" } }
    );
    fireEvent.change(screen.getByLabelText("Outbound"), {
      target: { value: "block" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Rule enabled" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply rule" }));
    await waitFor(() => expect(value().rules).toHaveLength(3));
    expect(value().rules[2]).toMatchObject({
      remark: "Private",
      enabled: false,
      kind: "ip",
      values: ["10.0.0.0/8"],
      outbound_id: "block",
    });
  });
});
