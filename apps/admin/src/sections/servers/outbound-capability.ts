import { parseUniqueObject } from "./json-unique";

// Mirrors ppanel-node core/outbound/capability.go, uot.go and ordered builder.
// This is a conservative UI guard, not a replacement for node/Xray validation.
export type CapabilityIssue = { code: string; field: string };
const supported = new Set([
  "freedom",
  "blackhole",
  "http",
  "socks",
  "shadowsocks",
  "trojan",
  "vmess",
  "vless",
  "anytls",
  "hysteria",
]);
const transports = new Set([
  "",
  "raw",
  "tcp",
  "ws",
  "websocket",
  "grpc",
  "httpupgrade",
  "xhttp",
  "splithttp",
  "hysteria",
]);
const fingerprints = new Set([
  "chrome",
  "firefox",
  "safari",
  "ios",
  "android",
  "edge",
  "360",
  "qq",
  "random",
  "randomized",
  "randomizednoalpn",
  "unsafe",
  "hellogolang",
  "hellorandomized",
  "hellorandomizedalpn",
  "hellorandomizednoalpn",
  "hellofirefox_120",
  "hellofirefox_148",
  "hellochrome_120",
  "hellochrome_131",
  "hellochrome_133",
  "helloios_13",
  "helloios_14",
  "helloedge_106",
  "hellosafari_26_3",
  "hello360_11_0",
  "helloqq_11_1",
  "hellofirefox_auto",
  "hellofirefox_55",
  "hellofirefox_56",
  "hellofirefox_63",
  "hellofirefox_65",
  "hellofirefox_99",
  "hellofirefox_102",
  "hellofirefox_105",
  "hellochrome_auto",
  "hellochrome_58",
  "hellochrome_62",
  "hellochrome_70",
  "hellochrome_72",
  "hellochrome_83",
  "hellochrome_87",
  "hellochrome_96",
  "hellochrome_100",
  "hellochrome_102",
  "hellochrome_106_shuffle",
  "helloios_auto",
  "helloios_11_1",
  "helloios_12_1",
  "helloandroid_11_okhttp",
  "helloedge_85",
  "helloedge_auto",
  "hellosafari_16_0",
  "hellosafari_auto",
  "hello360_auto",
  "hello360_7_5",
  "helloqq_auto",
  "hellochrome_100_psk",
  "hellochrome_112_psk_shuf",
  "hellochrome_114_padding_psk_shuf",
  "hellochrome_115_pq",
  "hellochrome_115_pq_psk",
  "hellochrome_120_pq",
]);
function validFingerprint(value: string, reality: boolean) {
  if (!value) return true; // Node selects chrome when absent.
  const name = value.toLowerCase();
  return (
    fingerprints.has(name) &&
    !(reality && ["unsafe", "hellogolang"].includes(name))
  );
}

