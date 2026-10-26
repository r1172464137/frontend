// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOutboundConfig,
  normalizeOutboundConfig,
  type OutboundConfigFormData,
  outboundConfigForPayload,
  outboundConfigListSchema,
  validateOutboundCollection,
} from "./outbound-config";
import { OutboundConfigInput } from "./outbound-config-input";

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

function configuredOutbound(
  name: string,
  protocol: string,
  route: Partial<OutboundConfigFormData> = {}
) {
  return normalizeOutboundConfig({
    ...createOutboundConfig(protocol),
    name,
    ...route,
  });
}

function Harness({
  initial,
  supported = true,
}: {
  initial: OutboundConfigFormData[];
  supported?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <OutboundConfigInput
        onChange={setValue}
        structuredRulesSupported={supported}
        value={value}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

function currentValue() {
  return JSON.parse(screen.getByTestId("value").textContent || "[]") as Record<
    string,
    unknown
  >[];
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
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("outbound structured match groups", () => {
  it("edits domain, IP, and protocol rules and warns for SOCKS BitTorrent", () => {
    render(<Harness initial={[configuredOutbound("PT-SOCKS", "socks")]} />);

    fireEvent.click(screen.getByText("PT-SOCKS").closest("button")!);
    const domainEditor = screen.getByRole("textbox", {
      name: "Domain / GeoSite / RE2 Regex",
    }) as HTMLTextAreaElement;
    fireEvent.change(domainEditor, {
      target: { value: "geosite:category-pt\n" },
    });
    expect(domainEditor.value).toBe("geosite:category-pt\n");
    fireEvent.change(domainEditor, {
      target: {
        value: " geosite:category-pt \ngeosite:category-pt\n",
      },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "IP / GeoIP / CIDR" }),
      { target: { value: "geoip:private\n10.0.0.0/8" } }
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "BitTorrent / µTP" }));

    expect(currentValue()[0]).toMatchObject({
      rules: ["geosite:category-pt"],
      ip_rules: ["geoip:private", "10.0.0.0/8"],
      protocol_rules: ["bittorrent"],
    });
    expect(screen.getByText("SOCKS5 UDP support required")).toBeTruthy();
    expect(screen.getByText(/UDP Associate/)).toBeTruthy();
  });

  it("makes top-to-bottom routing priority explicit and preserves reordered values", () => {
    render(
      <Harness
        initial={[
          configuredOutbound("FIRST", "direct", {
            rules: ["full:first.example"],
          }),
          configuredOutbound("SECOND", "direct", {
            ip_rules: ["geoip:cn"],
          }),
        ]}
      />
    );

    expect(screen.getByText(/top-to-bottom order/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Move SECOND up" }));

    expect(currentValue().map((item) => item.name)).toEqual([
      "SECOND",
      "FIRST",
    ]);
    expect(currentValue()[0]?.ip_rules).toEqual(["geoip:cn"]);
    expect(currentValue()[1]?.rules).toEqual(["full:first.example"]);
  });

  it("preserves all match arrays and backend-only fields when the connection protocol changes", () => {
    const initial = configuredOutbound("PRESERVED", "socks", {
      rules: ["geosite:cn"],
      ip_rules: ["geoip:cn"],
      protocol_rules: ["bittorrent"],
      settings: '{"allProtocols":true}',
      plugin: "sentinel-plugin",
      plugin_opts: { mode: "sentinel" },
      encryption_ticket: "sentinel-ticket",
      spider_x: "sentinel-spider",
      stream_settings: '{"network":"sentinel"}',
      future_additive: { keep: true },
    });
    render(<Harness initial={[initial]} />);
    fireEvent.click(screen.getByText("PRESERVED").closest("button")!);

    const protocolSelect = screen.getAllByRole("combobox")[0]!;
    fireEvent.click(protocolSelect);
    fireEvent.click(screen.getByRole("option", { name: "Direct" }));

    expect(currentValue()[0]).toMatchObject({
      protocol: "direct",
      rules: ["geosite:cn"],
      ip_rules: ["geoip:cn"],
      protocol_rules: ["bittorrent"],
      settings: '{"allProtocols":true}',
      plugin: "sentinel-plugin",
      plugin_opts: { mode: "sentinel" },
      encryption_ticket: "sentinel-ticket",
      spider_x: "sentinel-spider",
      stream_settings: '{"network":"sentinel"}',
      future_additive: { keep: true },
    });
  });

  it("canonicalizes outbound route groups before payload limits and serialization", () => {
    const item = configuredOutbound("CANONICAL", "direct", {
      rules: ["example.com.", "FULL:example.com", "suffix:sub.example."],
      ip_rules: ["10.2.3.4/8", "10.0.0.0/8", "fc00::1/7"],
      protocol_rules: ["BitTorrent", "bittorrent"],
    });
    expect(outboundConfigForPayload(item, true)).toMatchObject({
      rules: ["full:example.com", "domain:sub.example"],
      ip_rules: ["10.0.0.0/8", "fc00::/7"],
      protocol_rules: ["bittorrent"],
    });
  });

  it("mirrors backend outbound count, aggregate, and serialized limits", () => {
    const tooMany = Array.from({ length: 129 }, (_, index) =>
      configuredOutbound(`OUTBOUND-${index}`, "direct")
    );
    expect(validateOutboundCollection(tooMany)).toContain("tooManyOutbounds");

    const tooManyRules = Array.from({ length: 5 }, (_, outboundIndex) =>
      configuredOutbound(`RULES-${outboundIndex}`, "direct", {
        rules: Array.from(
          { length: 900 },
          (_, ruleIndex) => `domain:host-${outboundIndex}-${ruleIndex}.example`
        ),
      })
    );
    expect(validateOutboundCollection(tooManyRules)).toContain(
      "outboundAggregateRules"
    );

    const tooManyRuleBytes = configuredOutbound("BYTES", "direct", {
      rules: Array.from(
        { length: 13 },
        (_, index) => `regex:${"a".repeat(3980)}${index}`
      ),
    });
    expect(validateOutboundCollection([tooManyRuleBytes])).toContain(
      "outboundAggregateBytes"
    );

    const serializedTooLarge = configuredOutbound("JSON", "direct", {
      future_large_field: "x".repeat(61_440),
    });
    expect(validateOutboundCollection([serializedTooLarge])).toContain(
      "outboundSerializedTooLarge"
    );
  });

  it("rejects empty and trim-equivalent duplicate outbound names", () => {
    const first = configuredOutbound("DUPLICATE", "direct");
    const second = {
      ...configuredOutbound("SECOND", "direct"),
      name: " DUPLICATE ",
    };
    const empty = { ...configuredOutbound("EMPTY", "direct"), name: " " };

    expect(outboundConfigListSchema.safeParse([first, second]).success).toBe(
      false
    );
    expect(outboundConfigListSchema.safeParse([empty]).success).toBe(false);

    render(<Harness initial={[first, second]} />);
    fireEvent.click(screen.getAllByText("DUPLICATE")[0]!.closest("button")!);
    expect(
      screen.getByText('Outbound name "DUPLICATE" must be unique.')
    ).toBeTruthy();
  });

  it("keeps row drafts attached through rename, reorder, and insertion", () => {
    render(
      <Harness
        initial={[
          configuredOutbound("FIRST", "direct"),
          configuredOutbound("SECOND", "direct"),
        ]}
      />
    );

    fireEvent.click(screen.getByText("SECOND").closest("button")!);
    const domainEditor = screen.getByRole("textbox", {
      name: "Domain / GeoSite / RE2 Regex",
    }) as HTMLTextAreaElement;
    fireEvent.change(domainEditor, {
      target: { value: "domain:second.example\n" },
    });
    fireEvent.change(screen.getByPlaceholderText("Configuration name"), {
      target: { value: "RENAMED" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move RENAMED up" }));

    expect(currentValue().map((item) => item.name)).toEqual([
      "RENAMED",
      "FIRST",
    ]);
    expect(
      (
        screen.getByRole("textbox", {
          name: "Domain / GeoSite / RE2 Regex",
        }) as HTMLTextAreaElement
      ).value
    ).toBe("domain:second.example\n");

    fireEvent.click(screen.getByRole("button", { name: "Add outbound" }));
    fireEvent.change(screen.getByPlaceholderText("Configuration name"), {
      target: { value: "INSERTED" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move INSERTED up" }));
    expect(currentValue().map((item) => item.name)).toEqual([
      "RENAMED",
      "INSERTED",
      "FIRST",
    ]);
    expect(currentValue()[0]?.rules).toEqual(["domain:second.example"]);

    fireEvent.click(screen.getByRole("button", { name: "Delete FIRST" }));
    expect(currentValue().map((item) => item.name)).toEqual([
      "RENAMED",
      "INSERTED",
    ]);
    fireEvent.click(screen.getByText("RENAMED").closest("button")!);
    expect(
      (
        screen.getByRole("textbox", {
          name: "Domain / GeoSite / RE2 Regex",
        }) as HTMLTextAreaElement
      ).value
    ).toBe("domain:second.example");
  });

  it("shows legacy values but disables unsupported new categories", () => {
    render(
      <Harness
        initial={[configuredOutbound("LEGACY", "direct")]}
        supported={false}
      />
    );
    fireEvent.click(screen.getByText("LEGACY").closest("button")!);

    expect(screen.getByText(/Backend upgrade required/)).toBeTruthy();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Domain / GeoSite / RE2 Regex",
        }) as HTMLTextAreaElement
      ).disabled
    ).toBe(false);
    expect(
      (
        screen.getByRole("textbox", {
          name: "IP / GeoIP / CIDR",
        }) as HTMLTextAreaElement
      ).disabled
    ).toBe(true);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "BitTorrent / µTP",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });
});
