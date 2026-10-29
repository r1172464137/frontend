import { z } from "zod";
import { FINGERPRINTS, getLabel, XHTTP_MODES } from "./form-schema";
import { supportedShadowsocksCiphers } from "./outbound-capability";

export const OUTBOUND_PROTOCOLS = [
  { label: "HTTP", value: "http" },
  { label: "SOCKS", value: "socks" },
  { label: "Shadowsocks", value: "shadowsocks" },
  { label: "VMess", value: "vmess" },
  { label: "VLESS", value: "vless" },
  { label: "Trojan", value: "trojan" },
  { label: "Hysteria2", value: "hysteria2" },
  { label: "AnyTLS", value: "anytls" },
  { label: "Direct", value: "direct" },
  { label: "Reject", value: "reject" },
];

const OUTBOUND_TRANSPORTS = ["tcp", "ws", "grpc", "httpupgrade", "xhttp"];
const OUTBOUND_SECURITY = {
  http: ["none", "tls", "reality"],
  socks: ["none", "tls", "reality"],
  shadowsocks: ["none", "tls", "reality"],
  vmess: ["none", "tls", "reality"],
  vless: ["none", "tls", "reality"],
  trojan: ["none", "tls", "reality"],
  hysteria2: ["tls"],
  anytls: ["tls", "reality"],
} as const;

const text = z.string().optional();

export const outboundConnectionSchema = z
  .object({
    name: z.string(),
    protocol: z.string(),
    address: z.string(),
    port: z.number(),
    user: text,
    password: z.string(),
    uuid: text,
    cipher: text,
    security: text,
    sni: text,
    alpn: z.array(z.string()).optional(),
    allow_insecure: z.boolean().optional(),
    fingerprint: text,
    reality_public_key: text,
    reality_short_id: text,
    transport: text,
    host: text,
    path: text,
    service_name: text,
    xhttp_mode: text,
    xhttp_extra: text,
    flow: text,
    encryption: text,
    encryption_mode: text,
    encryption_rtt: text,
    encryption_client_padding: text,
    encryption_password: text,
    multiplex: text,
    uot: z.boolean().optional(),
    uot_version: z.number().optional(),
    congestion_controller: text,
    udp_stream: z.boolean().optional(),
    reduce_rtt: z.boolean().optional(),
    heartbeat: z.number().optional(),
    settings: text,
    stream_settings: text,
    spider_x: text,
    rules: z.array(z.string()).optional(),
    ip_rules: z.array(z.string()).optional(),
    protocol_rules: z.array(z.string()).optional(),
  })
  .loose();

// Missing fields, explicit false/[], and hidden connection fields survive.
export type OutboundConnection = z.infer<typeof outboundConnectionSchema>;

export type OutboundNameIssue = {
  code: "duplicate" | "empty";
  index: number;
  name: string;
};
export function validateOutboundNames(
  values: Pick<OutboundConnection, "name">[]
): OutboundNameIssue[] {
  const firstIndexByName = new Map<string, number>();
  const issues: OutboundNameIssue[] = [];
  for (const [index, item] of values.entries()) {
    const name = item.name.trim();
    if (!name) {
      issues.push({ code: "empty", index, name });
      continue;
    }
    const firstIndex = firstIndexByName.get(name);
    if (firstIndex === undefined) {
      firstIndexByName.set(name, index);
      continue;
    }
    if (!issues.some((issue) => issue.index === firstIndex)) {
      issues.push({ code: "duplicate", index: firstIndex, name });
    }
    issues.push({ code: "duplicate", index, name });
  }
  return issues;
}

export type OutboundFieldGroup =
  | "basic"
  | "auth"
  | "transport"
  | "security"
  | "reality"
  | "protocol";
export type OutboundFieldConfig = {
  name: keyof OutboundConnection;
  type: "text" | "number" | "select" | "boolean" | "textarea" | "string-list";
  label: string;
  placeholder?: string;
  options?: { label: string; value: string }[];
  group: OutboundFieldGroup;
  required?: boolean;
  visible?: (item: Record<string, unknown>) => boolean;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
};

export function getOutboundSecurityOptions(protocol: string) {
  const values =
    OUTBOUND_SECURITY[protocol as keyof typeof OUTBOUND_SECURITY] || [];
  return values.map((value) => ({ label: getLabel(value), value }));
}

export function getOutboundProtocolLabel(protocol: string) {
  return (
    OUTBOUND_PROTOCOLS.find((item) => item.value === protocol)?.label ||
    protocol.toUpperCase()
  );
}

type Translate = (key: string, fallback: string) => string;

function selected(value: string, t: Translate) {
  return { label: t(value, getLabel(value)), value };
}