export const supportedShadowsocksCiphers = [
  "aes-128-gcm",
  "aes-256-gcm",
  "chacha20-poly1305",
  "chacha20-ietf-poly1305",
  "xchacha20-poly1305",
  "xchacha20-ietf-poly1305",
  "aead_aes_128_gcm",
  "aead_aes_256_gcm",
  "aead_chacha20_poly1305",
  "aead_xchacha20_poly1305",
  "2022-blake3-aes-128-gcm",
  "2022-blake3-aes-256-gcm",
  "2022-blake3-chacha20-poly1305",
];
function protocolName(value: string) {
  const name = value.trim().toLowerCase();
  if (name === "direct") return "freedom";
  if (name === "reject" || name === "block") return "blackhole";
  return name === "hysteria2" ? "hysteria" : name;
}
function nonempty(value: unknown) {
  if (value == null) return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (typeof value === "object" && !Array.isArray(value))
    return Object.keys(value).length > 0;
  return true;
}
function rawHeaderUOT(
  value: unknown,
  issues: CapabilityIssue[],
  field: string
) {
  if (Array.isArray(value)) {
    for (const item of value) rawHeaderUOT(item, issues, field);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const name = key.toLowerCase().replace(/[_-]/g, "");
      if (
        ["uot", "uotversion", "udpovertcp", "udpovertcpversion"].includes(name)
      ) {
        if (child !== false && child !== 0)
          issues.push({ code: "unsupportedUOT", field });
      } else rawHeaderUOT(child, issues, field);
    }
  }
}
function rawIssues(
  value: unknown,
  inspectTransport: boolean,
  issues: CapabilityIssue[],
  field: string
) {
  if (Array.isArray(value)) {
    for (const item of value) rawIssues(item, inspectTransport, issues, field);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const name = key.toLowerCase().replace(/[_-]/g, "");
    // Stream headers are an opaque string map, not transport settings. UoT
    // still receives the node's recursive guard even inside a header map.
    if (inspectTransport && name === "headers") {
      rawHeaderUOT(child, issues, field);
      continue;
    }
    if (
      ["uot", "uotversion", "udpovertcp", "udpovertcpversion"].includes(name)
    ) {
      if (child !== false && child !== 0)
        issues.push({ code: "unsupportedUOT", field });
    } else if (["plugin", "pluginopts", "pluginoptions"].includes(name)) {
      if (nonempty(child)) issues.push({ code: "unsupportedPlugin", field });
    } else if (
      inspectTransport &&
      name === "realitysettings" &&
      child != null &&
      !rawObject(child)
    ) {
      issues.push({ code: "invalidJSON", field });
    } else if (
      inspectTransport &&
      name === "spiderx" &&
      typeof child !== "string"
    ) {
      issues.push({ code: "invalidURI", field });
    } else if (
      ["mux", "multiplex"].includes(name) &&
      child !== false &&
      child !== 0 &&
      child !== "" &&
      child !== "none" &&
      child != null
    ) {
      issues.push({ code: "unsupportedMultiplex", field });
    } else if (
      inspectTransport &&
      typeof child === "string" &&
      ((name === "spiderx" && !safeURI(child, true)) ||
        (name === "path" && !safeURI(child, false)))
    ) {
      issues.push({ code: "invalidURI", field });
    } else if (
      inspectTransport &&
      ["network", "method"].includes(name) &&
      typeof child === "string" &&
      !(
        transports.has(child.trim().toLowerCase()) ||
        ["kcp", "mkcp"].includes(child.trim().toLowerCase())
      )
    ) {
      issues.push({ code: "unsupportedTransport", field });
    }
    rawIssues(child, inspectTransport, issues, field);
  }
}
function safeURI(value: string, spider: boolean) {
  if (!value) return true;
  if (
    value !== value.trim() ||
    /%(?![\da-f]{2})/i.test(value) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value) ||
    /\p{Cc}/u.test(value)
  )
    return false;
  if (
    spider &&
    (!value.startsWith("/") || value.startsWith("//") || value.includes("#"))
  )
    return false;
  try {
    decodeURI(value);
    if (!spider) return true;
    if (
      new TextEncoder().encode(value).length > 4096 ||
      (value.split("?")[1] || "").includes(";")
    )
      return false;
    const query = new URL(value, "https://example.invalid").searchParams;
    const keys = [...query.keys()];
    if (keys.length > 32 || new Set(keys).size !== keys.length) return false;
    const limits: Record<string, number> = {
      p: 4096,
      c: 8,
      t: 16,
      i: 30_000,
      r: 5000,
    };
    const maximums: Record<string, number> = {};
    for (const [key, entry] of query) {
      if (
        new TextEncoder().encode(key).length > 128 ||
        new TextEncoder().encode(entry).length > 1024 ||
        /\p{Cc}/u.test(key + entry)
      )
        return false;
      const lower = key.toLowerCase();
      if (!(lower in limits)) continue;
      if (key !== lower || !/^\d+(?:-\d+)?$/.test(entry)) return false;
      const rawParts = entry.split("-");
      if (rawParts.some((part) => part.length > 20)) return false;
      const parts = rawParts.map(Number);
      if (
        parts.some(
          (part) => !Number.isSafeInteger(part) || part > limits[lower]!
        ) ||
        (parts.length === 2 && parts[0]! > parts[1]!)
      )
        return false;
      maximums[lower] = parts.at(-1)!;
    }
    return (maximums.c || 0) * (maximums.t || 0) <= 64;
  } catch {
    return false;
  }
}
function rawValue(value: Record<string, unknown>, key: string): unknown {
  return Object.entries(value).find(
    ([name]) => name.toLowerCase() === key.toLowerCase()
  )?.[1];
}
function rawObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
const xhttpModes = ["", "auto", "packet-up", "stream-up", "stream-one"];
const xhttpSplitFields = new Set(
  "host path mode headers xpaddingbytes xpaddingobfsmode xpaddingkey xpaddingheader xpaddingplacement xpaddingmethod uplinkhttpmethod sessionidplacement sessionidkey sessionidtable sessionidlength seqplacement seqkey uplinkdataplacement uplinkdatakey uplinkchunksize nogrpcheader nosseheader scmaxeachpostbytes scminpostsintervalms scmaxbufferedposts scstreamupserversecs servermaxheaderbytes xmux downloadsettings extra".split(
    " "
  )
);
const xhttpStreamFields = new Set(
  "address port method network security xhttpsettings splithttpsettings wssettings httpupgradesettings tcpsettings rawsettings grpcsettings tlssettings realitysettings sockopt finalmask kcpsettings hysteriasettings".split(
    " "
  )
);
function nonemptyObject(value: unknown) {
  return (
    value != null &&
    (!rawObject(value) || Object.keys(rawObject(value)!).length > 0)
  );
}
function xhttpRange(value: unknown): [number, number] | undefined {
  if (value == null || value === "") return [0, 0];
  if (typeof value === "number")
    return Number.isInteger(value) && value >= 0 && value <= 2_147_483_647
      ? [value, value]
      : undefined;
  if (typeof value !== "string" || !/^\+?\d+(?:-\+?\d+)?$/.test(value)) return;
  const values = value.split("-").map(Number);
  if (
    values.some((part) => !Number.isSafeInteger(part) || part > 2_147_483_647)
  )
    return;
  return [Math.min(...values), Math.max(...values)];
}
function validateXhttpExtraShape(
  split: Record<string, unknown>,
  mode: string
): boolean {
  const enumFields: Record<string, string[]> = {
    xPaddingPlacement: ["", "cookie", "header", "query", "queryInHeader"],
    xPaddingMethod: ["", "repeat-x", "tokenish"],
    sessionIDPlacement: ["", "path", "cookie", "header", "query"],
    seqPlacement: ["", "path", "cookie", "header", "query"],
  };
  for (const [key, allowed] of Object.entries(enumFields)) {
    const value = rawValue(split, key);
    if (
      value != null &&
      (typeof value !== "string" || !allowed.includes(value))
    )
      return false;
  }
  for (const key of [
    "host",
    "path",
    "xPaddingKey",
    "xPaddingHeader",
    "uplinkHTTPMethod",
    "sessionIDKey",
    "sessionIDTable",
    "seqKey",
    "uplinkDataKey",
  ]) {
    const value = rawValue(split, key);
    if (value != null && typeof value !== "string") return false;
  }
  for (const key of ["xPaddingObfsMode", "noGRPCHeader", "noSSEHeader"]) {
    const value = rawValue(split, key);
    if (value != null && typeof value !== "boolean") return false;
  }
  const ranges: Record<string, [number, number]> = {};
  for (const key of [
    "xPaddingBytes",
    "sessionIDLength",
    "uplinkChunkSize",
    "scMaxEachPostBytes",
    "scMinPostsIntervalMs",
    "scStreamUpServerSecs",
  ]) {
    const parsed = xhttpRange(rawValue(split, key));
    if (!parsed) return false;
    ranges[key] = parsed;
  }
  const padding = ranges.xPaddingBytes!;
  if (
    (padding[0] !== 0 || padding[1] !== 0) &&
    (padding[0] <= 0 || padding[1] <= 0)
  )
    return false;
  for (const key of ["scMaxBufferedPosts", "serverMaxHeaderBytes"]) {
    const value = rawValue(split, key);
    if (
      value != null &&
      (typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < 0 ||
        (key === "serverMaxHeaderBytes" && value > 2_147_483_647))
    )
      return false;
  }
  const xmuxValue = rawValue(split, "xmux");
  if (xmuxValue != null) {
    const xmux = rawObject(xmuxValue);
    const names = [
      "maxConcurrency",
      "maxConnections",
      "cMaxReuseTimes",
      "hMaxRequestTimes",
      "hMaxReusableSecs",
      "hKeepAlivePeriod",
    ];
    if (
      !xmux ||
      Object.keys(xmux).some(
        (key) => !names.some((name) => name.toLowerCase() === key.toLowerCase())
      )
    )
      return false;
    for (const name of names.slice(0, -1))
      if (!xhttpRange(rawValue(xmux, name))) return false;
    const keepalive = rawValue(xmux, "hKeepAlivePeriod");
    if (
      keepalive != null &&
      (typeof keepalive !== "number" ||
        !Number.isSafeInteger(keepalive) ||
        keepalive < 0)
    )
      return false;
    if (
      xhttpRange(rawValue(xmux, "maxConcurrency"))![1] > 0 &&
      xhttpRange(rawValue(xmux, "maxConnections"))![1] > 0
    )
      return false;
  }
  const placement = rawValue(split, "uplinkDataPlacement");
  if (
    placement != null &&
    (typeof placement !== "string" ||
      !["", "auto", "body", "cookie", "header"].includes(placement) ||
      (["cookie", "header"].includes(placement) && mode !== "packet-up"))
  )
    return false;
  const method = rawValue(split, "uplinkHTTPMethod");
  if (
    typeof method === "string" &&
    method.toUpperCase() === "GET" &&
    mode !== "packet-up"
  )
    return false;
  const tableValue = rawValue(split, "sessionIDTable");
  if (typeof tableValue === "string" && tableValue) {
    const aliases: Record<string, number> = {
      ALPHABET: 26,
      alphabet: 26,
      Alphabet: 52,
      BASE36: 36,
      base36: 36,
      Base62: 62,
      HEX: 16,
      hex: 16,
      number: 10,
    };
    const base = aliases[tableValue] ?? tableValue.length;
    const [min, max] = ranges.sessionIDLength!;
    if (
      min <= 0 ||
      max > 128 ||
      [...tableValue].some((char) => char.codePointAt(0)! > 127)
    )
      return false;
    let room = 0n;
    for (let i = min; i <= max && room < 2_147_483_648n; i += 1)
      room += BigInt(base) ** BigInt(i);
    if (room < 2_147_483_648n) return false;
  }
  return true;
}
function validateRawSplit(
  value: unknown,
  issues: CapabilityIssue[],
  field: string,
  depth = 0,
  strictExtra = false,
  parentMode = ""
) {
  if (value == null) return;
  const split = rawObject(value);
  if (!split || depth > 32) {
    issues.push({ code: "invalidJSON", field });
    return;
  }
  const add = (code: string) => issues.push({ code, field });
  const mode = rawValue(split, "mode");
  if (mode != null && (typeof mode !== "string" || !xhttpModes.includes(mode)))
    add("invalidXHTTPMode");
  const effectiveMode = parentMode || "auto";
  const download = rawValue(split, "downloadSettings");
  if (strictExtra) {
    if (
      Object.keys(split).some((key) => !xhttpSplitFields.has(key.toLowerCase()))
    )
      add("unsupportedXHTTPSettings");
    const headers = rawValue(split, "headers");
    if (
      headers != null &&
      (!rawObject(headers) ||
        Object.entries(rawObject(headers)!).some(
          ([key, value]) =>
            key.toLowerCase() === "host" || typeof value !== "string"
        ))
    )
      add("unsupportedXHTTPSettings");
    if (!validateXhttpExtraShape(split, effectiveMode))
      add("unsupportedXHTTPSettings");
    if (download != null && effectiveMode === "stream-one")
      add("unsupportedXHTTPSettings");
  }
  if (download != null) {
    if (strictExtra) {
      const stream = rawObject(download);
      if (
        !stream ||
        Object.keys(stream).some(
          (key) => !xhttpStreamFields.has(key.toLowerCase())
        )
      )
        add("unsupportedXHTTPSettings");
      if (stream) {
        const address = rawValue(stream, "address");
        const port = rawValue(stream, "port");
        if (address != null && typeof address !== "string")
          add("unsupportedXHTTPSettings");
        if (
          port != null &&
          (typeof port !== "number" ||
            !Number.isInteger(port) ||
            port < 0 ||
            port > 65_535)
        )
          add("unsupportedXHTTPSettings");
        for (const name of ["wsSettings", "httpupgradeSettings"]) {
          const setting = rawValue(stream, name);
          if (setting == null) continue;
          const object = rawObject(setting);
          if (
            !object ||
            Object.keys(object).some(
              (key) =>
                ![
                  "host",
                  "path",
                  "headers",
                  "acceptproxyprotocol",
                  "heartbeatperiod",
                ].includes(key.toLowerCase())
            )
          ) {
            add("unsupportedXHTTPSettings");
            continue;
          }
          for (const key of ["host", "path"]) {
            const value = rawValue(object, key);
            if (value != null && typeof value !== "string")
              add("unsupportedXHTTPSettings");
          }
          const headers = rawValue(object, "headers");
          if (
            headers != null &&
            (!rawObject(headers) ||
              Object.entries(rawObject(headers)!).some(
                ([key, value]) =>
                  typeof value !== "string" ||
                  (name === "httpupgradeSettings" &&
                    key.toLowerCase() === "host")
              ))
          )
            add("unsupportedXHTTPSettings");
          const accept = rawValue(object, "acceptProxyProtocol");
          if (accept != null && typeof accept !== "boolean")
            add("unsupportedXHTTPSettings");
          const period = rawValue(object, "heartbeatPeriod");
          if (
            period != null &&
            (typeof period !== "number" ||
              !Number.isInteger(period) ||
              period < 0 ||
              period > 4_294_967_295)
          )
            add("unsupportedXHTTPSettings");
        }
        const sec = rawValue(stream, "security");
        if (typeof sec === "string" && sec.toLowerCase() === "reality")
          add("unsupportedXHTTPSettings");
        for (const transport of [
          rawValue(stream, "network"),
          rawValue(stream, "method"),
        ])
          if (
            typeof transport === "string" &&
            ![
              "",
              "tcp",
              "raw",
              "ws",
              "websocket",
              "grpc",
              "httpupgrade",
              "xhttp",
              "splithttp",
            ].includes(transport.toLowerCase())
          )
            add("unsupportedXHTTPSettings");
        for (const name of [
          "tcpSettings",
          "rawSettings",
          "grpcSettings",
          "tlsSettings",
          "sockopt",
          "finalmask",
          "kcpSettings",
          "hysteriaSettings",
        ])
          if (nonemptyObject(rawValue(stream, name)))
            add("unsupportedXHTTPSettings");
      }
    }
    validateRawStream(download, issues, field, depth + 1, strictExtra);
  }
  const extra = rawValue(split, "extra");
  if (extra != null)
    validateRawSplit(extra, issues, field, depth + 1, strictExtra, parentMode);
}
function validateRawStream(
  value: unknown,
  issues: CapabilityIssue[],
  field: string,
  depth = 0,
  strictExtra = false
) {
  const stream = rawObject(value);
  if (!stream || depth > 32) {
    issues.push({ code: "invalidJSON", field });
    return;
  }
  const add = (code: string) => issues.push({ code, field });
  const network = rawValue(stream, "network");
  const method = rawValue(stream, "method");
  for (const transport of [network, method]) {
    if (
      transport != null &&
      (typeof transport !== "string" ||
        !(
          transports.has(transport.toLowerCase()) ||
          ["kcp", "mkcp"].includes(transport.toLowerCase())
        ))
    )
      add("unsupportedTransport");
  }
  const activeTransport =
    typeof method === "string"
      ? method.toLowerCase()
      : typeof network === "string"
        ? network.toLowerCase()
        : "tcp";
  const rawSecurity = rawValue(stream, "security");
  if (
    rawSecurity !== undefined &&
    (typeof rawSecurity !== "string" ||
      !["", "none", "tls", "reality"].includes(rawSecurity.toLowerCase())) &&
    !issues.some(
      (issue) => issue.field === field && issue.code === "unsupportedSecurity"
    )
  )
    add("unsupportedSecurity");
  const security =
    typeof rawSecurity === "string" ? rawSecurity.toLowerCase() : "";
  for (const name of ["tlsSettings", "realitySettings"]) {
    const value = rawValue(stream, name);
    if (value != null && !rawObject(value)) add("invalidJSON");
  }
  const tls = rawObject(rawValue(stream, "tlsSettings"));
  const tlsFingerprint = tls && rawValue(tls, "fingerprint");
  const insecure = tls && rawValue(tls, "allowInsecure");
  if (tlsFingerprint != null && typeof tlsFingerprint !== "string")
    add("invalidJSON");
  if (insecure != null && typeof insecure !== "boolean") add("invalidJSON");
  if (security === "tls") {
    if (
      typeof tlsFingerprint === "string" &&
      !validFingerprint(tlsFingerprint, false)
    )
      add("invalidFingerprint");
    if (insecure === true) add("unsupportedSecurity");
  }
  if (security === "reality") {
    if (!["tcp", "raw", "grpc", "xhttp", "splithttp"].includes(activeTransport))
      add("unsupportedRealityTransport");
    const reality = rawObject(rawValue(stream, "realitySettings"));
    const password = reality && rawValue(reality, "password");
    const publicKey = reality && rawValue(reality, "publicKey");
    const key = password || publicKey;
    if (typeof key !== "string" || !validRealityKey(key))
      add("invalidRealityKey");
    const short = reality && rawValue(reality, "shortId");
    if (
      short != null &&
      (typeof short !== "string" || !/^(?:[a-f\d]{2}){0,8}$/i.test(short))
    )
      add("invalidRealityShortId");
    const fingerprint = reality && rawValue(reality, "fingerprint");
    if (
      fingerprint != null &&
      (typeof fingerprint !== "string" || !validFingerprint(fingerprint, true))
    )
      add("invalidFingerprint");
  }
  for (const name of ["xhttpSettings", "splithttpSettings"]) {
    const split = rawValue(stream, name);
    if (split != null) {
      const nested = rawObject(split);
      const mode = nested && rawValue(nested, "mode");
      validateRawSplit(
        split,
        issues,
        field,
        depth + 1,
        strictExtra,
        typeof mode === "string" ? mode : ""
      );
    }
  }
}

