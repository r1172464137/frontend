import { describe, expect, it } from "vitest";
import {
  canonicalDNSAddress,
  dnsForWrite,
  dnsIsValid,
  validDNSAddress,
} from "./dns-config";
import { editableDNS } from "./node-config-write";

describe("node DNS contract", () => {
  it.each([
    "1.1.1.1",
    "1.1.1.1:53",
    "dns.example.org",
    "dns.example.org:5353",
    "localhost",
    "2001:db8::1",
    "[2001:db8::1]",
    "[2001:db8::1]:53",
  ])("accepts resolver %s", (address) => {
    expect(validDNSAddress(address)).toBe(true);
  });
  it.each([
    "",
    "https://dns.example.org",
    "udp://1.1.1.1",
    "dns.example.org/path",
    "dns.example.org?x=1",
    "user@host",
    "1.1.1.1:",
    "1.1.1.1:0",
    "1.1.1.1:65536",
    "1.1.1.1:-1",
    "1.1.1.1:abc",
    "999.1.1.1",
    "[2001:db8::1]:99999",
    "[2001:db8::1",
    "bad_host",
  ])("rejects resolver %s", (address) => {
    expect(validDNSAddress(address)).toBe(false);
  });
  it("canonicalizes addresses exactly enough to match backend DNS readback", () => {
    expect(canonicalDNSAddress("DNS.Example.COM.:0053")).toBe(
      "dns.example.com.:53"
    );
    expect(canonicalDNSAddress("LOCALHOST:5300")).toBe("localhost.:5300");
    expect(canonicalDNSAddress("fakedns")).toBe("fakedns.");
    expect(canonicalDNSAddress("[2001:0db8::53]")).toBe("2001:db8::53");
    expect(canonicalDNSAddress("[2001:0db8::53]:0053")).toBe(
      "[2001:db8::53]:53"
    );
  });
  it("maps empty legacy protocol to UDP, validates domain rules and clears server_name only in a DNS write", () => {
    const source = [
      {
        proto: "",
        address: " 1.1.1.1:53 ",
        server_name: "legacy.example",
        domains: [" geosite:cn ", "", "geosite:cn", "full:example.com"],
      },
    ];
    const draft = editableDNS(source);
    expect(draft[0]?.proto).toBe("udp");
    expect(draft[0]?.server_name).toBe("legacy.example");
    expect(dnsIsValid(draft)).toBe(true);
    expect(dnsForWrite(draft)).toEqual([
      {
        proto: "udp",
        address: "1.1.1.1:53",
        server_name: "",
        domains: ["geosite:cn", "full:example.com"],
      },
    ]);
    expect(source[0]?.server_name).toBe("legacy.example");
    expect(dnsIsValid([{ ...draft[0]!, domains: ["regexp:("] }])).toBe(false);
    expect(dnsIsValid([{ ...draft[0]!, domains: ["regexp:(?=foo)"] }])).toBe(
      false
    );
    expect(dnsIsValid([{ ...draft[0]!, proto: "tls" }])).toBe(false);
  });
});
