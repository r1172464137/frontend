import { z } from "zod";

export type RouteRuleKind = "domain" | "ip" | "protocol";

export type RouteRuleIssueCode =
  | "domainIpCategory"
  | "controlCharacter"
  | "domainProtocolCategory"
  | "emptyGeosite"
  | "invalidDomain"
  | "invalidGeoip"
  | "invalidIp"
  | "invalidRegex"
  | "ipDomainCategory"
  | "regexBackreference"
  | "regexLookaround"
  | "ruleTooLong"
  | "tooManyRules"
  | "unknownPrefix"
  | "unsupportedProtocol";

export type RouteRuleIssue = {
  code: RouteRuleIssueCode;
  index: number;
  line: number;
  value: string;
};

export const MAX_ROUTE_RULES = 1024;
export const MAX_ROUTE_RULE_BYTES = 4096;

const DOMAIN_PREFIXES = new Set([
  "domain",
  "full",
  "keyword",
  "suffix",
  "regex",
  "regexp",
  "geosite",
]);
const GEOSITE_LABEL = /^[A-Za-z0-9][A-Za-z0-9_.!-]*(?:@[A-Za-z0-9_!-]+)*$/;
const GEOIP_LABEL = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const IPV4_CANDIDATE = /^\d{1,3}(?:\.\d{1,3}){3}(?:\/\d+)?$/;
const IPV6_CANDIDATE = /^[0-9A-Fa-f:.]+(?:\/\d+)?$/;
const utf8Encoder = new TextEncoder();

const ipv4Schema = z.ipv4();
const ipv6Schema = z.ipv6();
const cidrv4Schema = z.cidrv4();
const cidrv6Schema = z.cidrv6();

export function utf8ByteLength(value: string) {
  return utf8Encoder.encode(value).byteLength;
}

export function serializedJSONByteLength(value: unknown) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return 0;
  // Go encoding/json uses EscapeHTML by default and always escapes the two
  // JavaScript line-separator runes. Mirror those expansions for persistence
  // limits instead of measuring browser JSON.stringify output directly.
  const goEncoded = serialized.replace(/[<>&\u2028\u2029]/g, (character) => {
    const escaped = character.codePointAt(0)!.toString(16).padStart(4, "0");
    return `\\u${escaped}`;
  });
  return utf8ByteLength(goEncoded);
}