function validIdentity(value: string) {
  const bytes = new TextEncoder().encode(value).length;
  if (bytes > 0 && bytes <= 30) return true; // Xray also accepts short user IDs.
  return (
    /^[0-9a-f]{32}$/i.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}
function validVlessEncryption(value: unknown) {
  if (value === "none") return true;
  if (typeof value !== "string") return false;
  const parts = value.split(".");
  if (
    parts.length < 4 ||
    parts[0] !== "mlkem768x25519plus" ||
    !["native", "xorpub", "random"].includes(parts[1] || "") ||
    !["1rtt", "0rtt"].includes(parts[2] || "")
  )
    return false;
  return parts.slice(3).every((part) => {
    if (new TextEncoder().encode(part).length < 20) return true;
    if (!/^[A-Za-z0-9_-]+$/.test(part)) return false;
    try {
      const bytes = atob(
        part.replace(/-/g, "+").replace(/_/g, "/") +
          "=".repeat((4 - (part.length % 4)) % 4)
      );
      return bytes.length === 32 || bytes.length === 1184;
    } catch {
      return false;
    }
  });
}
function optionalRawString(value: unknown) {
  return value == null || typeof value === "string";
}
function rawEndpoint(value: Record<string, unknown>, listName: string) {
  // Xray's simplified address, when present, replaces the legacy endpoint list.
  if (rawValue(value, "address") != null) return value;
  const list = rawValue(value, listName);
  return Array.isArray(list) && list.length === 1
    ? rawObject(list[0])
    : undefined;
}
function hasRawEndpoint(value: Record<string, unknown> | undefined) {
  if (!value) return false;
  const address = rawValue(value, "address");
  const port = rawValue(value, "port");
  return (
    typeof address === "string" &&
    Boolean(address.trim()) &&
    typeof port === "number" &&
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65_535
  );
}
/** Raw settings replace projected connection fields; never fill missing fields from them. */
function validRawSettings(protocol: string, value: Record<string, unknown>) {
  if (["freedom", "blackhole"].includes(protocol)) return true;
  if (["http", "socks", "trojan", "shadowsocks"].includes(protocol)) {
    const endpoint = rawEndpoint(value, "servers");
    if (!hasRawEndpoint(endpoint)) return false;
    if (protocol === "http" || protocol === "socks") {
      if (
        !(
          optionalRawString(rawValue(value, "user")) &&
          optionalRawString(rawValue(value, "pass"))
        )
      )
        return false;
      if (endpoint !== value) {
        const users = rawValue(endpoint!, "users");
        if (
          users != null &&
          (!Array.isArray(users) ||
            users.length > 1 ||
            users.some(
              (entry) =>
                !(
                  rawObject(entry) &&
                  optionalRawString(rawValue(entry, "user")) &&
                  optionalRawString(rawValue(entry, "pass"))
                )
            ))
        )
          return false;
      }
      return true;
    }
    const password = rawValue(endpoint!, "password");
    if (typeof password !== "string" || !password) return false;
    if (protocol === "trojan")
      return (rawValue(endpoint!, "flow") ?? "") === "";
    const method = rawValue(endpoint!, "method");
    if (
      typeof method !== "string" ||
      !supportedShadowsocksCiphers.includes(method.toLowerCase())
    )
      return false;
    if (method.toLowerCase().startsWith("2022-"))
      return (
        method === method.toLowerCase() &&
        validShadowsocks2022Key(method, password)
      );
    return true;
  }
  if (protocol === "vmess" || protocol === "vless") {
    const endpoint = rawEndpoint(value, "vnext");
    if (!hasRawEndpoint(endpoint)) return false;
    let account = value;
    if (endpoint !== value) {
      const users = rawValue(endpoint!, "users");
      if (!Array.isArray(users) || users.length !== 1 || !rawObject(users[0]))
        return false;
      account = rawObject(users[0])!;
    }
    const id = rawValue(account, "id");
    if (typeof id !== "string" || !validIdentity(id)) return false;
    if (protocol === "vmess")
      return optionalRawString(rawValue(account, "security"));
    const flow = rawValue(account, "flow") ?? "";
    return (
      typeof flow === "string" &&
      ["", "xtls-rprx-vision", "xtls-rprx-vision-udp443"].includes(flow) &&
      validVlessEncryption(rawValue(account, "encryption"))
    );
  }
  if (protocol === "anytls") {
    const password = rawValue(value, "password");
    const idle = rawValue(value, "minIdleSession");
    return (
      hasRawEndpoint(value) &&
      typeof password === "string" &&
      Boolean(password) &&
      (idle == null ||
        (typeof idle === "number" && Number.isSafeInteger(idle) && idle >= 0))
    );
  }
  if (protocol === "hysteria")
    return hasRawEndpoint(value) && rawValue(value, "version") === 2;
  return true; // Unsupported protocols are reported separately.
}
function validShadowsocks2022Key(cipher: string, password: string) {
  const keys = password.split(":");
  if (cipher === "2022-blake3-chacha20-poly1305" && keys.length !== 1)
    return false;
  const minimum = cipher === "2022-blake3-aes-128-gcm" ? 16 : 32;
  try {
    return keys.every(
      (key) =>
        /^[A-Za-z0-9+/]*={0,2}$/.test(key) &&
        key.length % 4 === 0 &&
        atob(key).length >= minimum &&
        btoa(atob(key)) === key
    );
  } catch {
    return false;
  }
}
function validRealityKey(value: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  try {
    return (
      atob(`${value.replace(/-/g, "+").replace(/_/g, "/")}=`).length === 32
    );
  } catch {
    return false;
  }
}
export function validateOutboundCapability(
  item: API.NodeRoutingOutbound
): CapabilityIssue[] {
  const issues: CapabilityIssue[] = [];
  const add = (code: string, field: string) => issues.push({ code, field });
  const protocol = protocolName(item.protocol);
  const transport = (item.transport || "").trim().toLowerCase();
  const security = (item.security || "").trim().toLowerCase();
  const rawSettings =
    typeof item.settings === "string" && Boolean(item.settings.trim());
  const rawStream =
    typeof item.stream_settings === "string" &&
    Boolean(item.stream_settings.trim());
  let stream: Record<string, unknown> | undefined;
  if (!supported.has(protocol)) add("unsupportedConnection", "protocol");
  if (item.uot || (item.uot_version ?? 0) !== 0) add("unsupportedUOT", "uot");
  if (item.multiplex?.trim() && item.multiplex !== "none")
    add("unsupportedMultiplex", "multiplex");
  if (item.plugin?.trim() || nonempty(item.plugin_opts))
    add("unsupportedPlugin", "plugin");
  if (
    !rawSettings &&
    ((item.encryption && item.encryption !== "none") ||
      item.encryption_mode ||
      item.encryption_rtt ||
      item.encryption_ticket ||
      item.encryption_client_padding ||
      item.encryption_password)
  )
    add("unsupportedEncryption", "encryption");
  for (const field of ["settings", "stream_settings", "xhttp_extra"] as const) {
    const raw = item[field];
    if (typeof raw !== "string" || !raw.trim()) continue;
    const value = parseUniqueObject(raw);
    if (!value) {
      add("invalidJSON", field);
      continue;
    }
    rawIssues(value, field !== "settings", issues, field);
    if (field === "settings" && !validRawSettings(protocol, value))
      add("invalidRawSettings", "settings");
    if (field === "stream_settings") {
      stream = value;
      validateRawStream(value, issues, field);
    } else if (field === "xhttp_extra")
      validateRawSplit(value, issues, field, 0, true, item.xhttp_mode || "");
  }
  if (
    !(
      transports.has(transport) ||
      (rawStream && ["kcp", "mkcp"].includes(transport))
    )
  )
    add("unsupportedTransport", "transport");
  const activeTransport = rawStream
    ? String(
        (stream && rawValue(stream, "method")) ||
          (stream && rawValue(stream, "network")) ||
          "tcp"
      ).toLowerCase()
    : transport || (protocol === "hysteria" ? "hysteria" : "tcp");
  if (protocol === "hysteria" && activeTransport !== "hysteria")
    add("unsupportedTransport", rawStream ? "stream_settings" : "transport");
  if (protocol !== "hysteria" && activeTransport === "hysteria")
    add("unsupportedTransport", rawStream ? "stream_settings" : "transport");
  if (!["", "none", "tls", "reality"].includes(security))
    add("unsupportedSecurity", "security");
  if (
    !["", "auto", "packet-up", "stream-up", "stream-one"].includes(
      item.xhttp_mode || ""
    )
  )
    add("invalidXHTTPMode", "xhttp_mode");
  const activeSecurity = rawStream
    ? String((stream && rawValue(stream, "security")) || "").toLowerCase()
    : security;
  if (protocol === "hysteria" && activeSecurity !== "tls")
    add("requiresTLS", rawStream ? "stream_settings" : "security");
  if (protocol === "anytls" && !["tls", "reality"].includes(activeSecurity))
    add("requiresTLS", rawStream ? "stream_settings" : "security");
  if (!rawStream && security === "reality") {
    if (!["", "raw", "tcp", "grpc", "xhttp", "splithttp"].includes(transport))
      add("unsupportedRealityTransport", "transport");
    if (!validRealityKey((item.reality_public_key || "").trim()))
      add("invalidRealityKey", "reality_public_key");
    if (!validFingerprint((item.fingerprint || "").trim(), true))
      add("invalidFingerprint", "fingerprint");
    if (!/^(?:[a-f\d]{2}){0,8}$/i.test((item.reality_short_id || "").trim()))
      add("invalidRealityShortId", "reality_short_id");
  }
  if (
    !rawStream &&
    security === "tls" &&
    !validFingerprint((item.fingerprint || "").trim(), false)
  )
    add("invalidFingerprint", "fingerprint");
  if (!rawStream && security === "tls" && item.allow_insecure)
    add("unsupportedSecurity", "allow_insecure");
  if (!safeURI(item.path || "", false)) add("invalidURI", "path");
  if (typeof item.spider_x === "string" && !safeURI(item.spider_x, true))
    add("invalidURI", "spider_x");
  if (
    !rawSettings &&
    supported.has(protocol) &&
    !["freedom", "blackhole"].includes(protocol)
  ) {
    if (!item.address.trim()) add("requiredAddress", "address");
    if (!Number.isInteger(item.port) || item.port < 1 || item.port > 65_535)
      add("requiredPort", "port");
    if (
      ["vmess", "vless"].includes(protocol) &&
      !validIdentity(item.uuid?.trim() || item.password?.trim() || "")
    )
      add("requiredUUID", "uuid");
    if (
      ["trojan", "shadowsocks", "anytls"].includes(protocol) &&
      !item.password
    )
      add("requiredPassword", "password");
    if (protocol === "hysteria" && !item.password?.trim() && !item.uuid?.trim())
      add("requiredPassword", "password");
    if (
      protocol === "shadowsocks" &&
      item.cipher &&
      !supportedShadowsocksCiphers.includes(item.cipher.toLowerCase())
    )
      add("unsupportedCipher", "cipher");
    if (
      protocol === "shadowsocks" &&
      item.cipher?.startsWith("2022-") &&
      item.password &&
      !validShadowsocks2022Key(item.cipher.toLowerCase(), item.password)
    )
      add("invalidShadowsocksKey", "password");
    if (
      protocol === "vmess" &&
      item.cipher &&
      !["auto", "aes-128-gcm", "chacha20-poly1305"].includes(
        item.cipher.toLowerCase()
      )
    )
      add("unsupportedCipher", "cipher");
  }
  if (!rawSettings && item.flow && item.flow !== "none") {
    const streamTransport = rawStream ? activeTransport : transport;
    const streamSecurity = rawStream ? activeSecurity : security;
    if (
      protocol !== "vless" ||
      !["xtls-rprx-vision", "xtls-rprx-vision-udp443"].includes(item.flow) ||
      !["", "tcp", "raw"].includes(streamTransport) ||
      !["tls", "reality"].includes(streamSecurity)
    )
      add("unsupportedFlow", "flow");
  }
  if (!rawStream && item.alpn?.length && security !== "tls")
    add("alpnRequiresTLS", "alpn");
  if (
    !rawStream &&
    (item.xhttp_mode || item.xhttp_extra) &&
    !["xhttp", "splithttp"].includes(transport)
  )
    add("xhttpRequiresTransport", "transport");
  return issues;
}