export function getOutboundFields(t: Translate): OutboundFieldConfig[] {
  const protocolIs =
    (...protocols: string[]) =>
    (item: Record<string, unknown>) =>
      protocols.includes(String(item.protocol || ""));
  const securityIs =
    (...values: string[]) =>
    (item: Record<string, unknown>) =>
      values.includes(String(item.security || ""));
  return [
    {
      name: "name",
      type: "text",
      label: t("name", "Name"),
      group: "basic",
      required: true,
      placeholder: t(
        "server_config.fields.outbound_name_placeholder",
        "Configuration name"
      ),
    },
    {
      name: "protocol",
      type: "select",
      label: t("protocol", "Protocol"),
      group: "basic",
      required: true,
      options: OUTBOUND_PROTOCOLS,
    },
    {
      name: "address",
      type: "text",
      label: t("address", "Address"),
      group: "basic",
      placeholder: t(
        "server_config.fields.outbound_address_placeholder",
        "Server address"
      ),
      visible: (item) =>
        !["direct", "reject"].includes(String(item.protocol || "")),
    },
    {
      name: "port",
      type: "number",
      label: t("port", "Port"),
      group: "basic",
      min: 1,
      max: 65_535,
      visible: (item) =>
        !["direct", "reject"].includes(String(item.protocol || "")),
    },
    {
      name: "user",
      type: "text",
      label: t("server_config.fields.outbound_user", "Username"),
      group: "auth",
      visible: protocolIs("http", "socks"),
    },
    {
      name: "password",
      type: "text",
      label: t(
        "server_config.fields.outbound_password_placeholder",
        "Password / secret"
      ),
      group: "auth",
      visible: protocolIs(
        "http",
        "socks",
        "shadowsocks",
        "trojan",
        "anytls",
        "hysteria2"
      ),
    },
    {
      name: "uuid",
      type: "text",
      label: "UUID",
      group: "auth",
      visible: protocolIs("vmess", "vless"),
    },
    {
      name: "cipher",
      type: "select",
      label: t("cipher", "Cipher"),
      group: "auth",
      options: [
        ...supportedShadowsocksCiphers.map((cipher) => ({
          label: cipher,
          value: cipher,
        })),
        { label: "auto", value: "auto" },
      ],
      visible: protocolIs("shadowsocks", "vmess"),
    },
    {
      name: "security",
      type: "select",
      label: t("security", "Security"),
      group: "security",
      options: [],
      visible: (item) =>
        getOutboundSecurityOptions(String(item.protocol || "")).length > 0,
    },
    {
      name: "sni",
      type: "text",
      label: t("security_sni", "SNI"),
      group: "security",
      visible: securityIs("tls", "reality"),
    },
    {
      name: "allow_insecure",
      type: "boolean",
      label: t("security_allow_insecure", "Allow Insecure"),
      group: "security",
      visible: securityIs("tls"),
    },
    {
      name: "fingerprint",
      type: "select",
      label: t("security_fingerprint", "Fingerprint"),
      group: "security",
      options: FINGERPRINTS.map((value) => selected(value, t)),
      visible: securityIs("tls", "reality"),
    },
    {
      name: "reality_public_key",
      type: "text",
      label: t("security_public_key", "Reality Public Key"),
      group: "reality",
      required: true,
      visible: securityIs("reality"),
    },
    {
      name: "reality_short_id",
      type: "text",
      label: t("security_short_id", "Reality Short ID"),
      group: "reality",
      visible: securityIs("reality"),
    },
    {
      name: "spider_x",
      type: "text",
      label: t("ordered_routing.spider_x", "REALITY spider path"),
      group: "reality",
      visible: securityIs("reality"),
    },
    {
      name: "transport",
      type: "select",
      label: t("transport", "Transport"),
      group: "transport",
      options: OUTBOUND_TRANSPORTS.map((value) => selected(value, t)),
      visible: (item) =>
        [
          "http",
          "socks",
          "shadowsocks",
          "vmess",
          "vless",
          "trojan",
          "anytls",
        ].includes(String(item.protocol || "")),
    },
    {
      name: "host",
      type: "text",
      label: t("host", "Host"),
      group: "transport",
      visible: (item) =>
        [
          "ws",
          "websocket",
          "httpupgrade",
          "xhttp",
          "splithttp",
          "grpc",
        ].includes(String(item.transport || "")),
    },
    {
      name: "path",
      type: "text",
      label: t("path", "Path"),
      group: "transport",
      visible: (item) =>
        ["ws", "websocket", "httpupgrade", "xhttp", "splithttp"].includes(
          String(item.transport || "")
        ),
    },
    {
      name: "service_name",
      type: "text",
      label: t("service_name", "Service Name"),
      group: "transport",
      visible: (item) => item.transport === "grpc",
    },
    {
      name: "xhttp_mode",
      type: "select",
      label: t("xhttp_mode", "XHTTP Mode"),
      group: "transport",
      options: XHTTP_MODES.map((value) => selected(value, t)),
      visible: (item) =>
        ["xhttp", "splithttp"].includes(String(item.transport || "")),
    },
    {
      name: "xhttp_extra",
      type: "textarea",
      label: t("xhttp_extra", "XHTTP Extra"),
      group: "transport",
      className: "col-span-2",
      placeholder: "{}",
      visible: (item) =>
        ["xhttp", "splithttp"].includes(String(item.transport || "")),
    },
    {
      name: "alpn",
      type: "string-list",
      label: t("alpn", "ALPN"),
      group: "security",
      className: "col-span-2",
      placeholder: "h2\nhttp/1.1",
      visible: securityIs("tls"),
    },
    {
      name: "flow",
      type: "select",
      label: t("flow", "Flow"),
      group: "auth",
      options: [
        selected("none", t),
        selected("xtls-rprx-vision", t),
        selected("xtls-rprx-vision-udp443", t),
      ],
      visible: (item) =>
        item.protocol === "vless" &&
        ["", "tcp", "raw"].includes(String(item.transport || "")) &&
        ["tls", "reality"].includes(String(item.security || "")),
    },
    {
      name: "settings",
      type: "textarea",
      label: t("server_config.fields.outbound_settings", "Raw settings JSON"),
      group: "protocol",
      className: "col-span-2",
      placeholder: t(
        "ordered_routing.raw_settings_placeholder",
        "Leave empty to use form fields"
      ),
    },
    {
      name: "stream_settings",
      type: "textarea",
      label: t(
        "server_config.fields.outbound_stream_settings",
        "Raw stream settings JSON"
      ),
      group: "protocol",
      className: "col-span-2",
      placeholder: "{}",
    },
  ];
}
