import { describe, expect, it } from "vitest";
import { canonicalDNSAddress, validDNSAddress } from "./dns-config";

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
});
