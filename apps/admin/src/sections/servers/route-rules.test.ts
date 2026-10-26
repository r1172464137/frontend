import { describe, expect, it } from "vitest";
import {
  canonicalizeRouteRules,
  domainRuleListSchema,
  ipRuleListSchema,
  isValidIPOrCIDR,
  normalizeRuleLines,
  protocolRuleListSchema,
  serializedJSONByteLength,
  supportsStructuredRouteRules,
  validateDomainRule,
  validateIPRule,
  validateProtocolRule,
  validateRouteRules,
} from "./route-rules";

describe("structured route-rule parser", () => {
  it.each([
    "example.com",
    "full:example.com",
    "full:example.com.",
    "FULL:example.com",
    "keyword:tracker",
    "suffix:example.com",
    "SuFfIx:example.com.",
    "domain:example.com",
    "DOMAIN:example.com.",
    String.raw`regex:(?i)(^|\.)(tracker|announce)\.`,
    String.raw`regexp:(^|\.)example\.com$`,
    String.raw`regex:\123[[:alpha:]]+`,
    String.raw`regex:\Q(?=literal)\E`,
    String.raw`regex:[()\\1]+`,
    "geosite:category-pt",
    "geosite:category-pt!archived@cn_!",
    "geosite:cn",
  ])("accepts domain rule %s", (value) => {
    expect(validateDomainRule(value)).toBeUndefined();
  });

  it.each([
    ["geoip:private", "domainIpCategory"],
    ["10.0.0.0/8", "domainIpCategory"],
    ["10.0.0.0/33", "domainIpCategory"],
    ["2001:db8::/32", "domainIpCategory"],
    ["full:127.0.0.1", "domainIpCategory"],
    ["domain:10.0.0.0/8", "domainIpCategory"],
    ["suffix:2001:db8::/32", "domainIpCategory"],
    ["bittorrent", "domainProtocolCategory"],
    ["BITTORRENT", "domainProtocolCategory"],
    ["full:bittorrent", "domainProtocolCategory"],
    ["FULL:BitTorrent.", "domainProtocolCategory"],
    ["domain:bittorrent", "domainProtocolCategory"],
    ["suffix:BITTORRENT.", "domainProtocolCategory"],
    ["keyword:tracker phrase", "invalidDomain"],
    ["keyword:tracker\tphrase", "invalidDomain"],
    ["example.com..", "invalidDomain"],
    ["example..com", "invalidDomain"],
    [".example.com", "invalidDomain"],
    ["full:example.com..", "invalidDomain"],
    ["full:example_domain", "invalidDomain"],
    [String.raw`regex:tracker(?=\.example)`, "regexLookaround"],
    [String.raw`regexp:(tracker)\1`, "regexBackreference"],
    ["geosite:", "emptyGeosite"],
    ["geosite:cn@", "emptyGeosite"],
    ["mystery:example.com", "unknownPrefix"],
    ["https://example.com", "unknownPrefix"],
  ])("rejects domain rule %s with a targeted error", (value, code) => {
    expect(validateDomainRule(value)).toBe(code);
  });

  it.each([
    "geoip:private",
    "geoip:private-net",
    "geoip:cn",
    "127.0.0.1",
    "127.0.0.1/32",
    "10.0.0.0/8",
    "172.16.0.0/12",
    "fc00::/7",
    "fe80::/10",
    "2001:db8::1",
  ])("accepts IP rule %s", (value) => {
    expect(validateIPRule(value)).toBeUndefined();
    if (!value.startsWith("geoip:")) expect(isValidIPOrCIDR(value)).toBe(true);
  });

  it.each([
    ["geoip:", "invalidGeoip"],
    ["geoip:../../private", "invalidGeoip"],
    ["geoip:cn.private", "invalidGeoip"],
    ["geoip:cn@private", "invalidGeoip"],
    ["10.0.0.0/33", "invalidIp"],
    ["2001:db8::/129", "invalidIp"],
    ["127.0.0.1:80", "invalidIp"],
    ["geosite:cn", "ipDomainCategory"],
    ["regex:example", "ipDomainCategory"],
    ["mystery:private", "unknownPrefix"],
  ])("rejects IP rule %s with a targeted error", (value, code) => {
    expect(validateIPRule(value)).toBe(code);
  });

  it("only accepts the first-version protocol enum", () => {
    expect(validateProtocolRule("bittorrent")).toBeUndefined();
    expect(validateProtocolRule("BitTorrent")).toBeUndefined();
    expect(validateProtocolRule("unknown-protocol")).toBe(
      "unsupportedProtocol"
    );
  });

  it("canonicalizes prefixes, root dots, aliases, IP prefixes, and protocols before de-duplication", () => {
    expect(
      domainRuleListSchema.parse([
        " ",
        " example.com. ",
        "FULL:example.com",
        "SuFfIx:sub.example.",
        "DOMAIN:sub.example",
        String.raw`regex:^tracker\\.`,
        String.raw`REGEXP:^tracker\\.`,
        "GEOSITE:category-pt",
      ])
    ).toEqual([
      "full:example.com",
      "domain:sub.example",
      String.raw`regexp:^tracker\\.`,
      "geosite:category-pt",
    ]);
    expect(
      ipRuleListSchema.parse([
        "GEOIP:private",
        "10.2.3.4/8",
        "10.0.0.0/8",
        "fc00::1/7",
        "2001:0db8:0:0:0:0:0:1",
      ])
    ).toEqual(["geoip:private", "10.0.0.0/8", "fc00::/7", "2001:db8::1"]);
    expect(protocolRuleListSchema.parse(["BitTorrent", "bittorrent"])).toEqual([
      "bittorrent",
    ]);
  });

  it("uses canonical unique values for limits", () => {
    const aliases = Array.from({ length: 1025 }, (_, index) =>
      index % 2 === 0 ? "example.com." : "FULL:example.com"
    );
    expect(
      validateRouteRules("domain", aliases).some(
        (issue) => issue.code === "tooManyRules"
      )
    ).toBe(false);
    expect(canonicalizeRouteRules("domain", aliases)).toEqual([
      "full:example.com",
    ]);
  });

  it("mirrors backend per-list and per-rule byte limits", () => {
    expect(
      validateRouteRules(
        "domain",
        Array.from({ length: 1025 }, (_, index) => `host-${index}.example`)
      ).some((issue) => issue.code === "tooManyRules")
    ).toBe(true);
    expect(
      validateRouteRules("domain", [`regex:${"x".repeat(4090)}`])[0]?.code
    ).toBe("ruleTooLong");
    expect(
      validateRouteRules(
        "domain",
        Array.from(
          { length: 16 },
          (_, index) => `regex:${"x".repeat(3990)}${index}`
        )
      ).some((issue) => issue.code === "serializedTooLarge")
    ).toBe(true);
  });

  it("measures persisted JSON using Go encoding/json escaping", () => {
    expect(serializedJSONByteLength(["<", ">", "&", "\u2028"])).toBe(37);
  });

  it("trims whitespace, removes blank lines, and de-duplicates in order", () => {
    expect(
      normalizeRuleLines(" example.com \n\n geoip:private\nexample.com\n")
    ).toEqual(["example.com", "geoip:private"]);
  });

  it("gates structured fields using reliable response-shape presence", () => {
    expect(
      supportsStructuredRouteRules({ block_ips: [], block_protocols: [] })
    ).toBe(true);
    expect(supportsStructuredRouteRules({ block: [] })).toBe(false);
    expect(
      supportsStructuredRouteRules({
        block_ips: [],
        block_protocols: undefined,
      })
    ).toBe(true);
  });
});