export function normalizeRuleLines(value: string | string[] | undefined) {
  const values = typeof value === "string" ? value.split("\n") : value || [];
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function isValidIP(value: string) {
  return (
    ipv4Schema.safeParse(value).success || ipv6Schema.safeParse(value).success
  );
}

function isValidCIDR(value: string) {
  return (
    cidrv4Schema.safeParse(value).success ||
    cidrv6Schema.safeParse(value).success
  );
}

export function isValidIPOrCIDR(value: string) {
  return isValidIP(value) || isValidCIDR(value);
}

function looksLikeIPOrCIDR(value: string) {
  return (
    isValidIPOrCIDR(value) ||
    IPV4_CANDIDATE.test(value) ||
    (value.includes(":") && IPV6_CANDIDATE.test(value))
  );
}

function domainWithoutRootDot(value: string) {
  return value.endsWith(".") ? value.slice(0, -1) : value;
}

export function validDomainValue(value: string) {
  if (!value || /[\s/:#]/.test(value)) return false;
  const name = domainWithoutRootDot(value);
  return (
    Boolean(name) &&
    utf8ByteLength(name) <= 253 &&
    name.split(".").every((label) => DOMAIN_LABEL.test(label))
  );
}

function validateRegex(value: string): RouteRuleIssueCode | undefined {
  if (!value) return "invalidRegex";

  let inClass = false;
  let inQuotedLiteral = false;
  let parentheses = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];

    if (inQuotedLiteral) {
      if (character === "\\" && next === "E") {
        inQuotedLiteral = false;
        index += 1;
      }
      continue;
    }
    if (character === "\\") {
      if (next === undefined) return "invalidRegex";
      if (next === "Q" && !inClass) {
        inQuotedLiteral = true;
        index += 1;
        continue;
      }
      if (!inClass && next && /[1-9]/.test(next)) {
        const following = value[index + 2];
        // Go RE2 supports three-digit octal escapes such as \\123. A lone
        // non-zero numeric escape is the safely recognizable backreference
        // form that the browser can reject without second-guessing RE2.
        if (!(following && /\d/.test(following))) return "regexBackreference";
      }
      if (
        !inClass &&
        (next === "k" || next === "g") &&
        /[<{'\d]/.test(value[index + 2] || "")
      ) {
        return "regexBackreference";
      }
      index += 1;
      continue;
    }
    if (character === "[") {
      if (inClass && next === ":") {
        const end = value.indexOf(":]", index + 2);
        if (end < 0) return "invalidRegex";
        index = end + 1;
      } else if (!inClass) inClass = true;
      continue;
    }
    if (character === "]" && inClass) {
      inClass = false;
      continue;
    }
    if (!inClass && character === "(") {
      if (
        next === "?" &&
        (value[index + 2] === "=" ||
          value[index + 2] === "!" ||
          (value[index + 2] === "<" &&
            (value[index + 3] === "=" || value[index + 3] === "!")))
      )
        return "regexLookaround";
      parentheses += 1;
    } else if (!inClass && character === ")") {
      if (parentheses === 0) return "invalidRegex";
      parentheses -= 1;
    }
  }
  if (inClass || parentheses !== 0) return "invalidRegex";
  // Check common syntax without rejecting RE2-only flags, POSIX classes,
  // quoted literals or Unicode/hex escapes that JavaScript parses differently.
  if (!/\\[QE1-9]|\\[pP]\{|\\x\{|\(\?[imsU-]|\(\?P<|\[\[:/.test(value)) {
    try {
      new RegExp(value);
    } catch {
      return "invalidRegex";
    }
  }

  // JavaScript and Go RE2 grammars differ. The backend is authoritative for
  // all syntax beyond the common incompatibilities recognized above.
}

function prefixOf(value: string) {
  const colon = value.indexOf(":");
  return colon < 0 ? undefined : value.slice(0, colon);
}

export function validateDomainRule(
  value: string
): RouteRuleIssueCode | undefined {
  if (value.toLowerCase().startsWith("geoip:")) return "domainIpCategory";
  if (looksLikeIPOrCIDR(value)) return "domainIpCategory";
  if (domainWithoutRootDot(value).toLowerCase() === "bittorrent") {
    return "domainProtocolCategory";
  }

  const prefix = prefixOf(value);
  if (!prefix) {
    if (value.includes("/")) return "domainIpCategory";
    return validDomainValue(value) ? undefined : "invalidDomain";
  }
  const normalizedPrefix = prefix.toLowerCase();
  if (!DOMAIN_PREFIXES.has(normalizedPrefix)) return "unknownPrefix";

  const body = value.slice(prefix.length + 1);
  if (normalizedPrefix === "regex" || normalizedPrefix === "regexp") {
    return validateRegex(body);
  }
  if (normalizedPrefix === "geosite") {
    return GEOSITE_LABEL.test(body) && utf8ByteLength(body) <= 253
      ? undefined
      : "emptyGeosite";
  }
  if (normalizedPrefix === "keyword") {
    return body && !/[\s\p{Cc}]/u.test(body) ? undefined : "invalidDomain";
  }
  if (looksLikeIPOrCIDR(body) || body.includes("/")) {
    return "domainIpCategory";
  }
  if (domainWithoutRootDot(body).toLowerCase() === "bittorrent") {
    return "domainProtocolCategory";
  }
  return validDomainValue(body) ? undefined : "invalidDomain";
}

export function validateIPRule(value: string): RouteRuleIssueCode | undefined {
  const lowerValue = value.toLowerCase();
  if (lowerValue.startsWith("geosite:")) return "ipDomainCategory";
  if (lowerValue.startsWith("geoip:")) {
    const label = value.slice("geoip:".length);
    return GEOIP_LABEL.test(label) && utf8ByteLength(label) <= 253
      ? undefined
      : "invalidGeoip";
  }
  if (isValidIPOrCIDR(value)) return;

  const prefix = prefixOf(value);
  if (prefix && !value.includes("::") && !IPV4_CANDIDATE.test(value)) {
    if (DOMAIN_PREFIXES.has(prefix.toLowerCase())) return "ipDomainCategory";
    if (!/^\d/.test(prefix)) return "unknownPrefix";
  }
  return "invalidIp";
}

export function validateProtocolRule(
  value: string
): RouteRuleIssueCode | undefined {
  return value.toLowerCase() === "bittorrent"
    ? undefined
    : "unsupportedProtocol";
}

function parseIPv4Words(value: string) {
  return value.split(".").map(Number);
}

function canonicalIPv4(value: string, prefixLength?: number) {
  const words = parseIPv4Words(value);
  if (prefixLength !== undefined) {
    let numeric = words.reduce((result, word) => result * 256 + word, 0);
    const blockSize = 2 ** (32 - prefixLength);
    numeric = Math.floor(numeric / blockSize) * blockSize;
    return [16_777_216, 65_536, 256, 1]
      .map((divisor) => Math.floor(numeric / divisor) % 256)
      .join(".");
  }
  return words.join(".");
}

function parseIPv6Words(value: string) {
  let expanded = value.toLowerCase();
  const ipv4Tail = expanded.match(/(?:^|:)(\d+(?:\.\d+){3})$/)?.[1];
  if (ipv4Tail) {
    const ipv4 = parseIPv4Words(ipv4Tail);
    const high = (ipv4[0]! * 256 + ipv4[1]!).toString(16);
    const low = (ipv4[2]! * 256 + ipv4[3]!).toString(16);
    expanded = `${expanded.slice(0, -ipv4Tail.length)}${high}:${low}`;
  }

  const [leftText, rightText] = expanded.split("::");
  const left = leftText ? leftText.split(":").filter(Boolean) : [];
  const right = rightText ? rightText.split(":").filter(Boolean) : [];
  const zeroCount = 8 - left.length - right.length;
  return [
    ...left.map((word) => Number.parseInt(word, 16)),
    ...Array.from({ length: zeroCount }, () => 0),
    ...right.map((word) => Number.parseInt(word, 16)),
  ];
}

function formatIPv6Words(words: number[]) {
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xff_ff) {
    const ipv4 = [
      Math.floor(words[6]! / 256),
      words[6]! % 256,
      Math.floor(words[7]! / 256),
      words[7]! % 256,
    ];
    return `::ffff:${ipv4.join(".")}`;
  }

  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < words.length; ) {
    if (words[index] !== 0) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < words.length && words[end] === 0) end += 1;
    if (end - index > bestLength && end - index >= 2) {
      bestStart = index;
      bestLength = end - index;
    }
    index = end;
  }

  const encoded = words.map((word) => word.toString(16));
  if (bestStart < 0) return encoded.join(":");
  const before = encoded.slice(0, bestStart).join(":");
  const after = encoded.slice(bestStart + bestLength).join(":");
  if (before && after) return `${before}::${after}`;
  if (before) return `${before}::`;
  if (after) return `::${after}`;
  return "::";
}

function canonicalIPv6(value: string, prefixLength?: number) {
  let words = parseIPv6Words(value);
  if (prefixLength !== undefined) {
    let numeric = words.reduce(
      (result, word) => result * 65_536n + BigInt(word),
      0n
    );
    const hostBlockSize = 2n ** BigInt(128 - prefixLength);
    numeric = (numeric / hostBlockSize) * hostBlockSize;
    words = Array.from({ length: 8 }, (_, index) => {
      const divisor = 65_536n ** BigInt(7 - index);
      return Number((numeric / divisor) % 65_536n);
    });
  }
  return formatIPv6Words(words);
}

function canonicalIPRule(value: string) {
  const lowerValue = value.toLowerCase();
  if (lowerValue.startsWith("geoip:")) {
    return `geoip:${value.slice("geoip:".length)}`;
  }
  const slash = value.lastIndexOf("/");
  if (slash >= 0) {
    const address = value.slice(0, slash);
    const prefixLength = Number(value.slice(slash + 1));
    return isValidIP(address)
      ? `${ipv4Schema.safeParse(address).success ? canonicalIPv4(address, prefixLength) : canonicalIPv6(address, prefixLength)}/${prefixLength}`
      : value;
  }
  return ipv4Schema.safeParse(value).success
    ? canonicalIPv4(value)
    : canonicalIPv6(value);
}

function canonicalValidRouteRule(kind: RouteRuleKind, value: string) {
  if (kind === "ip") return canonicalIPRule(value);
  if (kind === "protocol") return value.toLowerCase();

  const prefix = prefixOf(value);
  if (!prefix) return `full:${domainWithoutRootDot(value)}`;
  const normalizedPrefix = prefix.toLowerCase();
  const payload = value.slice(prefix.length + 1);
  if (normalizedPrefix === "full") {
    return `full:${domainWithoutRootDot(payload)}`;
  }
  if (normalizedPrefix === "suffix" || normalizedPrefix === "domain") {
    return `domain:${domainWithoutRootDot(payload)}`;
  }
  if (normalizedPrefix === "regex" || normalizedPrefix === "regexp") {
    return `regexp:${payload}`;
  }
  return `${normalizedPrefix}:${payload}`;
}

export function canonicalizeRouteRules(kind: RouteRuleKind, values: string[]) {
  const validate =
    kind === "domain"
      ? validateDomainRule
      : kind === "ip"
        ? validateIPRule
        : validateProtocolRule;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const canonical = validate(value)
      ? value
      : canonicalValidRouteRule(kind, value);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    result.push(canonical);
  }
  return result;
}

export function validateRouteRules(
  kind: RouteRuleKind,
  values: string[]
): RouteRuleIssue[] {
  const validate =
    kind === "domain"
      ? validateDomainRule
      : kind === "ip"
        ? validateIPRule
        : validateProtocolRule;

  const issues = values.flatMap((raw, index) => {
    const value = raw.trim();
    if (!value) return [];
    const validationCode = /\p{Cc}/u.test(value)
      ? "controlCharacter"
      : validate(value);
    const canonical = validationCode
      ? value
      : canonicalValidRouteRule(kind, value);
    const code =
      validationCode ??
      (utf8ByteLength(canonical) > MAX_ROUTE_RULE_BYTES
        ? "ruleTooLong"
        : undefined);
    return code ? [{ code, index, line: index + 1, value }] : [];
  });
  const canonicalValues = canonicalizeRouteRules(kind, values);
  if (canonicalValues.length > MAX_ROUTE_RULES) {
    issues.push({
      code: "tooManyRules",
      index: -1,
      line: 0,
      value: String(MAX_ROUTE_RULES),
    });
  }
  return issues;
}

export function routeRuleListSchema(kind: RouteRuleKind) {
  return z
    .array(z.string())
    .superRefine((values, context) => {
      for (const issue of validateRouteRules(kind, values)) {
        context.addIssue({
          code: "custom",
          message: issue.code,
          path: issue.index < 0 ? [] : [issue.index],
        });
      }
    })
    .transform((values) => canonicalizeRouteRules(kind, values));
}

export const domainRuleListSchema = routeRuleListSchema("domain");
export const ipRuleListSchema = routeRuleListSchema("ip");
export const protocolRuleListSchema = routeRuleListSchema("protocol");
