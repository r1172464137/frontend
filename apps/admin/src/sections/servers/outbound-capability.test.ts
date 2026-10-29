import { describe, expect, it } from "vitest";
import { validateOutboundCapability } from "./outbound-capability";
import {
  getOutboundFields,
  getOutboundSecurityOptions,
  OUTBOUND_PROTOCOLS,
} from "./outbound-config";

const base: API.NodeRoutingOutbound = {
  id: "ob_11111111-1111-4111-8111-111111111111",
  name: "proxy",
  protocol: "vless",
  address: "example.com",
  port: 443,
  password: "",
  uuid: "00000000-0000-4000-8000-000000000001",
  transport: "tcp",
  security: "reality",
  sni: "example.com",
  reality_public_key: "A".repeat(43),
  fingerprint: "chrome",
  flow: "xtls-rprx-vision",
  rules: [],
  ip_rules: [],
  protocol_rules: [],
};
const codes = (item: API.NodeRoutingOutbound) =>
  validateOutboundCapability(item).map((issue) => issue.code);
describe("node ordered outbound capability", () => {
  it("accepts supported VLESS REALITY and Vision without rewriting fields", () => {
    const copy = structuredClone(base);
    expect(codes(copy)).toEqual([]);
    expect(copy).toEqual(base);
    expect(
      getOutboundSecurityOptions("vless").map((item) => item.value)
    ).toContain("reality");
    expect(
      getOutboundFields((_key, fallback) => fallback)
        .find((field) => field.name === "flow")
        ?.visible?.(base)
    ).toBe(true);
    expect(OUTBOUND_PROTOCOLS.some((item) => item.value === "tuic")).toBe(
      false
    );
  });
  it.each([
    [{ protocol: "tuic" }, "unsupportedConnection"],
    [{ protocol: "wireguard" }, "unsupportedConnection"],
    [{ uot: true }, "unsupportedUOT"],
    [{ uot_version: 2 }, "unsupportedUOT"],
    [{ settings: '{"nested":{"uot":true}}' }, "unsupportedUOT"],
    [{ settings: '{"uot":false,"uot":true}' }, "invalidJSON"],
    [{ settings: '{"plugin":"obfs","\\u0070lugin":""}' }, "invalidJSON"],
    [{ stream_settings: '{"sockopt":{"uotVersion":2}}' }, "unsupportedUOT"],
    [{ multiplex: "smux" }, "unsupportedMultiplex"],
    [{ encryption: "mlkem768x25519plus" }, "unsupportedEncryption"],
    [{ encryption_ticket: "old-ticket" }, "unsupportedEncryption"],
    [{ plugin: "obfs" }, "unsupportedPlugin"],
    [{ plugin_opts: { mode: "http" } }, "unsupportedPlugin"],
    [{ settings: '{"plugin":"obfs"}' }, "unsupportedPlugin"],
    [{ transport: "tuic" }, "unsupportedTransport"],
    [
      { security: "xtls", stream_settings: '{"security":"tls"}' },
      "unsupportedSecurity",
    ],
    [
      { security: "other", stream_settings: '{"security":"tls"}' },
      "unsupportedSecurity",
    ],
    [
      { xhttp_mode: "bogus", stream_settings: '{"security":"tls"}' },
      "invalidXHTTPMode",
    ],
    [{ stream_settings: '{"network":"tuic"}' }, "unsupportedTransport"],
    [
      { protocol: "hysteria2", stream_settings: '{"network":"tcp"}' },
      "unsupportedTransport",
    ],
    [{ transport: "hysteria" }, "unsupportedTransport"],
    [
      { xhttp_extra: '{"downloadSettings":{"network":"tuic"}}' },
      "unsupportedTransport",
    ],
    [{ reality_public_key: "bad" }, "invalidRealityKey"],
    [{ reality_short_id: "xyz" }, "invalidRealityShortId"],
    [{ spider_x: "/%" }, "invalidURI"],
    [{ flow: "invalid" }, "unsupportedFlow"],
    [{ address: "" }, "requiredAddress"],
    [{ port: 0 }, "requiredPort"],
    [{ uuid: "", password: "" }, "requiredUUID"],
    [
      {
        protocol: "shadowsocks",
        security: "",
        transport: "",
        password: "x",
        cipher: "aes-192-gcm",
      },
      "unsupportedCipher",
    ],
    [
      {
        protocol: "shadowsocks",
        security: "",
        transport: "",
        flow: "",
        password: "short",
        cipher: "2022-blake3-aes-128-gcm",
      },
      "invalidShadowsocksKey",
    ],
  ])("rejects unsupported or incomplete fields %j", (patch, expected) => {
    expect(codes({ ...base, ...patch })).toContain(expected);
  });
  it.each([
    "http",
    "socks",
    "vless",
    "vmess",
    "shadowsocks",
    "trojan",
    "anytls",
    "hysteria2",
  ])("rejects empty raw %s settings even when projected fields are populated", (protocol) => {
    const item = {
      ...base,
      protocol,
      settings: "{}",
      password: "projected-secret",
      cipher: "aes-128-gcm",
    };
    expect(codes(item)).toContain("invalidRawSettings");
    expect(item.settings).toBe("{}");
    expect(item.address).toBe("example.com");
  });
  it.each([
    ["http", { address: "proxy.example", port: 8080 }],
    [
      "http",
      {
        servers: [
          {
            address: "proxy.example",
            port: 8080,
            users: [{ user: "a", pass: "b" }],
          },
        ],
      },
    ],
    ["socks", { address: "proxy.example", port: 1080, user: "a", pass: "b" }],
    ["socks", { servers: [{ address: "proxy.example", port: 1080 }] }],
    [
      "vless",
      {
        address: "proxy.example",
        port: 443,
        id: "short-id",
        encryption: "none",
      },
    ],
    [
      "vless",
      {
        vnext: [
          {
            address: "proxy.example",
            port: 443,
            users: [{ id: "short-id", encryption: "none" }],
          },
        ],
      },
    ],
    [
      "vmess",
      { address: "proxy.example", port: 443, id: "short-id", security: "auto" },
    ],
    [
      "vmess",
      {
        vnext: [
          { address: "proxy.example", port: 443, users: [{ id: "short-id" }] },
        ],
      },
    ],
    [
      "trojan",
      {
        servers: [{ address: "proxy.example", port: 443, password: "secret" }],
      },
    ],
    [
      "shadowsocks",
      {
        address: "proxy.example",
        port: 443,
        method: "aes-128-gcm",
        password: "secret",
      },
    ],
    ["anytls", { address: "proxy.example", port: 443, password: "secret" }],
    ["hysteria2", { address: "proxy.example", port: 443, version: 2 }],
    ["direct", {}],
    ["reject", {}],
  ])("accepts node-compatible raw %s settings without rewriting them", (protocol, settings) => {
    const item = {
      ...base,
      protocol,
      settings: JSON.stringify(settings),
      flow: "old-projected-flow",
      ...(protocol === "hysteria2"
        ? {
            transport: "",
            stream_settings: '{"network":"hysteria","security":"tls"}',
          }
        : {}),
    };
    const original = structuredClone(item);
    expect(codes(item)).toEqual([]);
    expect(item).toEqual(original);
  });
  it.each([
    ["http", { servers: [] }],
    [
      "socks",
      {
        servers: [
          { address: "proxy.example", port: 1080 },
          { address: "other", port: 1080 },
        ],
      },
    ],
    ["http", { servers: [{ port: 8080 }] }],
    [
      "http",
      {
        address: "",
        port: 8080,
        servers: [{ address: "ignored.example", port: 8080 }],
      },
    ],
    ["socks", { address: "proxy.example", port: "1080" }],
    ["vless", { address: "proxy.example", port: 443, id: "short-id" }],
    ["vless", { vnext: [{ address: "proxy.example", port: 443, users: [] }] }],
    [
      "vless",
      {
        vnext: [
          {
            address: "proxy.example",
            port: 443,
            users: [{ id: "short-id", encryption: "bad" }],
          },
        ],
      },
    ],
    [
      "vmess",
      { vnext: [{ address: "proxy.example", port: 443, users: [{}] }] },
    ],
    ["trojan", { address: "proxy.example", port: 443, password: "" }],
    [
      "shadowsocks",
      {
        address: "proxy.example",
        port: 443,
        password: "secret",
        method: "invalid",
      },
    ],
    ["anytls", { address: "proxy.example", port: 443 }],
    ["hysteria2", { address: "proxy.example", port: 443, version: 1 }],
  ])("rejects incomplete raw %s protocol shape", (protocol, settings) => {
    expect(
      codes({ ...base, protocol, settings: JSON.stringify(settings) })
    ).toContain("invalidRawSettings");
  });
  it("checks raw REALITY stream credentials and nested paths", () => {
    const raw = JSON.stringify({
      network: "tcp",
      security: "reality",
      realitySettings: {
        publicKey: "A".repeat(43),
        fingerprint: "chrome",
        spiderX: "/ok",
      },
    });
    expect(codes({ ...base, stream_settings: raw })).toEqual([]);
    expect(
      codes({
        ...base,
        stream_settings:
          '{"network":"tcp","security":"reality","realitySettings":{"publicKey":"bad","spiderX":"/%"}}',
      })
    ).toEqual(expect.arrayContaining(["invalidRealityKey", "invalidURI"]));
  });
  it.each([
    ['{"network":"tcp","security":"xtls"}', "unsupportedSecurity"],
    ['{"network":"tcp","security":"unknown"}', "unsupportedSecurity"],
    ['{"network":"tcp","security":null}', "unsupportedSecurity"],
    ['{"network":"tcp","security":" tls "}', "unsupportedSecurity"],
    [
      '{"network":"tcp","security":"tls","tlsSettings":{"fingerprint":"invalid"}}',
      "invalidFingerprint",
    ],
    [
      '{"network":"tcp","security":"tls","tlsSettings":{"allowInsecure":true}}',
      "unsupportedSecurity",
    ],
    [
      '{"network":"xhttp","xhttpSettings":{"downloadSettings":{"security":"xtls"}}}',
      "unsupportedSecurity",
    ],
    [
      '{"network":"xhttp","xhttpSettings":{"extra":{"downloadSettings":{"security":"nonsense"}}}}',
      "unsupportedSecurity",
    ],
    [
      '{"network":"xhttp","xhttpSettings":{"downloadSettings":{"security":"reality","realitySettings":{"publicKey":"bad"}}}}',
      "invalidRealityKey",
    ],
    [
      '{"network":"xhttp","xhttpSettings":{"downloadSettings":{"security":"tls","tlsSettings":{"fingerprint":"bad"}}}}',
      "invalidFingerprint",
    ],
    [
      '{"network":"tcp","security":"reality","realitySettings":{"publicKey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","spiderX":"/?p=4097"}}',
      "invalidURI",
    ],
  ])("validates raw security and nested stream values %s", (stream_settings, code) => {
    const item = { ...base, flow: "", stream_settings };
    expect(codes(item)).toContain(code);
    expect(item.stream_settings).toBe(stream_settings);
  });
  it("accepts supported nested TLS while preserving ignored projected security fields", () => {
    const stream_settings =
      '{"network":"xhttp","security":"tls","tlsSettings":{"fingerprint":"chrome"},"xhttpSettings":{"downloadSettings":{"network":"tcp","security":"tls","tlsSettings":{"fingerprint":"chrome"}}}}';
    const item = { ...base, flow: "", allow_insecure: true, stream_settings };
    expect(codes(item)).toEqual([]);
    expect(item.allow_insecure).toBe(true);
    expect(item.stream_settings).toBe(stream_settings);
  });
  it("matches backend strict XHTTP extra security and nested shape", () => {
    const simple = {
      ...base,
      flow: "",
      stream_settings: '{"network":"tcp","security":"tls"}',
    };
    expect(
      codes({
        ...simple,
        xhttp_extra: '{"downloadSettings":{"network":"tcp","security":"tls"}}',
      })
    ).toEqual([]);
    expect(
      codes({
        ...simple,
        xhttp_mode: "stream-one",
        xhttp_extra: '{"downloadSettings":{"security":"tls"}}',
      })
    ).toContain("unsupportedXHTTPSettings");
    expect(
      codes({
        ...simple,
        xhttp_extra:
          '{"downloadSettings":{"security":"tls","tlsSettings":{"fingerprint":"chrome"}}}',
      })
    ).toContain("unsupportedXHTTPSettings");
    expect(
      codes({
        ...simple,
        xhttp_extra:
          '{"downloadSettings":{"security":"reality","realitySettings":{"publicKey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}}}',
      })
    ).toContain("unsupportedXHTTPSettings");
    expect(
      codes({ ...simple, xhttp_extra: '{"unknownField":true}' })
    ).toContain("unsupportedXHTTPSettings");
    for (const extra of [
      '{"xPaddingPlacement":"bogus"}',
      '{"xPaddingBytes":"0-5"}',
      '{"xmux":{"maxConcurrency":1,"maxConnections":2}}',
      '{"downloadSettings":{"port":65536}}',
      '{"downloadSettings":{"network":"tcp","security":"tls","httpupgradeSettings":{"headers":{"Host":"bad"}}}}',
    ])
      expect(codes({ ...simple, xhttp_extra: extra })).toContain(
        "unsupportedXHTTPSettings"
      );
    expect(
      codes({
        ...simple,
        xhttp_mode: "packet-up",
        xhttp_extra:
          '{"xPaddingBytes":"100-200","uplinkDataPlacement":"header","xmux":{"maxConnections":"1-2"}}',
      })
    ).toEqual([]);
  });
  it("treats XHTTP and stream headers as opaque string maps, but still validates actual stream security", () => {
    const headers = {
      security: "Bearer custom-token",
      network: "custom",
      method: "POST",
      path: "%not-a-uri",
      plugin: "header-value",
    };
    const raw = {
      ...base,
      flow: "",
      stream_settings: '{"network":"tcp","security":"tls"}',
      xhttp_extra: JSON.stringify({ headers }),
    };
    expect(codes(raw)).toEqual([]);
    const stream = JSON.stringify({
      network: "xhttp",
      security: "tls",
      xhttpSettings: {
        headers,
        downloadSettings: {
          network: "tcp",
          security: "tls",
          wsSettings: { headers },
        },
      },
    });
    expect(codes({ ...base, flow: "", stream_settings: stream })).toEqual([]);
    expect(
      codes({
        ...raw,
        xhttp_extra: JSON.stringify({
          headers,
          downloadSettings: { security: "xtls" },
        }),
      })
    ).toContain("unsupportedSecurity");
    expect(
      codes({ ...raw, xhttp_extra: '{"headers":{"uot":"enabled"}}' })
    ).toContain("unsupportedUOT");
  });
  it("validates nested XHTTP extra security and TLS settings", () => {
    expect(
      codes({
        ...base,
        flow: "",
        xhttp_extra: '{"downloadSettings":{"security":"xtls"}}',
      })
    ).toContain("unsupportedSecurity");
    expect(
      codes({
        ...base,
        flow: "",
        xhttp_extra:
          '{"downloadSettings":{"security":"tls","tlsSettings":{"allowInsecure":true}}}',
      })
    ).toContain("unsupportedSecurity");
  });
  it("honors raw settings precedence for projected encryption but still rejects all configured UoT", () => {
    const item: API.NodeRoutingOutbound = {
      ...base,
      settings: JSON.stringify({
        address: "example.com",
        port: 443,
        id: base.uuid,
        encryption: "none",
      }),
      encryption: "old-encryption",
      encryption_mode: "old-mode",
      encryption_ticket: "keep",
      uot: false,
    };
    const original = structuredClone(item);
    expect(codes(item)).not.toContain("unsupportedEncryption");
    expect(item).toEqual(original);
    expect(codes({ ...item, uot: true })).toContain("unsupportedUOT");
    expect(
      codes({ ...item, settings: '{"nested":{"uotVersion":2}}' })
    ).toContain("unsupportedUOT");
    expect(codes({ ...base, encryption: "old-encryption" })).toContain(
      "unsupportedEncryption"
    );
  });
  it("preserves raw settings while rejecting unsupported hidden options", () => {
    const item = {
      ...base,
      settings: '  {"uot":false,"padding":"  keep  "}  ',
      multiplex: "smux",
      uot: false,
    };
    expect(codes(item)).toContain("unsupportedMultiplex");
    expect(item.settings).toBe('  {"uot":false,"padding":"  keep  "}  ');
  });
});
