import { z } from "zod";
import { validDomainValue } from "./route-rules";

const ipv4 = z.ipv4();
const ipv6 = z.ipv6();

/** Hostname, IPv4 or IPv6, with an optional numeric port (IPv6 ports require brackets). */
export function validDNSAddress(raw: string): boolean {
  const value = raw.trim();
  if (!value || /[\s/\\?#@]/.test(value)) return false;
  if (ipv6.safeParse(value).success) return true;
  let host = value;
  let port: string | undefined;
  if (value.startsWith("[")) {
    const match = /^\[([^\]]+)\](?::(\d+))?$/.exec(value);
    if (!(match && ipv6.safeParse(match[1]).success)) return false;
    host = match[1]!;
    port = match[2];
  } else {
    const match = /^([^:]+)(?::(\d+))?$/.exec(value);
    if (!match) return false;
    host = match[1]!;
    port = match[2];
    if (
      !ipv4.safeParse(host).success &&
      (/^\d+(?:\.\d+){3}$/.test(host) || !validDomainValue(host))
    )
      return false;
  }
  return port === undefined || (Number(port) >= 1 && Number(port) <= 65_535);
}

/** Match backend NormalizeNodeDNS, including IPv6 compression and hostname case. */
export function canonicalDNSAddress(raw: string): string | undefined {
  if (!validDNSAddress(raw)) return;
  const value = raw.trim();
  let host: string;
  let port: string | undefined;
  let isIPv6 = false;
  if (ipv6.safeParse(value).success) {
    host = value;
    isIPv6 = true;
  } else if (value.startsWith("[")) {
    const match = /^\[([^\]]+)\](?::(\d+))?$/.exec(value)!;
    host = match[1]!;
    port = match[2];
    isIPv6 = true;
  } else {
    const match = /^([^:]+)(?::(\d+))?$/.exec(value)!;
    host = match[1]!;
    port = match[2];
  }
  if (isIPv6) {
    try {
      host = new URL(`http://[${host}]/`).hostname.slice(1, -1);
    } catch {
      return;
    }
  } else if (!ipv4.safeParse(host).success) {
    host = host.toLowerCase();
    if (host === "localhost" || host === "fakedns") host += ".";
  }
  if (port !== undefined)
    return `${isIPv6 ? `[${host}]` : host}:${Number(port)}`;
  return host;
}
